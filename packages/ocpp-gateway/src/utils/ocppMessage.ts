import type { OcppMessage, OcppCall, OcppCallResult, OcppCallError, OcppErrorCode } from '@ocpp-platform/types';

/**
 * Parse a raw WebSocket message string into a typed OCPP message.
 * Throws on malformed JSON or invalid message structure.
 */
export function parseOcppMessage(raw: string): OcppMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON in OCPP message');
  }

  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error('OCPP message must be a JSON array with at least 3 elements');
  }

  const typeId = parsed[0];
  if (![2, 3, 4].includes(typeId)) {
    throw new Error(`Invalid OCPP MessageTypeId: ${typeId}`);
  }

  return parsed as OcppMessage;
}

export function buildCallResult(
  messageId: string,
  payload: Record<string, unknown>
): OcppCallResult {
  return [3, messageId, payload];
}

export function buildCallError(
  messageId: string,
  errorCode: OcppErrorCode,
  errorDescription: string,
  errorDetails: Record<string, unknown> = {}
): OcppCallError {
  return [4, messageId, errorCode, errorDescription, errorDetails];
}

export function buildCall(
  messageId: string,
  action: string,
  payload: Record<string, unknown>
): OcppCall {
  return [2, messageId, action, payload];
}
