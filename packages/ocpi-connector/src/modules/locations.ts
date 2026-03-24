import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'ocpi-locations' });

/**
 * OCPI 2.2.1 — Locations Module (CPO role)
 *
 * Exposes real-time charger availability to roaming eMSPs.
 * eMSPs call GET /ocpi/cpo/2.2.1/locations to discover locations,
 * EVSEs, and connectors with real-time status.
 *
 * OCPI Location object maps to our internal Location + Station + EVSE model.
 */
export function createLocationsRouter(db: Pool): Router {
  const router = Router();

  // GET all locations (paginated)
  router.get('/', async (req: Request, res: Response) => {
    const limit = parseInt(req.query['limit'] as string ?? '100');
    const offset = parseInt(req.query['offset'] as string ?? '0');
    const dateFrom = req.query['date_from'] as string;
    const dateTo = req.query['date_to'] as string;

    try {
      let query = `
        SELECT l.id, l.name, l.address, l.city, l.country,
               l.coordinates->>'lat' as lat, l.coordinates->>'lng' as lng,
               json_agg(
                 json_build_object(
                   'uid', s.id,
                   'status', CASE WHEN s.status = 'online' THEN 'AVAILABLE'
                                  WHEN s.status = 'faulted' THEN 'INOPERATIVE'
                                  ELSE 'UNKNOWN' END,
                   'evses', (
                     SELECT json_agg(json_build_object(
                       'uid', e.uid,
                       'evse_id', l.country || '*' || l.id || '*E' || e.id,
                       'status', e.status,
                       'connectors', e.connectors
                     ))
                     FROM evses e WHERE e.station_id = s.id
                   )
                 )
               ) as evses
        FROM locations l
        JOIN stations s ON s.location_id = l.id
        WHERE l.tenant_id = $1
      `;
      const params: unknown[] = [getTenantId(req)];

      if (dateFrom) {
        params.push(dateFrom);
        query += ` AND l.updated_at >= $${params.length}`;
      }

      query += ` GROUP BY l.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await db.query(query, params);

      res.set('X-Total-Count', result.rowCount?.toString() ?? '0');
      res.json(ocpiResponse(result.rows.map(mapLocationToOcpi)));
    } catch (err) {
      logger.error({ err }, 'Failed to get locations');
      res.status(500).json(ocpiError(3001, 'Database error'));
    }
  });

  // GET single location
  router.get('/:locationId', async (req: Request, res: Response) => {
    const { locationId } = req.params;
    const result = await db.query(
      'SELECT * FROM locations WHERE id = $1 AND tenant_id = $2',
      [locationId, getTenantId(req)]
    );
    if (result.rowCount === 0) {
      return res.status(404).json(ocpiError(2003, 'Location not found'));
    }
    res.json(ocpiResponse(mapLocationToOcpi(result.rows[0])));
  });

  return router;
}

function mapLocationToOcpi(row: Record<string, unknown>) {
  return {
    country_code: row.country,
    party_id: row.tenant_id,
    id: row.id,
    publish: true,
    name: row.name,
    address: row.address,
    city: row.city,
    country: row.country,
    coordinates: { latitude: String(row.lat), longitude: String(row.lng) },
    evses: row.evses ?? [],
    last_updated: row.updated_at,
  };
}

function getTenantId(req: Request): string {
  // Extracted from OCPI credentials middleware
  return (req as Request & { tenantId?: string }).tenantId ?? 'default';
}

function ocpiResponse(data: unknown) {
  return {
    data,
    status_code: 1000,
    status_message: 'Success',
    timestamp: new Date().toISOString(),
  };
}

function ocpiError(code: number, message: string) {
  return {
    status_code: code,
    status_message: message,
    timestamp: new Date().toISOString(),
  };
}
