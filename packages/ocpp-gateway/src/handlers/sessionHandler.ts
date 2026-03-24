import { WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { ConnectionManager } from '../connectionManager';
import { KafkaProducer } from '../kafka';
import { buildCallResult, buildCallError } from '../utils/ocppMessage';
import type {
  OcppMessage, OcppCall, OcppCallResult, OcppCallError,
  BootNotificationRequest, BootNotificationResponse,
  HeartbeatResponse,
  StatusNotificationRequest,
  AuthorizeRequest, AuthorizeResponse,
  TransactionEventRequest, TransactionEventResponse,
} from '@ocpp-platform/types';

const logger = createLogger('session-handler');

// Pending response callbacks for outgoing CALLs (remote commands)
type PendingCall = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
};

export interface SessionHandlerConfig {
  stationId: string;
  sessionId: string;
  ocppVersion: '2.0.1' | '2.1';
  ws: WebSocket;
  connectionManager: ConnectionManager;
  kafkaProducer: KafkaProducer;
}

/**
 * OcppSessionHandler — manages one charger's WebSocket session.
 *
 * Responsibilities:
 * 1. Parse incoming OCPP messages (CALL / CALLRESULT / CALLERROR)
 * 2. Handle core protocol messages inline (BootNotification, Heartbeat, StatusNotification)
 * 3. Forward domain messages to Kafka for async processing by microservices
 * 4. Manage pending call map for outgoing remote commands
 */
export class OcppSessionHandler {
  private stationId: string;
  private sessionId: string;
  private ocppVersion: '2.0.1' | '2.1';
  private ws: WebSocket;
  private connectionManager: ConnectionManager;
  private kafkaProducer: KafkaProducer;
  private pendingCalls = new Map<string, PendingCall>();
  private isRegistered = false;

  private static readonly CALL_TIMEOUT_MS = 30_000;

  constructor(config: SessionHandlerConfig) {
    this.stationId = config.stationId;
    this.sessionId = config.sessionId;
    this.ocppVersion = config.ocppVersion;
    this.ws = config.ws;
    this.connectionManager = config.connectionManager;
    this.kafkaProducer = config.kafkaProducer;
  }

  async handleMessage(message: OcppMessage): Promise<void> {
    const [typeId] = message;

    switch (typeId) {
      case 2: return this.handleCall(message as OcppCall);
      case 3: return this.handleCallResult(message as OcppCallResult);
      case 4: return this.handleCallError(message as OcppCallError);
    }
  }

  // ─── Incoming CALL from charger ──────────────────────────────────────────

  private async handleCall(message: OcppCall): Promise<void> {
    const [, messageId, action, payload] = message;

    logger.debug({ stationId: this.stationId, action, messageId }, 'Received CALL');

    try {
      switch (action) {
        case 'BootNotification':
          await this.handleBootNotification(messageId, payload as unknown as BootNotificationRequest);
          break;
        case 'Heartbeat':
          await this.handleHeartbeat(messageId);
          break;
        case 'StatusNotification':
          await this.handleStatusNotification(messageId, payload as unknown as StatusNotificationRequest);
          break;
        case 'Authorize':
          await this.forwardToService(messageId, action, payload);
          break;
        case 'TransactionEvent':
          await this.forwardToService(messageId, action, payload);
          break;
        case 'MeterValues':
          await this.forwardToService(messageId, action, payload);
          break;
        case 'FirmwareStatusNotification':
          await this.forwardToService(messageId, action, payload);
          break;
        case 'LogStatusNotification':
          await this.forwardToService(messageId, action, payload);
          break;
        case 'SecurityEventNotification':
          await this.forwardToService(messageId, action, payload);
          break;
        case 'NotifyReport':
          await this.forwardToService(messageId, action, payload);
          break;
        case 'NotifyEvent':
          await this.forwardToService(messageId, action, payload);
          break;
        default:
          logger.warn({ stationId: this.stationId, action }, 'Unknown OCPP action');
          this.sendFrame(buildCallError(messageId, 'NotImplemented', `Action ${action} not implemented`));
      }
    } catch (err) {
      logger.error({ stationId: this.stationId, action, err }, 'Error handling CALL');
      this.sendFrame(buildCallError(messageId, 'InternalError', 'Internal server error'));
    }
  }

  // ─── Core Protocol Handlers (inline — no Kafka roundtrip) ───────────────

