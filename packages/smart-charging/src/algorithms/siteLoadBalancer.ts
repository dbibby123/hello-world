import pino from 'pino';
import type { ChargingProfileType, ChargingSchedulePeriodType } from '@ocpp-platform/types';

const logger = pino({ name: 'site-load-balancer' });

export interface ActiveCharger {
  stationId: string;
  evseId: number;
  transactionId: string;
  currentLimitKw: number;
  maxCapacityKw: number;
  priority: number;                // Higher = more priority (fleet, subscriber tier, etc.)
  chargingState: string;
}

export interface SiteLoadBalancerConfig {
  locationId: string;
  siteLimitKw: number;             // Hard limit from utility/grid connection
  peakShavingLimitKw?: number;     // Softer demand charge avoidance limit
  safetyMarginPercent?: number;    // Reserve % of site capacity (default 5%)
}

/**
 * SiteLoadBalancer — distributes available power across active chargers at a site.
 *
 * Algorithms supported:
 * 1. Equal Share: divide available power equally among active chargers
 * 2. Priority-Weighted: allocate proportional to charger priority scores
 * 3. First-Come-First-Serve: fill in order of session start time
 * 4. Max-Min Fairness: ensure minimum guaranteed power, then share remainder
 *
 * This generates OCPP ChargingProfile commands (TxProfile) sent to each charger
 * via the gateway's remote command channel.
 */
export class SiteLoadBalancer {
  private locationId: string;
  private siteLimitKw: number;
  private peakShavingLimitKw: number;
  private safetyMarginKw: number;

  constructor(config: SiteLoadBalancerConfig) {
    this.locationId = config.locationId;
    this.siteLimitKw = config.siteLimitKw;
    this.peakShavingLimitKw = config.peakShavingLimitKw ?? config.siteLimitKw;
    const margin = (config.safetyMarginPercent ?? 5) / 100;
    this.safetyMarginKw = config.siteLimitKw * margin;
  }

  get effectiveLimitKw(): number {
    return Math.min(this.siteLimitKw, this.peakShavingLimitKw) - this.safetyMarginKw;
  }

  /**
   * Compute new charging limits for all active chargers.
   * Returns a map of stationId:evseId → new limit in kW.
   *
   * Uses priority-weighted fair share algorithm:
   * - Each charger gets at minimum minGuaranteeKw
   * - Remaining power distributed proportional to priority
   */
  computeLimits(
    activeChargers: ActiveCharger[],
    currentSiteLoadKw: number,
    minGuaranteeKw: number = 3.7   // Minimum viable charging (~L2)
  ): Map<string, number> {
    const limits = new Map<string, number>();
    if (activeChargers.length === 0) return limits;

    const available = this.effectiveLimitKw;

    if (available <= 0) {
      // No power available — set everyone to minimum or 0
      for (const c of activeChargers) {
        limits.set(`${c.stationId}:${c.evseId}`, 0);
      }
      return limits;
    }

    const totalMinimum = minGuaranteeKw * activeChargers.length;

    if (available <= totalMinimum) {
      // Not enough for guarantees — equal share
      const equalShare = available / activeChargers.length;
      for (const c of activeChargers) {
        limits.set(`${c.stationId}:${c.evseId}`, Math.min(equalShare, c.maxCapacityKw));
      }
      return limits;
    }

    // Assign minimums first, then distribute surplus by priority weight
    const surplus = available - totalMinimum;
    const totalPriority = activeChargers.reduce((sum, c) => sum + c.priority, 0);

    for (const c of activeChargers) {
      const priorityShare = totalPriority > 0
        ? (c.priority / totalPriority) * surplus
        : surplus / activeChargers.length;
      const allocated = Math.min(minGuaranteeKw + priorityShare, c.maxCapacityKw);
      limits.set(`${c.stationId}:${c.evseId}`, Math.round(allocated * 10) / 10);
    }

    logger.info({
      locationId: this.locationId,
      available,
      activeCount: activeChargers.length,
      limits: Object.fromEntries(limits),
    }, 'Site load balancing computed');

    return limits;
  }

  /**
   * Build an OCPP TxProfile ChargingProfile for a specific charger/EVSE.
   * Sent via SetChargingProfile to enforce the computed limit.
   */
  buildTxProfile(
    evseId: number,
    transactionId: string,
    limitKw: number,
    durationSeconds: number = 900   // 15-minute profile window
  ): ChargingProfileType {
    const period: ChargingSchedulePeriodType = {
      startPeriod: 0,
      limit: limitKw,               // kW (chargingRateUnit: W would need limitKw * 1000)
      numberPhases: 3,
    };

    return {
      id: Date.now(),               // Unique profile ID
      stackLevel: 2,                // TxProfile level (overrides TxDefaultProfile)
      chargingProfilePurpose: 'TxProfile',
      chargingProfileKind: 'Relative',
      transactionId,
      chargingSchedule: [{
        id: 1,
        duration: durationSeconds,
        chargingRateUnit: 'W',
        chargingSchedulePeriod: [{
          startPeriod: 0,
          limit: limitKw * 1000,    // Convert kW to W
          numberPhases: 3,
        }],
      }],
    };
  }

  /**
   * Build a site-level ChargingStationMaxProfile.
   * This caps the entire station regardless of transaction profiles.
   * Sent via SetChargingProfile to EVSE 0 (applies to whole station).
   */
  buildStationMaxProfile(stationMaxKw: number): ChargingProfileType {
    return {
      id: Date.now(),
      stackLevel: 1,
      chargingProfilePurpose: 'ChargingStationMaxProfile',
      chargingProfileKind: 'Absolute',
      chargingSchedule: [{
        id: 1,
        chargingRateUnit: 'W',
        chargingSchedulePeriod: [{
          startPeriod: 0,
          limit: stationMaxKw * 1000,
        }],
      }],
    };
  }
}
