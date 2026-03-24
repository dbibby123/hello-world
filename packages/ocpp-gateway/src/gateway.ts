import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from './utils/logger';
import { ConnectionManager } from './connectionManager';
import { KafkaProducer } from './kafka';
import { OcppSessionHandler } from './handlers/sessionHandler';
import { parseOcppMessage, buildCallError } from './utils/ocppMessage';
import type { OcppCall } from '@ocpp-platform/types';

const logger = createLogger('gateway');

export interface GatewayConfig {
  port: number;
  connectionManager: ConnectionManager;
  kafkaProducer: KafkaProducer;
  tlsEnabled?: boolean;
  tlsCertPath?: string;
  tlsKeyPath?: string;
  tlsCaPath?: string;
}

/**
 * OcppGateway — WebSocket server that accepts OCPP 2.x connections from chargers.
 *
 * Each charger connects to: ws(s)://gateway-host/ocpp/{stationId}
 *
 * Architecture notes:
 * - Stateless per-message: session state is stored in Redis (ConnectionManager)
 * - Each incoming OCPP CALL is forwarded to Kafka for async processing
 * - Responses are returned synchronously within the same WS frame
 * - Supports horizontal scaling: multiple gateway pods, sticky sessions via LB
 */
export class OcppGateway {
  readonly port: number;
  private server: http.Server | https.Server;
  private wss: WebSocketServer;
  private connectionManager: ConnectionManager;
  private kafkaProducer: KafkaProducer;
  private activeSessions = new Map<string, OcppSessionHandler>();

  constructor(config: GatewayConfig) {
    this.port = config.port;
    this.connectionManager = config.connectionManager;
    this.kafkaProducer = config.kafkaProducer;

    if (config.tlsEnabled && config.tlsCertPath && config.tlsKeyPath) {
      // Security Profile 2/3: TLS with optional mutual auth (mTLS)
      const tlsOptions: https.ServerOptions = {
        cert: fs.readFileSync(config.tlsCertPath),
        key: fs.readFileSync(config.tlsKeyPath),
        requestCert: !!config.tlsCaPath,
        rejectUnauthorized: !!config.tlsCaPath,
      };
      if (config.tlsCaPath) {
        tlsOptions.ca = fs.readFileSync(config.tlsCaPath);
      }
      this.server = https.createServer(tlsOptions);
    } else {
      // Security Profile 1: plaintext (testing / local dev only)
      this.server = http.createServer();
    }

    this.wss = new WebSocketServer({
      server: this.server,
      // OCPP 2.x requires the 'ocpp2.0.1' or 'ocpp2.1' subprotocol
      handleProtocols: (protocols, _req) => {
        if (protocols.has('ocpp2.1')) return 'ocpp2.1';
        if (protocols.has('ocpp2.0.1')) return 'ocpp2.0.1';
        return false; // reject unknown protocols
      },
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (err) => logger.error({ err }, 'WebSocket server error'));
  }

  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    // Extract stationId from URL path: /ocpp/{stationId}
    const url = req.url ?? '';
    const match = url.match(/\/ocpp\/([^/?#]+)/);
    if (!match) {
      logger.warn({ url }, 'Rejected connection: invalid URL path');
      ws.close(4001, 'Invalid URL: expected /ocpp/{stationId}');
      return;
    }

    const stationId = decodeURIComponent(match[1]);
    const sessionId = uuidv4();
    const ocppVersion = (ws.protocol as '2.0.1' | '2.1') ?? '2.0.1';

    logger.info({ stationId, sessionId, ocppVersion, ip: req.socket.remoteAddress },
      'Charger connected');

    const session = new OcppSessionHandler({
      stationId,
      sessionId,
      ocppVersion,
      ws,
      connectionManager: this.connectionManager,
      kafkaProducer: this.kafkaProducer,
    });

    this.activeSessions.set(stationId, session);

    ws.on('message', async (data) => {
      const raw = data.toString();
      try {
        const message = parseOcppMessage(raw);
        await session.handleMessage(message);
      } catch (err) {
        logger.error({ stationId, err }, 'Failed to handle OCPP message');
        // If we can extract a messageId, return a CALLERROR
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed[0] === 2) {
            const errorFrame = buildCallError(
              parsed[1] as string,
              'InternalError',
              'Message processing failed'
            );
            ws.send(JSON.stringify(errorFrame));
          }
        } catch { /* raw parse failed, nothing to respond */ }
      }
    });

    ws.on('close', async (code, reason) => {
      logger.info({ stationId, code, reason: reason.toString() }, 'Charger disconnected');
      this.activeSessions.delete(stationId);
      await this.connectionManager.removeSession(stationId);
    });

    ws.on('error', (err) => {
      logger.error({ stationId, err }, 'WebSocket error');
    });

    ws.on('ping', () => ws.pong());
  }

  /**
   * Send an OCPP CALL to a charger (for remote commands).
   * Used by backend services via the command channel (Redis pub/sub or Kafka).
   */
  async sendCall(stationId: string, action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const session = this.activeSessions.get(stationId);
    if (!session) {
      throw new Error(`Station ${stationId} is not connected to this gateway node`);
    }
    return session.sendCall(action, payload);
  }

  get connectedCount(): number {
    return this.activeSessions.size;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, resolve);
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) reject(err);
        else this.server.close(() => resolve());
      });
    });
  }
}
