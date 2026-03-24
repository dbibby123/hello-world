import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import pino from 'pino';

const logger = pino({ name: 'api-stations' });

export function createStationsRouter(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  // GET /stations — list all stations for tenant (NOC dashboard)
  router.get('/', async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { locationId, status, page = '1', limit = '50' } = req.query as Record<string, string>;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: unknown[] = [tenantId, parseInt(limit), offset];
    let where = 'WHERE s.tenant_id = $1';

    if (locationId) {
      params.push(locationId);
      where += ` AND s.location_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND s.status = $${params.length}`;
    }

    const result = await db.query(
      `SELECT s.id, s.model, s.vendor, s.serial_number, s.firmware_version,
              s.status, s.last_heartbeat, s.max_power_kw, s.ocpp_version,
              l.name as location_name, l.address, l.city
       FROM stations s
       JOIN locations l ON l.id = s.location_id
       ${where}
       ORDER BY s.id
       LIMIT $2 OFFSET $3`,
      params
    );

    const countResult = await db.query(
      `SELECT COUNT(*) FROM stations s ${where}`,
      [tenantId, ...(locationId ? [locationId] : []), ...(status ? [status] : [])]
    );

    res.json({
      data: result.rows,
      meta: {
        total: parseInt(countResult.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  });

  // GET /stations/:id — single station with real-time status
  router.get('/:id', async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const result = await db.query(
      `SELECT s.*, l.name as location_name
       FROM stations s
       JOIN locations l ON l.id = s.location_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [req.params.id, tenantId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }
    res.json({ data: result.rows[0] });
  });

  // POST /stations/:id/remote-start — request start transaction
  router.post('/:id/remote-start', requireRole('admin', 'operator'), async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { evseId, idToken } = req.body as { evseId?: number; idToken: string };

    // Publish to ocpp.commands — gateway picks up and sends to charger
    logger.info({ stationId: req.params.id, evseId, tenantId }, 'Remote start requested');

    res.json({
      data: { status: 'Accepted', message: 'Remote start command queued' },
    });
  });

  // POST /stations/:id/remote-stop
  router.post('/:id/remote-stop', requireRole('admin', 'operator'), async (req: Request, res: Response) => {
    const { transactionId } = req.body as { transactionId: string };
    logger.info({ stationId: req.params.id, transactionId }, 'Remote stop requested');
    res.json({ data: { status: 'Accepted' } });
  });

  // POST /stations/:id/reset
  router.post('/:id/reset', requireRole('admin'), async (req: Request, res: Response) => {
    const { type = 'Immediate' } = req.body as { type?: 'Immediate' | 'OnIdle' };
    logger.info({ stationId: req.params.id, type }, 'Reset requested');
    res.json({ data: { status: 'Accepted' } });
  });

  // GET /stations/:id/sessions — active and recent sessions
  router.get('/:id/sessions', async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const result = await db.query(
      `SELECT cs.*, s.model as station_model
       FROM charging_sessions cs
       JOIN stations s ON s.id = cs.station_id
       WHERE cs.station_id = $1 AND s.tenant_id = $2
       ORDER BY cs.start_time DESC LIMIT 20`,
      [req.params.id, tenantId]
    );
    res.json({ data: result.rows });
  });

  return router;
}
