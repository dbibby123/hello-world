import pino from 'pino';
import type { OCSPRequestDataType } from '@ocpp-platform/types';

const logger = pino({ name: 'ocsp-validator' });

type OcspResult = 'Good' | 'Revoked' | 'Unknown';

/**
 * OcspValidator — checks certificate revocation status for ISO 15118 Plug & Charge.
 *
 * In production this would:
 * 1. Send an OCSP request to the OCSP responder URL in the certificate
 * 2. Parse the signed OCSP response
 * 3. Return Good / Revoked / Unknown
 *
 * The PKI hierarchy for Plug & Charge:
 *   Root CA → MO Sub-CA → Contract Certificate (in EV)
 *   Root CA → OEM Provisioning CA → OEM Provisioning Cert
 *   Root CA → CPO Sub-CA → SECC Cert (in charger)
 */
export class OcspValidator {
  async check(ocspData: OCSPRequestDataType[]): Promise<OcspResult> {
    for (const entry of ocspData) {
      const result = await this.checkSingle(entry);
      if (result === 'Revoked') return 'Revoked';
    }
    return 'Good';
  }

  private async checkSingle(entry: OCSPRequestDataType): Promise<OcspResult> {
    logger.debug({ responderURL: entry.responderURL, serial: entry.serialNumber }, 'OCSP check');

    // Production implementation:
    // const response = await fetch(entry.responderURL, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/ocsp-request' },
    //   body: buildOcspRequest(entry),
    // });
    // return parseOcspResponse(await response.arrayBuffer());

    return 'Good'; // stub for dev
  }
}
