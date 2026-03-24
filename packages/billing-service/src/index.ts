import 'dotenv/config';
import { Pool } from 'pg';
import { Kafka, logLevel } from 'kafkajs';
import pino from 'pino';
import { TariffEngine } from './pricing/tariffEngine';
import { StripeProcessor } from './payment/stripeProcessor';
import { CdrService } from './cdr/cdrService';
import type { ChargeDetailRecord } from '@ocpp-platform/types';

const logger = pino({ name: 'billing-service' });

async function main() {
  logger.info('Starting Billing Service');

  const db = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ocpp',
  });

  const tariffEngine = new TariffEngine();

  const stripeProcessor = new StripeProcessor(
    process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder'
  );

  const cdrService = new CdrService({ db, tariffEngine, stripeProcessor });

  const kafka = new Kafka({
    clientId: 'billing-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });

  const producer = kafka.producer();
  await producer.connect();

  const consumer = kafka.consumer({ groupId: 'billing-service-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'billing.cdr', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const cdr = JSON.parse(message.value.toString()) as ChargeDetailRecord;

      try {
        await cdrService.processCdr(cdr);

        // Notify driver / operator
        await producer.send({
          topic: 'notifications.session-complete',
          messages: [{
            key: cdr.sessionId,
            value: JSON.stringify({
              type: 'SESSION_COMPLETE',
              sessionId: cdr.sessionId,
              stationId: cdr.stationId,
              energyKwh: (cdr.energyDeliveredWh / 1000).toFixed(2),
              cost: cdr.totalCost,
              currency: cdr.currency,
            }),
          }],
        });
      } catch (err) {
        logger.error({ cdrId: cdr.id, err }, 'Failed to process CDR');
        // In production: send to DLQ for retry
      }
    },
  });

  logger.info('Billing Service ready — consuming billing.cdr');

  process.on('SIGTERM', async () => {
    await consumer.disconnect();
    await producer.disconnect();
    await db.end();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
