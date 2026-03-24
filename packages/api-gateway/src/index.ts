import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { Pool } from 'pg';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { createStationsRouter } from './routes/stations';
import { createAnalyticsRouter } from './routes/analytics';

const logger = pino({ name: 'api-gateway' });

async function main() {
  logger.info('Starting API Gateway');

  const db = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ocpp',
    max: 20,
  });

  const app = express();

  // Security headers
  app.use(helmet());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  }));

  // Rate limiting — 1000 req/min per IP (higher for API keys)
  app.use('/api/', rateLimit({
    windowMs: 60_000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger }));

  // API v1 routes
  const v1 = express.Router();

  v1.use('/stations', createStationsRouter(db));
  v1.use('/analytics', createAnalyticsRouter(db));

  // Locations
  v1.get('/locations', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const result = await db.query(
      'SELECT * FROM locations WHERE tenant_id = $1 ORDER BY name',
      [tenantId]
    );
    res.json({ data: result.rows });
  });

  // Sessions (active)
  v1.get('/sessions/active', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const result = await db.query(
      `SELECT cs.*, s.model as station_model, l.name as location_name
       FROM charging_sessions cs
       JOIN stations s ON s.id = cs.station_id
       JOIN locations l ON l.id = s.location_id
       WHERE s.tenant_id = $1 AND cs.status = 'active'
       ORDER BY cs.start_time DESC`,
      [tenantId]
    );
    res.json({ data: result.rows });
  });

  // Tariffs CRUD
  v1.get('/tariffs', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const result = await db.query(
      'SELECT * FROM tariffs WHERE tenant_id = $1 ORDER BY name',
      [tenantId]
    );
    res.json({ data: result.rows });
  });

  v1.post('/tariffs', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const { name, currency, elements } = req.body as {
      name: string;
      currency: string;
      elements: unknown[];
    };
    const result = await db.query(
      `INSERT INTO tariffs (tenant_id, name, currency, elements)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [tenantId, name, currency, JSON.stringify(elements)]
    );
    res.status(201).json({ data: result.rows[0] });
  });

  // Alerts / Faults
  v1.get('/alerts', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const result = await db.query(
      `SELECT * FROM alerts
       WHERE tenant_id = $1 AND resolved = false
       ORDER BY created_at DESC LIMIT 100`,
      [tenantId]
    );
    res.json({ data: result.rows });
  });

  // Smart charging — manual profile assignment
  v1.post('/smart-charging/profiles', async (req, res) => {
    const { stationId, evseId, profile } = req.body as {
      stationId: string;
      evseId: number;
      profile: unknown;
    };
    // Publish to Kafka for smart-charging service to apply
    res.json({ data: { status: 'queued', stationId, evseId } });
  });

  // Driver management
  v1.get('/drivers', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const result = await db.query(
      `SELECT d.id, d.email, d.loyalty_points, d.created_at,
              COUNT(dt.id) as token_count
       FROM drivers d
       JOIN driver_tokens dt ON dt.driver_id = d.id
       GROUP BY d.id ORDER BY d.created_at DESC LIMIT 100`
    );
    res.json({ data: result.rows });
  });

  // Firmware management
  v1.post('/stations/:id/firmware', async (req, res) => {
    const { firmwareUrl, scheduleAt } = req.body as {
      firmwareUrl: string;
      scheduleAt?: string;
    };
    logger.info({ stationId: req.params.id, firmwareUrl }, 'Firmware update requested');
    res.json({ data: { status: 'queued', stationId: req.params.id } });
  });

  // Reservations
  v1.post('/reservations', async (req, res) => {
    const { stationId, evseId, idToken, expiryDateTime } = req.body as {
      stationId: string;
      evseId: number;
      idToken: string;
      expiryDateTime: string;
    };
    const result = await db.query(
      `INSERT INTO reservations (station_id, evse_id, id_token, expiry_date_time, status)
       VALUES ($1,$2,$3,$4,'active')
       RETURNING *`,
      [stationId, evseId, idToken, expiryDateTime]
    );
    res.status(201).json({ data: result.rows[0] });
  });

  // Webhooks config
  v1.get('/webhooks', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const result = await db.query(
      'SELECT id, url, events, active, created_at FROM webhooks WHERE tenant_id = $1',
      [tenantId]
    );
    res.json({ data: result.rows });
  });

  v1.post('/webhooks', async (req, res) => {
    const tenantId = (req as any).user?.tenantId;
    const { url, events, secret } = req.body as {
      url: string;
      events: string[];
      secret: string;
    };
    const result = await db.query(
      `INSERT INTO webhooks (tenant_id, url, events, secret_hash)
       VALUES ($1,$2,$3,encode(sha256($4::bytea),'hex'))
       RETURNING id, url, events, active`,
      [tenantId, url, events, secret]
    );
    res.status(201).json({ data: result.rows[0] });
  });

  app.use('/api/v1', v1);

  // Health
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // OpenAPI spec pointer
  app.get('/docs', (_req, res) => {
    res.json({
      message: 'API documentation available at /api/v1/openapi.json',
      version: '1.0.0',
    });
  });

  const port = parseInt(process.env.API_PORT ?? '3001');
  app.listen(port, () => logger.info({ port }, 'API Gateway listening'));

  process.on('SIGTERM', async () => {
    await db.end();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
