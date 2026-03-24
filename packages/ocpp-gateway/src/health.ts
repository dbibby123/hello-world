import express from 'express';
import { OcppGateway } from './gateway';
import { ConnectionManager } from './connectionManager';
import { createLogger } from './utils/logger';

const logger = createLogger('health');

interface HealthServerConfig {
  port: number;
  gateway: OcppGateway;
  connectionManager: ConnectionManager;
}

export function createHealthServer(config: HealthServerConfig) {
  const app = express();

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/health/ready', async (_req, res) => {
    try {
      const onlineCount = await config.connectionManager.getOnlineCount();
      res.json({
        status: 'ok',
        connectedChargers: config.gateway.connectedCount,
        platformOnline: onlineCount,
      });
    } catch (err) {
      res.status(503).json({ status: 'error', error: String(err) });
    }
  });

  app.get('/metrics', async (_req, res) => {
    const onlineCount = await config.connectionManager.getOnlineCount();
    // Prometheus text format
    res.type('text/plain').send([
      `# HELP ocpp_gateway_connected_chargers Number of chargers connected to this node`,
      `# TYPE ocpp_gateway_connected_chargers gauge`,
      `ocpp_gateway_connected_chargers ${config.gateway.connectedCount}`,
      `# HELP ocpp_platform_online_chargers Total online chargers across all gateway nodes`,
      `# TYPE ocpp_platform_online_chargers gauge`,
      `ocpp_platform_online_chargers ${onlineCount}`,
    ].join('\n'));
  });

  return {
    listen() {
      app.listen(config.port, () => {
        logger.info({ port: config.port }, 'Health server listening');
      });
    },
  };
}
