import 'dotenv/config';
import { Kafka, logLevel } from 'kafkajs';
import pino from 'pino';
import { MeterValueProcessor } from './processors/meterValueProcessor';
import type { TransactionEventRequest } from '@ocpp-platform/types';

const logger = pino({ name: 'meter-service' });

async function main() {
  logger.info('Starting Meter Service');

  const processor = new MeterValueProcessor({
    influxUrl: process.env.INFLUX_URL ?? 'http://localhost:8086',
    influxToken: process.env.INFLUX_TOKEN ?? 'dev-token',
    influxOrg: process.env.INFLUX_ORG ?? 'ocpp-platform',
    influxBucket: process.env.INFLUX_BUCKET ?? 'meter-values',
  });

  const kafka = new Kafka({
    clientId: 'meter-service',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });

  const consumer = kafka.consumer({ groupId: 'meter-service-group' });
  await consumer.connect();

  // Consume both standalone MeterValues AND TransactionEvents (which carry meter data)
  await consumer.subscribe({ topic: 'ocpp.inbound', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      const msg = JSON.parse(message.value.toString()) as {
        action: string;
        stationId: string;
        payload: Record<string, unknown>;
      };

      if (msg.action === 'MeterValues') {
        const { evseId, meterValue } = msg.payload as {
          evseId: number;
          meterValue: TransactionEventRequest['meterValue'];
        };
        await processor.processMeterValues(
          msg.stationId, 'default', evseId, 1, undefined, meterValue ?? []
        );
      } else if (msg.action === 'TransactionEvent') {
        const event = msg.payload as unknown as TransactionEventRequest;
        if (event.meterValue && event.meterValue.length > 0) {
          await processor.processMeterValues(
            msg.stationId, 'default',
            event.evse?.id ?? 1,
            event.evse?.connectorId ?? 1,
            event.transactionInfo.transactionId,
            event.meterValue
          );
        }
      }
    },
  });

  logger.info('Meter Service ready — consuming ocpp.inbound');

  process.on('SIGTERM', async () => {
    await consumer.disconnect();
    await processor.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
