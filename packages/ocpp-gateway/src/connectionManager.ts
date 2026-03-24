import Redis from 'ioredis';
import { createLogger } from './utils/logger';
import type { ConnectorStatus } from '@ocpp-platform/types';

const logger = createLogger('connection-manager');

export interface ConnectionManagerConfig {
  redisUrl: string;
  nodeId: string;
}

export interface ChargerSession {
  stationId: string;
  sessionId: string;
  nodeId: string;
  ocppVersion: '2.0.1' | '2.1';
  model: string;
  vendor: string;
  firmwareVersion?: string;
  connectedAt: string;
}

type PendingResponse = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
};

/**
 * ConnectionManager — Redis-backed session registry.
 *
 * Stores the mapping of stationId → gateway node so that:
 * 1. Any backend service can look up which gateway node holds a charger's WS connection
 * 2. Commands directed at a specific charger are routed to the correct node
 * 3. Real-time connector status is accessible platform-wide without a DB query
 *
 * Redis key schema:
 *   session:{stationId}          HASH  — session metadata
 *   heartbeat:{stationId}        STRING (timestamp)
 *   connector:{stationId}:{evseId}:{connectorId}  STRING (ConnectorStatus)
 *   pending:{correlationId}      — in-process call tracking (in-memory only)
 */
export class ConnectionManager {
  private redis: Redis;
  private nodeId: string;
  private pendingResponses = new Map<string, PendingResponse>();

  private static readonly SESSION_TTL = 3600;       // 1 hour — renewed on heartbeat
  private static readonly HEARTBEAT_TTL = 600;      // 10 min — detect stale connections

  constructor(config: ConnectionManagerConfig) {
    this.redis = new Redis(config.redisUrl, {
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });
    this.nodeId = config.nodeId;

    this.redis.on('error', (err) => logger.error({ err }, 'Redis error'));
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }

  // ─── Session Lifecycle ───────────────────────────────────────────────────

  async registerSession(session: ChargerSession): Promise<void> {
    const key = `session:${session.stationId}`;
    await this.redis.hset(key, {
      stationId: session.stationId,
      sessionId: session.sessionId,
      nodeId: session.nodeId,
      ocppVersion: session.ocppVersion,
      model: session.model,
      vendor: session.vendor,
      firmwareVersion: session.firmwareVersion ?? '',
      connectedAt: session.connectedAt,
    });
    await this.redis.expire(key, ConnectionManager.SESSION_TTL);
    logger.debug({ stationId: session.stationId, nodeId: session.nodeId }, 'Session registered');
  }

  async removeSession(stationId: string): Promise<void> {
    await this.redis.del(`session:${stationId}`);
    logger.debug({ stationId }, 'Session removed');
  }

  async getSession(stationId: string): Promise<ChargerSession | null> {
    const data = await this.redis.hgetall(`session:${stationId}`);
    if (!data || !data.stationId) return null;
    return data as unknown as ChargerSession;
  }

  async getNodeForStation(stationId: string): Promise<string | null> {
    return this.redis.hget(`session:${stationId}`, 'nodeId');
  }

  // ─── Heartbeat Tracking ──────────────────────────────────────────────────

  async updateHeartbeat(stationId: string): Promise<void> {
    const key = `heartbeat:${stationId}`;
    await this.redis.setex(key, ConnectionManager.HEARTBEAT_TTL, new Date().toISOString());
    // Renew session TTL
    await this.redis.expire(`session:${stationId}`, ConnectionManager.SESSION_TTL);
  }

  async getLastHeartbeat(stationId: string): Promise<string | null> {
    return this.redis.get(`heartbeat:${stationId}`);
  }

  // ─── Connector Status ─────────────────────────────────────────────────────

  async updateConnectorStatus(
    stationId: string,
    evseId: number,
    connectorId: number,
    status: ConnectorStatus
  ): Promise<void> {
    const key = `connector:${stationId}:${evseId}:${connectorId}`;
    await this.redis.set(key, status);
    await this.redis.expire(key, ConnectionManager.SESSION_TTL);
  }

  async getConnectorStatus(
    stationId: string,
    evseId: number,
    connectorId: number
  ): Promise<ConnectorStatus | null> {
    const value = await this.redis.get(`connector:${stationId}:${evseId}:${connectorId}`);
    return value as ConnectorStatus | null;
  }

  // ─── Platform-wide Station Availability ──────────────────────────────────

  /**
   * Returns all online station IDs. Used for NOC dashboard and smart charging.
   * Leverages Redis SCAN to avoid blocking the server.
   */
  async getOnlineStationIds(): Promise<string[]> {
    const stationIds: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor, 'MATCH', 'session:*', 'COUNT', 100
      );
      cursor = nextCursor;
      for (const key of keys) {
        stationIds.push(key.replace('session:', ''));
      }
    } while (cursor !== '0');
    return stationIds;
  }

  async getOnlineCount(): Promise<number> {
    const ids = await this.getOnlineStationIds();
    return ids.length;
  }

  // ─── Pending Response Registry (for forwardToService pattern) ────────────

  registerPendingResponse(correlationId: string, pending: PendingResponse): void {
    this.pendingResponses.set(correlationId, pending);
  }

  removePendingResponse(correlationId: string): void {
    this.pendingResponses.delete(correlationId);
  }

  resolveResponse(correlationId: string, payload: Record<string, unknown>): void {
    const pending = this.pendingResponses.get(correlationId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingResponses.delete(correlationId);
    pending.resolve(payload);
  }
}
