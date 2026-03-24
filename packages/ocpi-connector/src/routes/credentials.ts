import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

const logger = pino({ name: 'ocpi-credentials' });

/**
 * OCPI 2.2.1 — Credentials Module
 *
 * Handles the OCPI handshake / registration between CPO and eMSP.
 *
 * Registration flow:
 * 1. eMSP sends POST /credentials with their token and version URL
 * 2. CPO validates, fetches eMSP's version details & endpoints
 * 3. CPO responds with its own token and endpoint info
 * 4. Both sides store each other's credentials for future API calls
 *
 * Token-based auth:
 * - Each OCPI party pair exchanges bearer tokens
 * - Tokens are stored in ocpi_credentials table
 * - All subsequent requests validated against stored tokens
 */
export function createCredentialsRouter(db: Pool): Router {
  const router = Router();

  router.post('/', async (req: Request, res: Response) => {
    const { token, url, roles } = req.body as {
      token: string;
      url: string;
      roles: Array<{ role: string; country_code: string; party_id: string }>;
    };

    const ourToken = uuidv4().replace(/-/g, '');

    await db.query(
      `INSERT INTO ocpi_credentials (party_id, country_code, token_their, token_ours, version_url, roles)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (party_id, country_code) DO UPDATE SET
         token_their = EXCLUDED.token_their,
         token_ours = EXCLUDED.token_ours,
         version_url = EXCLUDED.version_url`,
      [
        roles[0]?.party_id,
        roles[0]?.country_code,
        token,
        ourToken,
        url,
        JSON.stringify(roles),
      ]
    );

    logger.info({ partyId: roles[0]?.party_id }, 'OCPI credentials registered');

    res.json({
      data: {
        token: ourToken,
        url: `${process.env.OCPI_BASE_URL}/ocpi/2.2.1/versions`,
        roles: [{
          role: 'CPO',
          country_code: process.env.OCPI_COUNTRY_CODE ?? 'US',
          party_id: process.env.OCPI_PARTY_ID ?? 'OPP',
          business_details: {
            name: process.env.OCPI_OPERATOR_NAME ?? 'OCPP Platform',
          },
        }],
      },
      status_code: 1000,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

/**
 * Middleware: validates incoming OCPI requests using bearer token auth.
 * Extracts tenantId from the stored credentials for downstream use.
 */
export function ocpiAuthMiddleware(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Token ')) {
      return res.status(401).json({ status_code: 2010, status_message: 'Unauthorized' });
    }

    const token = authHeader.substring(6);
    const result = await db.query<{ party_id: string; tenant_id: string }>(
      'SELECT party_id, tenant_id FROM ocpi_credentials WHERE token_their = $1',
      [token]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ status_code: 2010, status_message: 'Invalid token' });
    }

    (req as Request & { tenantId?: string; partyId?: string }).tenantId = result.rows[0].tenant_id;
    (req as Request & { tenantId?: string; partyId?: string }).partyId = result.rows[0].party_id;
    next();
  };
}
