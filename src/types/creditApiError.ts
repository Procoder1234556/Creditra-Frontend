/**
 * Typed credit-API error model for actionable UI (#921).
 */

export type CreditApiErrorFamily =
  | 'invalid_amount'
  | 'authorization'
  | 'conflict'
  | 'stale_data'
  | 'service_unavailable'
  | 'unknown';

/** Recommended UI action for a mapped error. */
export type CreditApiErrorAction =
  | 'fix_amount'
  | 'reconnect_wallet'
  | 'refresh_data'
  | 'wait_and_retry'
  | 'contact_support'
  | 'none';

export interface CreditApiError {
  family: CreditApiErrorFamily;
  /** Stable machine code from API or derived from HTTP status. */
  code: string;
  /** Safe, user-facing message (no secrets / raw stack traces). */
  userMessage: string;
  action: CreditApiErrorAction;
  /** When true, UI may show a Retry CTA. */
  retrySafe: boolean;
  /** Support correlation id when present. */
  correlationId?: string;
}

/** Documented credit-API error codes → family mapping. */
export const CREDIT_API_ERROR_CODES = [
  'INVALID_AMOUNT',
  'AMOUNT_BELOW_MINIMUM',
  'AMOUNT_ABOVE_AVAILABLE',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'WALLET_NOT_CONNECTED',
  'CONFLICT',
  'DUPLICATE_REQUEST',
  'STALE_STATE',
  'PRECONDITION_FAILED',
  'SERVICE_UNAVAILABLE',
  'GATEWAY_TIMEOUT',
  'RATE_LIMITED',
  'UNKNOWN',
] as const;

export type CreditApiErrorCode = (typeof CREDIT_API_ERROR_CODES)[number];
