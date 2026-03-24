import pino from 'pino';

const logger = pino({ name: 'demand-response' });

export type DREventType = 'LoadReduction' | 'LoadIncrease' | 'PriceSignal' | 'EmergencyCurtailment';
export type DRStatus = 'active' | 'pending' | 'completed' | 'cancelled';

export interface DemandResponseEvent {
  id: string;
  type: DREventType;
  startTime: Date;
  endTime: Date;
  reductionPercent?: number;       // For LoadReduction
  targetKw?: number;               // Absolute target
  pricePerKwh?: number;            // For PriceSignal events
  status: DRStatus;
  locationIds: string[];           // Which sites are affected
}

/**
 * DemandResponseHandler — processes OpenADR 2.0b signals from utilities/grid operators.
 *
 * OpenADR 2.0b communication:
 *   VEN (Virtual End Node) = this platform
 *   VTN (Virtual Top Node) = utility / grid operator / aggregator
 *
 * Event flow:
 *   1. VTN sends oadrDistributeEvent to our VEN endpoint
 *   2. VEN acknowledges with oadrCreatedEvent
 *   3. Platform curtails charging at affected sites
 *   4. VEN sends oadrUpdatedReport with actual reduction achieved
 *
 * Supported signals:
 *   - LOAD: Reduce/increase load by % or to absolute kW
 *   - PRICE: Dynamic price signal for price-responsive charging
 *   - EMERGENCY: Immediate full curtailment
 */
export class DemandResponseHandler {
  private activeEvents = new Map<string, DemandResponseEvent>();

  /**
   * Process an incoming OpenADR event (parsed from OADR XML/JSON).
   * Returns the list of site load adjustments to apply.
   */
  async processEvent(event: DemandResponseEvent): Promise<Map<string, number>> {
    logger.info({
      eventId: event.id,
      type: event.type,
      locationCount: event.locationIds.length,
    }, 'Processing demand response event');

    this.activeEvents.set(event.id, event);
    const adjustments = new Map<string, number>();

    for (const locationId of event.locationIds) {
      const adjustment = this.computeAdjustment(event);
      adjustments.set(locationId, adjustment);
      logger.info({ locationId, adjustmentPercent: adjustment }, 'DR adjustment computed');
    }

    return adjustments;
  }

  /**
   * Returns the current effective load reduction factor for a location (0.0 to 1.0).
   * 1.0 = full power, 0.0 = no power.
   */
  getLocationFactor(locationId: string): number {
    const now = new Date();
    let minFactor = 1.0;

    for (const event of this.activeEvents.values()) {
      if (event.status !== 'active') continue;
      if (event.startTime > now || event.endTime < now) continue;
      if (!event.locationIds.includes(locationId)) continue;

      const factor = this.computeAdjustment(event) / 100;
      minFactor = Math.min(minFactor, factor);
    }

    return minFactor;
  }

  private computeAdjustment(event: DemandResponseEvent): number {
    switch (event.type) {
      case 'EmergencyCurtailment':
        return 0;     // Full shutdown
      case 'LoadReduction':
        return Math.max(0, 100 - (event.reductionPercent ?? 20));
      case 'LoadIncrease':
        return Math.min(150, 100 + (event.reductionPercent ?? 10));
      case 'PriceSignal':
        // In production: consult price-responsive schedule for this site
        return event.pricePerKwh && event.pricePerKwh > 0.30 ? 50 : 100;
      default:
        return 100;
    }
  }

  cancelEvent(eventId: string): void {
    const event = this.activeEvents.get(eventId);
    if (event) {
      event.status = 'cancelled';
      logger.info({ eventId }, 'DR event cancelled');
    }
  }

  getActiveEvents(): DemandResponseEvent[] {
    return Array.from(this.activeEvents.values()).filter((e) => e.status === 'active');
  }
}
