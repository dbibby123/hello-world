import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import pino from 'pino';

const logger = pino({ name: 'api-auth' });

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    tenantId: string;
    role: string;
    email: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';

/**
 * JWT bearer token auth middleware.
 * Tokens issued by Keycloak (OIDC) or internal auth endpoint.
 * Claims include tenantId for multi-tenant data isolation.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authentication token' });
    return;
  }

  const token = header.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      sub: string;
      tenantId: string;
      role: string;
      email: string;
    };

    (req as AuthenticatedRequest).user = {
      id: decoded.sub,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * API key auth for machine-to-machine integrations (webhooks, 3rd party).
 * API keys are stored in the api_keys table with scoped permissions.
 */
export function requireApiKey(db: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      res.status(401).json({ error: 'Missing X-Api-Key header' });
      return;
    }

    const result = await db.query<{ tenant_id: string; scopes: string[] }>(
      `SELECT tenant_id, scopes FROM api_keys
       WHERE key_hash = encode(sha256($1::bytea), 'hex')
         AND revoked = false
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [apiKey]
    );

    if (result.rowCount === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    (req as AuthenticatedRequest).user = {
      id: 'api-key',
      tenantId: result.rows[0].tenant_id,
      role: 'api',
      email: '',
    };
    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
