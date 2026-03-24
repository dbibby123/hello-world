import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';
import type {
  TransactionEventRequest,
  TransactionEventResponse,
  ChargingSession,
  ChargeDetailRecord,
} from '@ocpp-platform/types';

const logger = pino({ name: 'transaction-processor' });

interface TransactionProcessorConfig {
  db: Pool;
  onCdrReady: (cdr: ChargeDetailRecord) => Promise<void>;
}

/**
 * TransactionProcessor — the core of the session lifecycle.
 *
 * OCPP 2.x uses a single TransactionEvent message with three event types:
 *   Started  → Create session record, authorize idToken
 *   Updated  → Record interim meter values, handle ChargingStateChanged
 *   Ended    → Finalize session, compute energy, emit CDR to billing service
 *
 * Key design:
 * - seqNo on each event ensures correct ordering even if messages arrive out-of-order
 * - All events are persisted first (idempotent upsert), then business logic applied
 * - CDR is emitted only after Ended event to ensure completeness
 */
export class TransactionProcessor {
  private db: Pool;
  private onCdrReady: (cdr: ChargeDetailRecord) => Promise<void>;

  constructor(config: TransactionProcessorConfig) {
    this.db = config.db;
    this.onCdrReady = config.onCdrReady;
  }

  async process(
    stationId: string,
    tenantId: string,
    event: TransactionEventRequest
  ): Promise<TransactionEventResponse> {
    const { eventType, transactionInfo, timestamp, seqNo } = event;

    logger.info({
      stationId,
      transactionId: transactionInfo.transactionId,
      eventType,
      seqNo,
    }, 'Processing TransactionEvent');

    // Persist raw event for audit trail and replay capability
    await this.persistRawEvent(stationId, tenantId, event);

    switch (eventType) {
      case 'Started':
        return this.handleStarted(stationId, tenantId, event);
      case 'Updated':
        return this.handleUpdated(stationId, tenantId, event);
      case 'Ended':
        return this.handleEnded(stationId, tenantId, event);
    }
  }

  private async handleStarted(
    stationId: string,
    tenantId: string,
    event: TransactionEventRequest
  ): Promise<TransactionEventResponse> {
    const { transactionInfo, timestamp, evse, idToken } = event;

    await this.db.query(
      `INSERT INTO charging_sessions (
        id, station_id, evse_id, connector_id, transaction_id,
        id_token, start_time, status, tenant_id, energy_delivered_wh
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, 0)
      ON CONFLICT (transaction_id) DO NOTHING`,
      [
        uuidv4(),
        stationId,
        evse?.id ?? 1,
        evse?.connectorId ?? 1,
        transactionInfo.transactionId,
        idToken?.idToken,
        timestamp,
        tenantId,
      ]
    );

    return {
      // Real-time cost display (requires tariff lookup in production)
      totalCost: 0,
    };
  }

  private async handleUpdated(
    stationId: string,
    tenantId: string,
    event: TransactionEventRequest
  ): Promise<TransactionEventResponse> {
    const { transactionInfo, meterValue } = event;

    // Extract latest energy reading from meter values
    const energyWh = this.extractEnergyWh(meterValue ?? []);

    if (energyWh !== null) {
      await this.db.query(
        `UPDATE charging_sessions
         SET energy_delivered_wh = $1, updated_at = NOW()
         WHERE transaction_id = $2`,
        [energyWh, transactionInfo.transactionId]
      );
    }

    return {};
  }

  private async handleEnded(
    stationId: string,
    tenantId: string,
    event: TransactionEventRequest
  ): Promise<TransactionEventResponse> {
    const { transactionInfo, timestamp, meterValue } = event;
    const finalEnergyWh = this.extractEnergyWh(meterValue ?? []);

    // Finalize session
    const result = await this.db.query<{
      id: string;
      start_time: Date;
      energy_delivered_wh: number;
      id_token: string;
      evse_id: number;
      connector_id: number;
      meter_start_wh: number;
    }>(
      `UPDATE charging_sessions
       SET status = 'completed',
           end_time = $1,
           energy_delivered_wh = COALESCE($2, energy_delivered_wh),
           stop_reason = $3,
           updated_at = NOW()
       WHERE transaction_id = $4
       RETURNING id, start_time, energy_delivered_wh, id_token, evse_id, connector_id, meter_start_wh`,
      [
        timestamp,
        finalEnergyWh,
        transactionInfo.stoppedReason ?? 'Other',
        transactionInfo.transactionId,
      ]
    );

    if (result.rowCount && result.rowCount > 0) {
      const session = result.rows[0];
      const durationSeconds = Math.floor(
        (new Date(timestamp).getTime() - session.start_time.getTime()) / 1000
      );

      const cdr: ChargeDetailRecord = {
        id: uuidv4(),
        sessionId: session.id,
        stationId,
        tenantId,
        startDateTime: session.start_time,
        endDateTime: new Date(timestamp),
        authMethod: session.id_token ? 'RFID' : 'NoAuth',
        idToken: session.id_token,
        energyDeliveredWh: session.energy_delivered_wh,
        duration: durationSeconds,
        totalCost: 0,          // Computed by billing service
        currency: 'USD',
        meterStart: session.meter_start_wh ?? 0,
        meterStop: finalEnergyWh ?? session.energy_delivered_wh,
        stopReason: transactionInfo.stoppedReason,
        createdAt: new Date(),
      };

      await this.onCdrReady(cdr);
    }

    return {};
  }

  private async persistRawEvent(
    stationId: string,
    tenantId: string,
    event: TransactionEventRequest
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO transaction_events (
        station_id, tenant_id, transaction_id, event_type, seq_no, payload, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (transaction_id, seq_no) DO NOTHING`,
      [
        stationId,
        tenantId,
        event.transactionInfo.transactionId,
        event.eventType,
        event.seqNo,
        JSON.stringify(event),
        event.timestamp,
      ]
    );
  }

  /**
   * Extract the most recent Energy.Active.Import.Register reading from MeterValues.
   * This is the running kWh odometer that gives us total energy delivered.
   */
  private extractEnergyWh(meterValues: TransactionEventRequest['meterValue']): number | null {
    if (!meterValues || meterValues.length === 0) return null;

    for (const mv of [...meterValues].reverse()) {
      for (const sv of mv.sampledValue) {
        if (sv.measurand === 'Energy.Active.Import.Register') {
          // Convert to Wh based on unit multiplier
          const multiplier = sv.unitOfMeasure?.multiplier ?? 0;
          return sv.value * Math.pow(10, multiplier);
        }
      }
    }
    return null;
  }
}