  private async handleBootNotification(
    messageId: string,
    payload: BootNotificationRequest
  ): Promise<void> {
    const response: BootNotificationResponse = {
      currentTime: new Date().toISOString(),
      interval: parseInt(process.env.HEARTBEAT_INTERVAL ?? '300'),
      status: 'Accepted',
    };

    // Register charger in connection manager
    await this.connectionManager.registerSession({
      stationId: this.stationId,
      sessionId: this.sessionId,
      nodeId: process.env.NODE_ID ?? 'gateway-local',
      ocppVersion: this.ocppVersion,
      model: payload.chargingStation.model,
      vendor: payload.chargingStation.vendorName,
      firmwareVersion: payload.chargingStation.firmwareVersion,
      connectedAt: new Date().toISOString(),
    });

    this.isRegistered = true;

    // Publish boot event for platform to update charger record
    await this.kafkaProducer.publish('ocpp.boot', {
      stationId: this.stationId,
      sessionId: this.sessionId,
      ocppVersion: this.ocppVersion,
      payload,
      timestamp: new Date().toISOString(),
    });

    this.sendFrame(buildCallResult(messageId, response));
    logger.info({ stationId: this.stationId, status: 'Accepted' }, 'BootNotification handled');
  }

  private async handleHeartbeat(messageId: string): Promise<void> {
    const response: HeartbeatResponse = {
      currentTime: new Date().toISOString(),
    };

    await this.connectionManager.updateHeartbeat(this.stationId);
    this.sendFrame(buildCallResult(messageId, response));
  }

  private async handleStatusNotification(
    messageId: string,
    payload: StatusNotificationRequest
  ): Promise<void> {
    // Update connector status in Redis for real-time availability
    await this.connectionManager.updateConnectorStatus(
      this.stationId,
      payload.evseId,
      payload.connectorId,
      payload.connectorStatus
    );

    // Publish for NOC dashboard and webhooks
    await this.kafkaProducer.publish('ocpp.status', {
      stationId: this.stationId,
      evseId: payload.evseId,
      connectorId: payload.connectorId,
      status: payload.connectorStatus,
      timestamp: payload.timestamp,
    });

    this.sendFrame(buildCallResult(messageId, {}));
  }

  /**
   * Forward domain messages (Authorize, TransactionEvent, MeterValues) to
   * Kafka for processing by the relevant microservice. Wait synchronously for
   * the response via a reply topic with a correlation ID.
   */
  private async forwardToService(
    messageId: string,
    action: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const correlationId = uuidv4();

    await this.kafkaProducer.publish('ocpp.inbound', {
      correlationId,
      stationId: this.stationId,
      sessionId: this.sessionId,
      messageId,
      action,
      payload,
      timestamp: new Date().toISOString(),
    });

    // Response is returned via ocpp.outbound topic, consumed by gateway
    // The gateway's Kafka consumer resolves the pending promise
    const responsePayload = await this.waitForServiceResponse(correlationId);
    this.sendFrame(buildCallResult(messageId, responsePayload));
  }

  private waitForServiceResponse(correlationId: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.connectionManager.removePendingResponse(correlationId);
        reject(new Error(`Timeout waiting for service response (correlationId=${correlationId})`));
      }, OcppSessionHandler.CALL_TIMEOUT_MS);

      this.connectionManager.registerPendingResponse(correlationId, { resolve, reject, timeout });
    });
  }

  // ─── Incoming CALLRESULT / CALLERROR (responses to our remote commands) ──

  private handleCallResult(message: OcppCallResult): void {
    const [, messageId, payload] = message;
    const pending = this.pendingCalls.get(messageId);
    if (!pending) {
      logger.warn({ stationId: this.stationId, messageId }, 'Received CALLRESULT for unknown messageId');
      return;
    }
    clearTimeout(pending.timeout);
    this.pendingCalls.delete(messageId);
    pending.resolve(payload);
  }

  private handleCallError(message: OcppCallError): void {
    const [, messageId, errorCode, errorDescription] = message;
    const pending = this.pendingCalls.get(messageId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pendingCalls.delete(messageId);
    pending.reject(new Error(`OCPP Error ${errorCode}: ${errorDescription}`));
  }

  // ─── Outgoing CALL to charger (remote commands) ──────────────────────────

  async sendCall(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const messageId = uuidv4();
    const frame: OcppCall = [2, messageId, action, payload];

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(messageId);
        reject(new Error(`Timeout waiting for charger response to ${action}`));
      }, OcppSessionHandler.CALL_TIMEOUT_MS);

      this.pendingCalls.set(messageId, { resolve, reject, timeout });
      this.sendFrame(frame);
    });
  }

  private sendFrame(frame: unknown[]): void {
    if (this.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ stationId: this.stationId }, 'Cannot send: WebSocket not open');
      return;
    }
    this.ws.send(JSON.stringify(frame));
  }
}
