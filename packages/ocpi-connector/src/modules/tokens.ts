import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'ocpi-tokens' });

/**
 * OCPI 2.2.1 — Tokens Module
 *
 * CPO role: Receive token whitelist pushes from eMSPs (PUSH model)
 * eMSP role: Push driver tokens to CPOs so they can authorize locally
 *
 * Token flow for roaming:
 *   1. Driver signs up with eMSP, gets RFID card linked to their account
 *   2. eMSP pushes token to all connected CPOs via OCPI
 *   3. CPO stores token in auth DB and syncs to charger local lists
 *   4. When driver taps RFID at CPO charger, CPO can authorize locally
 */
export function createTokensRouter(db: Pool): Router {
  const router = Router();

  // eMSP pushes a token to us (CPO)
  router.put('/:countryCode/:partyId/:tokenUid', async (req: Request, res: Response) => {
    const { countryCode, partyId, tokenUid } = req.params;
    const token = req.body as OcpiToken;

    try {
      await db.query(
        `INSERT INTO ocpi_tokens (
          uid, type, contract_id, visual_number, issuer, valid,
          whitelist, country_code, party_id, last_updated
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (uid) DO UPDATE SET
          valid = EXCLUDED.valid,
          whitelist = EXCLUDED.whitelist,
          last_updated = EXCLUDED.last_updated`,
        [
          tokenUid, token.type, token.contract_id, token.visual_number,
          token.issuer, token.valid, token.whitelist,
          countryCode, partyId, token.last_updated,
        ]
      );

      // Also sync to driver_tokens for auth engine
      if (token.valid && token.whitelist !== 'NEVER') {
        await db.query(
          `INSERT INTO driver_tokens (type, token, valid)
           VALUES ($1, $2, $3)
           ON CONFLICT (token) DO UPDATE SET valid = EXCLUDED.valid`,
          [token.type === 'RFID' ? 'ISO14443' : token.type, tokenUid, token.valid]
        );
      }

      res.json(ocpiResponse(null));
    } catch (err) {
      logger.error({ err }, 'Failed to store OCPI token');
      res.status(500).json(ocpiError(3001, 'Storage error'));
    }
  });

  // GET a specific token (eMSP requesting back)
  router.get('/:countryCode/:partyId/:tokenUid', async (req: Request, res: Response) => {
    const { tokenUid } = req.params;
    const result = await db.query(
      'SELECT * FROM ocpi_tokens WHERE uid = $1',
      [tokenUid]
    );
    if (result.rowCount === 0) {
      return res.status(404).json(ocpiError(2004, 'Token not found'));
    }
    res.json(ocpiResponse(result.rows[0]));
  });

  // Authorize a token (PULL model — CPO asks eMSP if token is valid)
  router.post('/:tokenUid/authorize', async (req: Request, res: Response) => {
    const { tokenUid } = req.params;
    const { location_id, evse_uid, connector_id } = req.body as {
      location_id?: string;
      evse_uid?: string;
      connector_id?: string;
    };

    const result = await db.query(
      `SELECT valid FROM ocpi_tokens WHERE uid = $1`,
      [tokenUid]
    );

    if (result.rowCount === 0) {
      return res.json(ocpiResponse({ allowed: 'NOT_ALLOWED', authorization_reference: tokenUid }));
    }

    const token = result.rows[0] as { valid: boolean };
    res.json(ocpiResponse({
      allowed: token.valid ? 'ALLOWED' : 'BLOCKED',
      authorization_reference: `${tokenUid}-${Date.now()}`,
    }));
  });

  return router;
}

interface OcpiToken {
  uid: string;
  type: string;
  contract_id: string;
  visual_number?: string;
  issuer: string;
  valid: boolean;
  whitelist: string;
  last_updated: string;
}

function ocpiResponse(data: unknown) {
  return { data, status_code: 1000, status_message: 'Success', timestamp: new Date().toISOString() };
}

function ocpiError(code: number, message: string) {
  return { status_code: code, status_message: message, timestamp: new Date().toISOString() };
}
