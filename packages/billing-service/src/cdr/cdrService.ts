import { Pool } from 'pg';
import pino from 'pino';
import { TariffEngine } from '../pricing/tariffEngine';
import { StripeProcessor } from '../payment/stripeProcessor';
import type { ChargeDetailRecord, Tariff } from '@ocpp-platform/types';

const logger = pino({ name: 'cdr-service' });

interface CdrServiceConfig {
  db: Pool;
  tariffEngine: TariffEngine;
  stripeProcessor: StripeProcessor;
}

/**
 * CdrService — enriches raw CDRs with pricing and triggers payment.
 *
 * Process:
 * 1. Receive raw CDR from transaction-service (via Kafka billing.cdr topic)
 * 2. Look up applicable tariff for this station/tenant/driver
 * 3. Compute cost using TariffEngine
 * 4. Store enriched CDR in PostgreSQL
 * 5. Trigger payment via Stripe (or mark as invoice for B2B)
 * 6. Emit billing.invoice event for notification service
 */
export class CdrService {
  private db: Pool;
  private tariffEngine: TariffEngine;
  private stripeProcessor: StripeProcessor;

  constructor(config: CdrServiceConfig) {
    this.db = config.db;
    this.tariffEngine = config.tariffEngine;
    this.stripeProcessor = config.stripeProcessor;
  }

  async processCdr(rawCdr: ChargeDetailRecord): Promise<void> {
    logger.info({ cdrId: rawCdr.id, sessionId: rawCdr.sessionId }, 'Processing CDR');

    // 1. Look up tariff
    const tariff = await this.resolveTariff(rawCdr);

    // 2. Compute cost
    let totalCostCents = 0;
    if (tariff) {
      const result = this.tariffEngine.calculate(rawCdr, tariff);
      totalCostCents = Math.round(result.totalCost.toNumber() * 100);
      rawCdr.totalCost = result.totalCost.toNumber();
      rawCdr.currency = result.currency;
    }

    // 3. Persist enriched CDR
    await this.saveCdr(rawCdr);

    // 4. Trigger payment for B2C sessions with stored payment method
    if (rawCdr.authMethod !== 'NoAuth' && rawCdr.idToken && totalCostCents > 0) {
      await this.triggerPayment(rawCdr, totalCostCents);
    }

    logger.info({
      cdrId: rawCdr.id,
      cost: rawCdr.totalCost,
      currency: rawCdr.currency,
    }, 'CDR processed');
  }

  private async resolveTariff(cdr: ChargeDetailRecord): Promise<Tariff | null> {
    // Tariff priority: driver-specific > location-specific > tenant default
    const result = await this.db.query<Tariff>(
      `SELECT t.id, t.tenant_id as "tenantId", t.name, t.currency, t.elements,
              t.start_date as "startDate", t.end_date as "endDate"
       FROM tariffs t
       JOIN station_tariff_assignments sta ON sta.tariff_id = t.id
       JOIN stations s ON s.id = sta.station_id
       WHERE s.id = $1
         AND t.tenant_id = $2
         AND (t.start_date IS NULL OR t.start_date <= NOW())
         AND (t.end_date IS NULL OR t.end_date >= NOW())
       ORDER BY sta.priority DESC
       LIMIT 1`,
      [cdr.stationId, cdr.tenantId]
    );

    if (result.rowCount === 0) return null;
    const row = result.rows[0];
    // elements stored as JSONB
    return { ...row, elements: row.elements as unknown as Tariff['elements'] };
  }

  private async saveCdr(cdr: ChargeDetailRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO charge_detail_records (
        id, session_id, station_id, tenant_id, start_date_time, end_date_time,
        auth_method, id_token, energy_delivered_wh, duration_seconds,
        total_cost, currency, tariff_id, meter_start, meter_stop,
        stop_reason, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      ON CONFLICT (id) DO UPDATE SET
        total_cost = EXCLUDED.total_cost,
        currency = EXCLUDED.currency`,
      [
        cdr.id, cdr.sessionId, cdr.stationId, cdr.tenantId,
        cdr.startDateTime, cdr.endDateTime,
        cdr.authMethod, cdr.idToken,
        cdr.energyDeliveredWh, cdr.duration,
        cdr.totalCost, cdr.currency, cdr.tariffId,
        cdr.meterStart, cdr.meterStop, cdr.stopReason,
        cdr.createdAt,
      ]
    );
  }

  private async triggerPayment(cdr: ChargeDetailRecord, amountCents: number): Promise<void> {
    // Look up driver's stored Stripe payment method
    const driverResult = await this.db.query<{
      stripe_customer_id: string;
      default_payment_method_id: string;
    }>(
      `SELECT d.stripe_customer_id, d.default_payment_method_id
       FROM drivers d
       JOIN driver_tokens dt ON dt.driver_id = d.id
       WHERE dt.token = $1 LIMIT 1`,
      [cdr.idToken]
    );

    if (driverResult.rowCount === 0) {
      logger.warn({ sessionId: cdr.sessionId }, 'No driver found for payment');
      return;
    }

    const driver = driverResult.rows[0];
    if (!driver.stripe_customer_id || !driver.default_payment_method_id) {
      logger.warn({ sessionId: cdr.sessionId }, 'Driver has no payment method on file');
      return;
    }

    const result = await this.stripeProcessor.chargeStoredMethod(
      driver.stripe_customer_id,
      driver.default_payment_method_id,
      amountCents,
      cdr.currency,
      {
        session_id: cdr.sessionId,
        cdr_id: cdr.id,
        station_id: cdr.stationId,
        tenant_id: cdr.tenantId,
      }
    );

    if (result.success) {
      await this.db.query(
        `UPDATE charge_detail_records
         SET payment_intent_id = $1, payment_status = 'paid'
         WHERE id = $2`,
        [result.paymentIntentId, cdr.id]
      );
    } else {
      await this.db.query(
        `UPDATE charge_detail_records
         SET payment_status = 'failed', payment_error = $1
         WHERE id = $2`,
        [result.error, cdr.id]
      );
    }
  }
}
