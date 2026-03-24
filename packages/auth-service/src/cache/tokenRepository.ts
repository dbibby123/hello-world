import { Pool } from 'pg';
import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'token-repository' });

interface TokenRepositoryConfig {
  postgresUrl: string;
  redisUrl: string;
}

export interface StoredToken {
  id: string;
  driverId: string;
  type: string;
  token: string;
  valid: boolean;
  expiresAt?: Date;
}

const CACHE_TTL = 300; // 5 minutes

/**
 * TokenRepository — two-level cache for driver token lookups.
 *
 * L1: Redis (hot cache, TTL=5min)
 * L2: PostgreSQL (source of truth)
 *
 * On miss: queries PG, writes back to Redis.
 * On token revocation: invalidate Redis key immediately.
 */
export class TokenRepository {
  private db: Pool;
  private redis: Redis;

  constructor(config: TokenRepositoryConfig) {
    this.db = new Pool({ connectionString: config.postgresUrl });
    this.redis = new Redis(config.redisUrl, { lazyConnect: true });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
    // Verify PG connectivity
    const client = await this.db.connect();
    client.release();
    logger.info('TokenRepository connected');
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
    await this.db.end();
  }

  async findToken(token: string, types: string[]): Promise<StoredToken | null> {
    const cacheKey = `token:${token}`;

    // L1: Redis
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      logger.debug({ token }, 'Token cache hit');
      return JSON.parse(cached) as StoredToken;
    }

    // L2: PostgreSQL
    const result = await this.db.query<StoredToken>(
      `SELECT id, driver_id as "driverId", type, token, valid, expires_at as "expiresAt"
       FROM driver_tokens
       WHERE token = $1 AND type = ANY($2::text[])
       LIMIT 1`,
      [token, types]
    );

    if (result.rowCount === 0) return null;

    const row = result.rows[0];
    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(row));
    return row;
  }

  async invalidateToken(token: string): Promise<void> {
    await this.redis.del(`token:${token}`);
  }

  async upsertToken(tokenData: Omit<StoredToken, 'id'>): Promise<StoredToken> {
    const result = await this.db.query<StoredToken>(
      `INSERT INTO driver_tokens (driver_id, type, token, valid, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token) DO UPDATE
         SET valid = EXCLUDED.valid,
             expires_at = EXCLUDED.expires_at
       RETURNING id, driver_id as "driverId", type, token, valid, expires_at as "expiresAt"`,
      [tokenData.driverId, tokenData.type, tokenData.token, tokenData.valid, tokenData.expiresAt]
    );
    await this.invalidateToken(tokenData.token);
    return result.rows[0];
  }
}
