import 'dotenv/config';
import { Pool } from 'pg';
import { Kafka, logLevel } from 'kafkajs';
import pino from 'pino';
import { TransactionProcessor } from './processors/transactionProcessor';
import type { ChargeDetailRecord, TransactionEventRequest } from '@ocpp-platform/types';

const logger = pino({ name: 'transaction-service' });

async function main() {
  logger.info('Starting Transaction Service');

  const db = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ocpp',
  });

  const kafka = new Kafka({
    clientId: 'transaction-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });

  const producer = kafka.producer();
  await producer.connect();

  const consumer = kafka.consumer({ groupId: 'transaction-service-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'ocpp.inbound', fromBeginning: false });

  const processor = new TransactionProcessor({
    db,
    onCdrReady: async (cdr: ChargeDetailRecord) => {
      // Emit CDR to billing service via Kafka
      await producer.send({
        topic: 'billing.cdr',
        messages: [{
          key: cdr.stationId,
          value: JSON.stringify(cdr),
        }],
      });
      logger.info({ cdrId: cdr.id, sessionId: cdr.sessionId }, 'CDR emitted to billing');
    },
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const msg = JSON.parse(message.value.toString()) as {
        action: string;
        correlationId: string;
        stationId: string;
        messageId: string;
        payload: Record<string, unknown>;
      };

      if (msg.action !== 'TransactionEvent') return;

      const event = msg.payload as unknown as TransactionEventRequest;
      const tenantId = await getTenantIdForStation(db, msg.stationId);

      const response = await processor.process(msg.stationId, tenantId, event);

      await producer.send({
        topic: 'ocpp.outbound',
        messages: [{
          key: msg.stationId,
          value: JSON.stringify({
            correlationId: msg.correlationId,
            stationId: msg.stationId,
            messageId: msg.messageId,
            payload: response,
          }),
        }],
      });
    },
  });

  logger.info('Transaction Service ready');

  process.on('SIGTERM', async () => {
    await consumer.disconnect();
    await producer.disconnect();
    await db.end();
    process.exit(0);
  });
}

async function getTenantIdForStation(db: Pool, stationId: string): Promise<string> {
  const result = await db.query<{ tenant_id: string }>(
    'SELECT tenant_id FROM stations WHERE id = $1 LIMIT 1',
    [stationId]
  );
  return result.rows[0]?.tenant_id ?? 'default';
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
