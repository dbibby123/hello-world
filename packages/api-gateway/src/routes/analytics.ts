import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

/**
 * Analytics API — powers the operator NOC dashboard and reporting.
 *
 * Key metrics:
 *   - Total energy delivered (kWh) by station/location/tenant
 *   - Session count, avg duration, avg energy
 *   - Revenue by station/location/period
 *   - Charger uptime % (online time / total time)
 *   - Utilization rate (active charging time / available time)
 *   - Fault frequency by model/vendor
 */
export function createAnalyticsRouter(db: Pool): Router {
  const router = Router();
  router.use(requireAuth);

  // GET /analytics/overview — summary KPIs for tenant
  router.get('/overview', async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { from, to } = req.query as { from?: string; to?: string };

    const dateFrom = from ?? new Date(Date.now() - 30 * 86400_000).toISOString();
    const dateTo = to ?? new Date().toISOString();

    const result = await db.query(
      `SELECT
         COUNT(DISTINCT cs.id) as session_count,
         SUM(cs.energy_delivered_wh) / 1000.0 as total_kwh,
         AVG(cs.energy_delivered_wh) / 1000.0 as avg_kwh_per_session,
         AVG(EXTRACT(EPOCH FROM (cs.end_time - cs.start_time)) / 60) as avg_duration_min,
         SUM(cdr.total_cost) as total_revenue,
         COUNT(DISTINCT cs.station_id) as active_stations
       FROM charging_sessions cs
       JOIN stations s ON s.id = cs.station_id
       LEFT JOIN charge_detail_records cdr ON cdr.session_id = cs.id
       WHERE s.tenant_id = $1
         AND cs.start_time BETWEEN $2 AND $3
         AND cs.status = 'completed'`,
      [tenantId, dateFrom, dateTo]
    );

    const onlineResult = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'online') as online,
         COUNT(*) FILTER (WHERE status = 'faulted') as faulted,
         COUNT(*) FILTER (WHERE status = 'offline') as offline,
         COUNT(*) as total
       FROM stations WHERE tenant_id = $1`,
      [tenantId]
    );

    res.json({
      data: {
        period: { from: dateFrom, to: dateTo },
        sessions: result.rows[0],
        fleet: onlineResult.rows[0],
      },
    });
  });

  // GET /analytics/revenue — revenue breakdown by location
  router.get('/revenue', async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { from, to, groupBy = 'day' } = req.query as {
      from?: string; to?: string; groupBy?: string;
    };

    const dateTrunc = { day: 'day', week: 'week', month: 'month' }[groupBy] ?? 'day';
    const dateFrom = from ?? new Date(Date.now() - 30 * 86400_000).toISOString();
    const dateTo = to ?? new Date().toISOString();

    const result = await db.query(
      `SELECT
         DATE_TRUNC($1, cdr.created_at) as period,
         l.id as location_id,
         l.name as location_name,
         SUM(cdr.total_cost) as revenue,
         COUNT(*) as session_count,
         SUM(cdr.energy_delivered_wh) / 1000.0 as kwh_delivered
       FROM charge_detail_records cdr
       JOIN stations s ON s.id = cdr.station_id
       JOIN locations l ON l.id = s.location_id
       WHERE cdr.tenant_id = $2
         AND cdr.created_at BETWEEN $3 AND $4
       GROUP BY 1, 2, 3
       ORDER BY 1 DESC, 5 DESC`,
      [dateTrunc, tenantId, dateFrom, dateTo]
    );

    res.json({ data: result.rows });
  });

  // GET /analytics/utilization — charger utilization rates
  router.get('/utilization', async (req: Request, res: Response) => {
    const { tenantId } = (req as AuthenticatedRequest).user;
    const { locationId } = req.query as { locationId?: string };

    const params: unknown[] = [tenantId];
    let locationFilter = '';
    if (locationId) {
      params.push(locationId);
      locationFilter = `AND s.location_id = $${params.length}`;
    }

    const result = await db.query(
      `SELECT
         s.id as station_id,
         s.model,
         l.name as location_name,
         COUNT(cs.id) as session_count_30d,
         SUM(cs.energy_delivered_wh) / 1000.0 as kwh_30d,
         AVG(EXTRACT(EPOCH FROM (cs.end_time - cs.start_time)) / 3600) as avg_session_hours,
         SUM(EXTRACT(EPOCH FROM (cs.end_time - cs.start_time))) / (30 * 24 * 3600) * 100 as utilization_pct
       FROM stations s
       JOIN locations l ON l.id = s.location_id
       LEFT JOIN charging_sessions cs ON cs.station_id = s.id
         AND cs.start_time > NOW() - INTERVAL '30 days'
         AND cs.status = 'completed'
       WHERE s.tenant_id = $1 ${locationFilter}
       GROUP BY s.id, s.model, l.name
       ORDER BY utilization_pct DESC NULLS LAST`,
      params
    );

    res.json({ data: result.rows });
  });

  return router;
}
