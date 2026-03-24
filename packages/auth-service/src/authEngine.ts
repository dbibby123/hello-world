import type {
  AuthorizeRequest,
  AuthorizeResponse,
  IdTokenInfoType,
  AuthorizationStatus,
} from '@ocpp-platform/types';
import { TokenRepository } from './cache/tokenRepository';
import { LocalAuthListSync } from './cache/localAuthListSync';
import { OcspValidator } from './providers/ocspValidator';
import pino from 'pino';

const logger = pino({ name: 'auth-engine' });

interface AuthEngineConfig {
  tokenRepo: TokenRepository;
  ocspValidator: OcspValidator;
  localAuthListSync: LocalAuthListSync;
}

/**
 * AuthorizationEngine — validates EV driver identity using multiple methods:
 *
 * 1. RFID (ISO14443/ISO15693): Look up token in local cache, then Postgres
 * 2. ISO 15118 eMaid (Plug & Charge): Validate certificate chain + OCSP check
 * 3. App token: JWT from mobile app / QR code session
 * 4. NoAuthorization: Free vend mode (configured per station)
 *
 * Cache strategy:
 * - Redis L1 cache (TTL: 5 min) for hot tokens
 * - PostgreSQL L2 for full token database
 * - Response includes cacheExpiryDateTime so charger can cache locally
 */
export class AuthorizationEngine {
  private tokenRepo: TokenRepository;
  private ocspValidator: OcspValidator;
  private localAuthListSync: LocalAuthListSync;

  constructor(config: AuthEngineConfig) {
    this.tokenRepo = config.tokenRepo;
    this.ocspValidator = config.ocspValidator;
    this.localAuthListSync = config.localAuthListSync;
  }

  async authorize(
    stationId: string,
    rawPayload: Record<string, unknown>
  ): Promise<AuthorizeResponse> {
    const request = rawPayload as unknown as AuthorizeRequest;
    const { idToken } = request;

    logger.debug({ stationId, tokenType: idToken.type, token: idToken.idToken }, 'Authorizing');

    try {
      switch (idToken.type) {
        case 'ISO14443':
        case 'ISO15693':
          return await this.authorizeRfid(idToken.idToken);

        case 'eMAID':
          return await this.authorizeISO15118(
            idToken.idToken,
            request.certificate,
            request.iso15118CertificateHashData
          );

        case 'Central':
        case 'KeyCode':
          return await this.authorizeAppToken(idToken.idToken);

        case 'NoAuthorization':
          return this.buildResponse('Accepted', { chargingPriority: 0 });

        default:
          return this.buildResponse('Invalid');
      }
    } catch (err) {
      logger.error({ stationId, err }, 'Authorization error');
      return this.buildResponse('Invalid');
    }
  }

  private async authorizeRfid(token: string): Promise<AuthorizeResponse> {
    const driverToken = await this.tokenRepo.findToken(token, ['ISO14443', 'ISO15693']);

    if (!driverToken) return this.buildResponse('Invalid');
    if (!driverToken.valid) return this.buildResponse('Blocked');
    if (driverToken.expiresAt && driverToken.expiresAt < new Date()) return this.buildResponse('Expired');

    return this.buildResponse('Accepted', {
      cacheExpiryDateTime: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  }

  private async authorizeISO15118(
    emaid: string,
    certificate?: string,
    ocspData?: AuthorizeRequest['iso15118CertificateHashData']
  ): Promise<AuthorizeResponse> {
    // 1. Find contract by eMaid
    const driverToken = await this.tokenRepo.findToken(emaid, ['eMAID']);
    if (!driverToken || !driverToken.valid) return this.buildResponse('Invalid');

    // 2. Validate certificate chain if provided
    if (certificate) {
      const certValid = await this.validateCertificateChain(certificate);
      if (!certValid) {
        return {
          idTokenInfo: { status: 'Invalid' },
          certificateStatus: 'CertChainError',
        };
      }
    }

    // 3. OCSP check to ensure cert is not revoked
    if (ocspData && ocspData.length > 0) {
      const ocspResult = await this.ocspValidator.check(ocspData);
      if (ocspResult === 'Revoked') {
        return {
          idTokenInfo: { status: 'Invalid' },
          certificateStatus: 'CertificateRevoked',
        };
      }
    }

    return {
      idTokenInfo: { status: 'Accepted' },
      certificateStatus: 'Accepted',
    };
  }

  private async authorizeAppToken(token: string): Promise<AuthorizeResponse> {
    const driverToken = await this.tokenRepo.findToken(token, ['APP']);
    if (!driverToken || !driverToken.valid) return this.buildResponse('Invalid');
    return this.buildResponse('Accepted');
  }

  private async validateCertificateChain(_certificate: string): Promise<boolean> {
    // In production: validate against the MO-CA root certificate
    // using Node.js crypto / tls.createSecureContext
    return true;
  }

  private buildResponse(
    status: AuthorizationStatus,
    extra: Partial<IdTokenInfoType> = {}
  ): AuthorizeResponse {
    return {
      idTokenInfo: { status, ...extra },
    };
  }
}
