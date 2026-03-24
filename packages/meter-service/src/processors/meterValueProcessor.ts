import { InfluxDB, Point, WriteApi } from '@influxdata/influxdb-client';
import pino from 'pino';
import type { MeterValueType, SampledValueType } from '@ocpp-platform/types';

const logger = pino({ name: 'meter-processor' });

export interface MeterProcessorConfig {
  influxUrl: string;
  influxToken: string;
  influxOrg: string;
  influxBucket: string;
}

/**
 * MeterValueProcessor — writes OCPP meter readings to InfluxDB (time-series).
 *
 * InfluxDB measurement schema:
 *   measurement: ocpp_meter
 *   tags:
 *     station_id, evse_id, connector_id, tenant_id,
 *     measurand, phase, location, context
 *   fields:
 *     value (float)
 *   timestamp: from OCPP MeterValue.timestamp
 *
 * Retention policies:
 *   raw:   30 days at full resolution (per-second)
 *   1min:  1 year (downsampled)
 *   1hour: 5 years (downsampled)
 *
 * This schema supports:
 *   - Real-time energy dashboards
 *   - Billing validation (cross-check against CDR)
 *   - Smart charging analytics
 *   - Anomaly detection (sudden power drops = charger fault)
 */
export class MeterValueProcessor {
  private writeApi: WriteApi;

  constructor(config: MeterProcessorConfig) {
    const influx = new InfluxDB({ url: config.influxUrl, token: config.influxToken });
    this.writeApi = influx.getWriteApi(config.influxOrg, config.influxBucket, 'ms');
    this.writeApi.useDefaultTags({ service: 'ocpp-platform' });
  }

  async processMeterValues(
    stationId: string,
    tenantId: string,
    evseId: number,
    connectorId: number,
    transactionId: string | undefined,
    meterValues: MeterValueType[]
  ): Promise<void> {
    const points: Point[] = [];

    for (const mv of meterValues) {
      const ts = new Date(mv.timestamp);

      for (const sv of mv.sampledValue) {
        const point = this.buildPoint(
          stationId, tenantId, evseId, connectorId, transactionId, ts, sv
        );
        points.push(point);
      }
    }

    if (points.length === 0) return;

    try {
      this.writeApi.writePoints(points);
      await this.writeApi.flush();
      logger.debug({ stationId, count: points.length }, 'Meter values written to InfluxDB');
    } catch (err) {
      logger.error({ stationId, err }, 'Failed to write meter values to InfluxDB');
      throw err;
    }
  }

  private buildPoint(
    stationId: string,
    tenantId: string,
    evseId: number,
    connectorId: number,
    transactionId: string | undefined,
    timestamp: Date,
    sv: SampledValueType
  ): Point {
    const point = new Point('ocpp_meter')
      .tag('station_id', stationId)
      .tag('tenant_id', tenantId)
      .tag('evse_id', String(evseId))
      .tag('connector_id', String(connectorId))
      .tag('measurand', sv.measurand ?? 'Energy.Active.Import.Register')
      .tag('context', sv.context ?? 'Sample.Periodic')
      .tag('location', sv.location ?? 'Outlet')
      .floatField('value', sv.value)
      .timestamp(timestamp);

    if (sv.phase) point.tag('phase', sv.phase);
    if (transactionId) point.tag('transaction_id', transactionId);

    return point;
  }

  /**
   * Query the latest power reading for a station/EVSE.
   * Used by the smart charging engine for real-time load awareness.
   */
  async getLatestPowerKw(stationId: string, evseId: number): Promise<number | null> {
    // In production: query InfluxDB for most recent Power.Active.Import reading
    // SELECT last("value") FROM ocpp_meter
    // WHERE station_id = $stationId AND evse_id = $evseId
    // AND measurand = 'Power.Active.Import'
    return null;
  }

  async close(): Promise<void> {
    await this.writeApi.close();
  }
}
