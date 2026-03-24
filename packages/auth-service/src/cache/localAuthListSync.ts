import pino from 'pino';
import { TokenRepository } from './tokenRepository';

const logger = pino({ name: 'local-auth-list-sync' });

interface LocalAuthListSyncConfig {
  tokenRepo: TokenRepository;
}

/**
 * LocalAuthListSync — manages OCPP SendLocalList / GetLocalListVersion.
 *
 * Chargers cache a local authorization list for offline authorization.
 * This service builds differential updates (Full/Differential) and
 * triggers SendLocalList commands via the gateway when the list changes.
 *
 * OCPP 2.x: LocalAuthorizationList functional block
 */
export class LocalAuthListSync {
  private tokenRepo: TokenRepository;

  constructor(config: LocalAuthListSyncConfig) {
    this.tokenRepo = config.tokenRepo;
  }

  /**
   * Build a full local auth list payload for a given station.
   * Called when a charger boots or requests a full list update.
   */
  async buildFullList(stationId: string): Promise<LocalAuthListEntry[]> {
    logger.info({ stationId }, 'Building full local auth list');
    // In production: query tokens valid for this specific station's tenant
    // and return the OCPP-formatted list
    return [];
  }

  /**
   * Build a differential update from a given version number.
   */
  async buildDifferentialUpdate(
    stationId: string,
    fromVersion: number
  ): Promise<{ version: number; entries: LocalAuthListEntry[] }> {
    logger.info({ stationId, fromVersion }, 'Building differential auth list update');
    return { version: fromVersion + 1, entries: [] };
  }
}

export interface LocalAuthListEntry {
  idToken: { idToken: string; type: string };
  idTokenInfo?: { status: string };
}
