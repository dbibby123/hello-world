import 'dotenv/config';
import { createLogger } from './utils/logger';
import { OcppGateway } from './gateway';
import { ConnectionManager } from './connectionManager';
import { KafkaProducer } from './kafka';
import { createHealthServer } from './health';

const logger = createLogger('bootstrap');

async function main() {
  logger.info({ version: '2.0.1' }, 'Starting OCPP Gateway');

  const connectionManager = new ConnectionManager({
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    nodeId: process.env.NODE_ID ?? `gateway-${process.pid}`,
  });

  await connectionManager.connect();
  logger.info('Connection manager connected to Redis');

  const kafkaProducer = new KafkaProducer({
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    clientId: `ocpp-gateway-${process.env.NODE_ID ?? process.pid}`,
  });

  await kafkaProducer.connect();
  logger.info('Kafka producer connected');

  const gateway = new OcppGateway({
    port: parseInt(process.env.GATEWAY_PORT ?? '9000'),
    connectionManager,
    kafkaProducer,
    tlsEnabled: process.env.TLS_ENABLED === 'true',
    tlsCertPath: process.env.TLS_CERT_PATH,
    tlsKeyPath: process.env.TLS_KEY_PATH,
    tlsCaPath: process.env.TLS_CA_PATH,
  });

  await gateway.start();
  logger.info({ port: gateway.port }, 'OCPP Gateway listening');

  // Health check HTTP server (for Kubernetes liveness/readiness probes)
  const healthServer = createHealthServer({
    port: parseInt(process.env.HEALTH_PORT ?? '9001'),
    gateway,
    connectionManager,
  });
  healthServer.listen();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await gateway.stop();
    await kafkaProducer.disconnect();
    await connectionManager.disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal error during startup', err);
  process.exit(1);
});
