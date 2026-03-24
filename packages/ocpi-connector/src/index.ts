import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createLocationsRouter } from './modules/locations';
import { createTokensRouter } from './modules/tokens';
import { createCredentialsRouter, ocpiAuthMiddleware } from './routes/credentials';

const logger = pino({ name: 'ocpi-connector' });

async function main() {
  logger.info('Starting OCPI Connector');

  const db = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ocpp',
  });

  const app = express();
  app.use(express.json());
  app.use(pinoHttp({ logger }));

  const BASE = '/ocpi/cpo/2.2.1';

  // Version discovery (unauthenticated)
  app.get('/ocpi/2.2.1/versions', (_req, res) => {
    res.json({
      data: [{
        version: '2.2.1',
        url: `${process.env.OCPI_BASE_URL}${BASE}`,
      }],
      status_code: 1000,
      timestamp: new Date().toISOString(),
    });
  });

  // Version details — lists available modules and endpoints
  app.get(`${BASE}`, (_req, res) => {
    const base = `${process.env.OCPI_BASE_URL}${BASE}`;
    res.json({
      data: {
        version: '2.2.1',
        endpoints: [
          { identifier: 'credentials', role: 'CPO', url: `${base}/credentials` },
          { identifier: 'locations',   role: 'CPO', url: `${base}/locations` },
          { identifier: 'sessions',    role: 'CPO', url: `${base}/sessions` },
          { identifier: 'cdrs',        role: 'CPO', url: `${base}/cdrs` },
          { identifier: 'tariffs',     role: 'CPO', url: `${base}/tariffs` },
          { identifier: 'tokens',      role: 'CPO', url: `${base}/tokens` },
          { identifier: 'commands',    role: 'CPO', url: `${base}/commands` },
        ],
      },
      status_code: 1000,
      timestamp: new Date().toISOString(),
    });
  });

  // Credentials (no auth required for initial handshake)
  app.use(`${BASE}/credentials`, createCredentialsRouter(db));

  // All other modules require OCPI token auth
  app.use(ocpiAuthMiddleware(db));
  app.use(`${BASE}/locations`, createLocationsRouter(db));
  app.use(`${BASE}/tokens`, createTokensRouter(db));

  // CDRs module — push completed CDRs to eMSPs
  app.get(`${BASE}/cdrs`, async (req, res) => {
    const dateFrom = req.query['date_from'] as string;
    const result = await db.query(
      `SELECT * FROM charge_detail_records
       WHERE tenant_id = $1
         AND ($2::timestamptz IS NULL OR created_at >= $2)
       ORDER BY created_at DESC LIMIT 100`,
      [(req as any).tenantId, dateFrom ?? null]
    );
    res.json({ data: result.rows, status_code: 1000, timestamp: new Date().toISOString() });
  });

  const port = parseInt(process.env.OCPI_PORT ?? '3002');
  app.listen(port, () => logger.info({ port }, 'OCPI Connector listening'));

  process.on('SIGTERM', async () => {
    await db.end();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
