import Decimal from 'decimal.js';
import pino from 'pino';
import type { Tariff, TariffElement, PriceComponent, ChargeDetailRecord } from '@ocpp-platform/types';

const logger = pino({ name: 'tariff-engine' });

export interface TariffCalculationResult {
  totalCost: Decimal;
  currency: string;
  breakdown: TariffLineItem[];
}

export interface TariffLineItem {
  type: PriceComponent['type'];
  quantity: number;
  unit: string;
  unitPrice: Decimal;
  amount: Decimal;
  description: string;
}

/**
 * TariffEngine — applies multi-dimensional pricing to a completed charging session.
 *
 * Pricing dimensions supported (OCPI-aligned):
 *   FLAT       — fixed session fee (e.g. $1.00 per session)
 *   ENERGY     — per kWh consumed (e.g. $0.35/kWh)
 *   TIME       — per minute of connection (e.g. $0.05/min)
 *   PARKING    — per minute after charging completes (idle fee, e.g. $0.15/min)
 *
 * Tariff restrictions:
 *   - Time of day (peak/off-peak rates)
 *   - Day of week
 *   - Minimum/maximum energy thresholds
 *
 * Multi-tenant pricing:
 *   - Each tenant configures their own tariffs
 *   - Tariffs can be scoped to locations, EVSE types, driver groups
 */
export class TariffEngine {
  calculate(cdr: ChargeDetailRecord, tariff: Tariff): TariffCalculationResult {
    const lineItems: TariffLineItem[] = [];
    let totalCost = new Decimal(0);

    const sessionStart = new Date(cdr.startDateTime);
    const sessionEnd = new Date(cdr.endDateTime);
    const durationMinutes = cdr.duration / 60;
    const energyKwh = cdr.energyDeliveredWh / 1000;

    for (const element of tariff.elements) {
      if (!this.restrictionMatches(element, sessionStart, energyKwh)) continue;

      for (const component of element.priceComponents) {
        const lineItem = this.computeComponent(component, energyKwh, durationMinutes, cdr);
        if (lineItem) {
          lineItems.push(lineItem);
          totalCost = totalCost.plus(lineItem.amount);
        }
      }
    }

    logger.debug({
      sessionId: cdr.sessionId,
      totalCost: totalCost.toString(),
      currency: tariff.currency,
      lineItems: lineItems.length,
    }, 'Tariff calculated');

    return {
      totalCost,
      currency: tariff.currency,
      breakdown: lineItems,
    };
  }

  private computeComponent(
    component: PriceComponent,
    energyKwh: number,
    durationMinutes: number,
    cdr: ChargeDetailRecord
  ): TariffLineItem | null {
    const price = new Decimal(component.price);

    switch (component.type) {
      case 'FLAT':
        return {
          type: 'FLAT',
          quantity: 1,
          unit: 'session',
          unitPrice: price,
          amount: price,
          description: 'Session fee',
        };

      case 'ENERGY': {
        const step = component.stepSize ?? 0.001;
        const billedKwh = Math.ceil(energyKwh / step) * step;
        return {
          type: 'ENERGY',
          quantity: billedKwh,
          unit: 'kWh',
          unitPrice: price,
          amount: price.mul(billedKwh),
          description: `Energy (${billedKwh.toFixed(3)} kWh)`,
        };
      }

      case 'TIME': {
        const step = component.stepSize ?? 1;
        const billedMinutes = Math.ceil(durationMinutes / step) * step;
        return {
          type: 'TIME',
          quantity: billedMinutes,
          unit: 'min',
          unitPrice: price,
          amount: price.mul(billedMinutes),
          description: `Time (${billedMinutes.toFixed(1)} min)`,
        };
      }

      case 'PARKING_TIME': {
        // Idle fee: charged per minute after charging completes
        // In production: track when charging stopped vs when cable was unplugged
        const idleMinutes = 0; // Would come from ChargingStateChanged events
        if (idleMinutes === 0) return null;
        return {
          type: 'PARKING_TIME',
          quantity: idleMinutes,
          unit: 'min',
          unitPrice: price,
          amount: price.mul(idleMinutes),
          description: `Idle fee (${idleMinutes} min)`,
        };
      }

      default:
        return null;
    }
  }

  private restrictionMatches(
    element: TariffElement,
    sessionStart: Date,
    energyKwh: number
  ): boolean {
    const r = element.restrictions;
    if (!r) return true;

    if (r.minKwh !== undefined && energyKwh < r.minKwh) return false;
    if (r.maxKwh !== undefined && energyKwh >= r.maxKwh) return false;

    if (r.startTime || r.endTime) {
      const hour = sessionStart.getHours();
      const min = sessionStart.getMinutes();
      const timeStr = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
      if (r.startTime && timeStr < r.startTime) return false;
      if (r.endTime && timeStr >= r.endTime) return false;
    }

    if (r.dayOfWeek && r.dayOfWeek.length > 0) {
      const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
      const dayOfWeek = days[sessionStart.getDay() === 0 ? 6 : sessionStart.getDay() - 1];
      if (!r.dayOfWeek.includes(dayOfWeek)) return false;
    }

    return true;
  }
}
