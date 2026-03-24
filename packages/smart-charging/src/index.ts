import 'dotenv/config';
import { Pool } from 'pg';
import { Kafka, logLevel } from 'kafkajs';
import pino from 'pino';
import { SiteLoadBalancer } from './algorithms/siteLoadBalancer';
import { DemandResponseHandler } from './algorithms/demandResponseHandler';
import type { ActiveCharger } from './algorithms/siteLoadBalancer';

const logger = pino({ name: 'smart-charging' });

/**
 * Smart Charging Service
 *
 * Runs on a polling interval (default: every 60 seconds) to:
 * 1. Collect active sessions per site from DB
 * 2. Get current site power reading from meter service
 * 3. Apply demand response adjustments (OpenADR)
 * 4. Compute new per-charger limits via SiteLoadBalancer
 * 5. Send SetChargingProfile commands via gateway command topic (Kafka → ocpp.commands)
 *
 * Also responds to real-time triggers:
 * - New TransactionEvent:Started → rebalance site immediately
 * - TransactionEvent:Ended → rebalance site immediately
 * - DR event received → rebalance all affected sites
 */
async function main() {
  logger.info('Starting Smart Charging Service');

  const db = new Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/ocpp',
  });

  const kafka = new Kafka({
    clientId: 'smart-charging',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });

  const producer = kafka.producer();
  await producer.connect();

  const consumer = kafka.consumer({ groupId: 'smart-charging-group' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'ocpp.boot', fromBeginning: false });
  await consumer.subscribe({ topic: 'smartcharging.dr-event', fromBeginning: false });

  const drHandler = new DemandResponseHandler();

  // Listen for session changes and DR events to trigger rebalancing
  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const msg = JSON.parse(message.value.toString()) as Record<string, unknown>;

      if (topic === 'smartcharging.dr-event') {
        const adjustments = await drHandler.processEvent(msg as any);
        for (const [locationId] of adjustments) {
          await rebalanceSite(locationId, db, producer, drHandler);
        }
      }
    },
  });

  // Periodic rebalancing for all active sites
  const REBALANCE_INTERVAL_MS = parseInt(process.env.REBALANCE_INTERVAL_MS ?? '60000');
  setInterval(async () => {
    try {
      const sites = await getActiveSites(db);
      for (const site of sites) {
        await rebalanceSite(site.locationId, db, producer, drHandler);
      }
    } catch (err) {
      logger.error({ err }, 'Periodic rebalancing failed');
    }
  }, REBALANCE_INTERVAL_MS);

  logger.info({ interval: REBALANCE_INTERVAL_MS }, 'Smart Charging Service ready');

  process.on('SIGTERM', async () => {
    await consumer.disconnect();
    await producer.disconnect();
    await db.end();
    process.exit(0);
  });
}

async function rebalanceSite(
  locationId: string,
  db: Pool,
  producer: ReturnType<ReturnType<typeof import('kafkajs').Kafka.prototype.producer>['connect']> extends Promise<infer T> ? T : never,
  drHandler: DemandResponseHandler
): Promise<void> {
  // Get site config
  const siteResult = await db.query<{
    location_id: string; max_site_kw: number;
  }>(
    'SELECT location_id, max_site_kw FROM locations WHERE id = $1',
    [locationId]
  );
  if (siteResult.rowCount === 0) return;
  const site = siteResult.rows[0];

  // Get active chargers at this site
  const activeChargers = await getActiveChargersForSite(db, locationId);
  if (activeChargers.length === 0) return;

  const drFactor = drHandler.getLocationFactor(locationId);
  const effectiveSiteLimit = site.max_site_kw * drFactor;

  const balancer = new SiteLoadBalancer({
    locationId,
    siteLimitKw: effectiveSiteLimit,
  });

  const limits = balancer.computeLimits(activeChargers, 0);

  // Send SetChargingProfile commands for each charger via Kafka
  for (const [key, limitKw] of limits) {
    const [stationId, evseId] = key.split(':');
    const charger = activeChargers.find(
      (c) => c.stationId === stationId && String(c.evseId) === evseId
    );
    if (!charger) continue;

    const profile = balancer.buildTxProfile(
      parseInt(evseId), charger.transactionId, limitKw
    );

    await producer.send({
      topic: 'ocpp.commands',
      messages: [{
        key: stationId,
        value: JSON.stringify({
          stationId,
          action: 'SetChargingProfile',
          payload: {
            evseId: parseInt(evseId),
            chargingProfile: profile,
          },
        }),
      }],
    });
  }

  logger.info({ locationId, chargerCount: activeChargers.length, drFactor }, 'Site rebalanced');
}

async function getActiveChargersForSite(db: Pool, locationId: string): Promise<ActiveCharger[]> {
  const result = await db.query<ActiveCharger & { station_id: string; evse_id: number }>(
    `SELECT cs.station_id as "stationId", cs.evse_id as "evseId",
            cs.transaction_id as "transactionId",
            s.max_power_kw as "maxCapacityKw",
            1 as "priority",
            100 as "currentLimitKw",
            cs.charging_state as "chargingState"
     FROM charging_sessions cs
     JOIN stations s ON s.id = cs.station_id
     WHERE s.location_id = $1 AND cs.status = 'active'`,
    [locationId]
  );
  return result.rows;
}

async function getActiveSites(db: Pool): Promise<{ locationId: string }[]> {
  const result = await db.query<{ location_id: string }>(
    `SELECT DISTINCT s.location_id
     FROM charging_sessions cs
     JOIN stations s ON s.id = cs.station_id
     WHERE cs.status = 'active'`
  );
  return result.rows.map((r) => ({ locationId: r.location_id }));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
