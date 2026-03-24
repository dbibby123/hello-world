import 'dotenv/config';
import pino from 'pino';
import { AuthorizationEngine } from './authEngine';
import { TokenRepository } from './cache/tokenRepository';
import { LocalAuthListSync } from './cache/localAuthListSync';
import { OcspValidator } from './providers/ocspValidator';
import { KafkaConsumer, KafkaProducer } from './kafka';

const logger = pino({ name: 'auth-service' });

async function main() {
  logger.info('Starting Authorization Service');

  const tokenRepo = new TokenRepository({
    postgresUrl: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ocpp',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  });
  await tokenRepo.connect();

  const ocspValidator = new OcspValidator();

  const localAuthListSync = new LocalAuthListSync({ tokenRepo });

  const authEngine = new AuthorizationEngine({
    tokenRepo,
    ocspValidator,
    localAuthListSync,
  });

  const producer = new KafkaProducer({
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: 'auth-service',
  });
  await producer.connect();

  const consumer = new KafkaConsumer({
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: 'auth-service',
    groupId: 'auth-service-group',
  });
  await consumer.connect();
  await consumer.subscribe(['ocpp.inbound']);

  await consumer.run(async (topic, message) => {
    if (message.action !== 'Authorize') return;

    const { correlationId, stationId, messageId, payload } = message as {
      correlationId: string;
      stationId: string;
      messageId: string;
      payload: Record<string, unknown>;
    };

    logger.debug({ stationId, correlationId }, 'Processing Authorize request');

    const response = await authEngine.authorize(stationId, payload);

    await producer.publish('ocpp.outbound', {
      correlationId,
      stationId,
      messageId,
      payload: response,
    });
  });

  logger.info('Authorization Service ready — consuming ocpp.inbound');

  process.on('SIGTERM', async () => {
    await consumer.disconnect();
    await producer.disconnect();
    await tokenRepo.disconnect();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
