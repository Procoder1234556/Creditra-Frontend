/**
 * Map raw credit-API / HTTP failures to actionable UI errors (#921).
 */
import type {
  CreditApiError,
  CreditApiErrorAction,
  CreditApiErrorCode,
  CreditApiErrorFamily,
} from '../types/creditApiError';
import { CREDIT_API_ERROR_CODES } from '../types/creditApiError';

interface ErrorPolicy {
  family: CreditApiErrorFamily;
  userMessage: string;
  action: CreditApiErrorAction;
  retrySafe: boolean;
}

const CODE_POLICY: Record<CreditApiErrorCode, ErrorPolicy> = {
  INVALID_AMOUNT: {
    family: 'invalid_amount',
    userMessage: 'That amount is not valid for this credit line. Adjust the amount and try again.',
    action: 'fix_amount',
    retrySafe: false,
  },
  AMOUNT_BELOW_MINIMUM: {
    family: 'invalid_amount',
    userMessage: 'The amount is below the minimum draw size. Increase it and try again.',
    action: 'fix_amount',
    retrySafe: false,
  },
  AMOUNT_ABOVE_AVAILABLE: {
    family: 'invalid_amount',
    userMessage: 'The amount exceeds your available credit. Lower it and try again.',
    action: 'fix_amount',
    retrySafe: false,
  },
  UNAUTHORIZED: {
    family: 'authorization',
    userMessage: 'Your session is not authorized. Reconnect your wallet and try again.',
    action: 'reconnect_wallet',
    retrySafe: false,
  },
  FORBIDDEN: {
    family: 'authorization',
    userMessage: 'You do not have permission to perform this credit action.',
    action: 'contact_support',
    retrySafe: false,
  },
  WALLET_NOT_CONNECTED: {
    family: 'authorization',
    userMessage: 'No wallet is connected. Connect a wallet to continue.',
    action: 'reconnect_wallet',
    retrySafe: false,
  },
  CONFLICT: {
    family: 'conflict',
    userMessage: 'Another change is already in progress for this credit line. Wait a moment, then refresh.',
    action: 'wait_and_retry',
    retrySafe: true,
  },
  DUPLICATE_REQUEST: {
    family: 'conflict',
    userMessage: 'This request was already submitted. Refresh to see the latest status.',
    action: 'refresh_data',
    retrySafe: false,
  },
  STALE_STATE: {
    family: 'stale_data',
    userMessage: 'Credit-line data is out of date. Refresh and review before trying again.',
    action: 'refresh_data',
    retrySafe: false,
  },
  PRECONDITION_FAILED: {
    family: 'stale_data',
    userMessage: 'The credit line changed since you loaded it. Refresh and try again.',
    action: 'refresh_data',
    retrySafe: false,
  },
  SERVICE_UNAVAILABLE: {
    family: 'service_unavailable',
    userMessage: 'The credit service is temporarily unavailable. Try again shortly.',
    action: 'wait_and_retry',
    retrySafe: true,
  },
  GATEWAY_TIMEOUT: {
    family: 'service_unavailable',
    userMessage: 'The request timed out. You can safely retry in a moment.',
    action: 'wait_and_retry',
    retrySafe: true,
  },
  RATE_LIMITED: {
    family: 'service_unavailable',
    userMessage: 'Too many requests. Wait briefly, then retry.',
    action: 'wait_and_retry',
    retrySafe: true,
  },
  UNKNOWN: {
    family: 'unknown',
    userMessage: 'Something went wrong. If this continues, contact support with the reference ID.',
    action: 'contact_support',
    retrySafe: false,
  },
};

const ACTION_LABEL: Record<CreditApiErrorAction, string> = {
  fix_amount: 'Edit amount',
  reconnect_wallet: 'Reconnect wallet',
  refresh_data: 'Refresh',
  wait_and_retry: 'Retry',
  contact_support: 'Contact support',
  none: '',
};

export function actionLabelFor(action: CreditApiErrorAction): string {
  return ACTION_LABEL[action];
}

function normalizeCode(raw: string | undefined): CreditApiErrorCode | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, '_');
  return (CREDIT_API_ERROR_CODES as readonly string[]).includes(upper)
    ? (upper as CreditApiErrorCode)
    : null;
}

function codeFromHttpStatus(status?: number): CreditApiErrorCode | null {
  if (status === undefined || Number.isNaN(status)) return null;
  if (status === 400 || status === 422) return 'INVALID_AMOUNT';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 409) return 'CONFLICT';
  if (status === 412) return 'PRECONDITION_FAILED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 503) return 'SERVICE_UNAVAILABLE';
  if (status === 504) return 'GATEWAY_TIMEOUT';
  return null;
}

function extractFromRaw(raw: unknown): {
  code?: string;
  message?: string;
  correlationId?: string;
  httpStatus?: number;
} {
  if (raw == null) return {};

  if (typeof raw === 'string') {
    return { message: raw };
  }

  if (raw instanceof Error) {
    const anyErr = raw as Error & {
      code?: string;
      correlationId?: string;
      status?: number;
      response?: { status?: number; headers?: Headers | Record<string, string> };
    };
    const headerCorr =
      anyErr.response?.headers &&
      typeof (anyErr.response.headers as Headers).get === 'function'
        ? (anyErr.response.headers as Headers).get('x-correlation-id') ??
          (anyErr.response.headers as Headers).get('x-request-id')
        : undefined;
    return {
      code: anyErr.code,
      message: anyErr.message,
      correlationId: anyErr.correlationId ?? headerCorr ?? undefined,
      httpStatus: anyErr.status ?? anyErr.response?.status,
    };
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const errObj =
      obj.error && typeof obj.error === 'object'
        ? (obj.error as Record<string, unknown>)
        : obj;
    return {
      code:
        (typeof errObj.code === 'string' && errObj.code) ||
        (typeof obj.code === 'string' && obj.code) ||
        undefined,
      message:
        (typeof errObj.message === 'string' && errObj.message) ||
        (typeof obj.message === 'string' && obj.message) ||
        undefined,
      correlationId:
        (typeof errObj.correlationId === 'string' && errObj.correlationId) ||
        (typeof obj.correlationId === 'string' && obj.correlationId) ||
        (typeof obj.correlation_id === 'string' && obj.correlation_id) ||
        undefined,
      httpStatus:
        typeof obj.status === 'number'
          ? obj.status
          : typeof obj.httpStatus === 'number'
            ? obj.httpStatus
            : undefined,
    };
  }

  return { message: String(raw) };
}

/**
 * Map a raw credit-API failure into a safe, actionable `CreditApiError`.
 */
export function mapCreditApiError(
  raw: unknown,
  httpStatus?: number,
  correlationId?: string,
): CreditApiError {
  const extracted = extractFromRaw(raw);
  const status = httpStatus ?? extracted.httpStatus;
  const corr = correlationId ?? extracted.correlationId;

  const fromExplicit = normalizeCode(extracted.code);
  const fromStatus = codeFromHttpStatus(status);
  const fromMessage = (() => {
    const lower = (extracted.message ?? '').toLowerCase();
    if (!lower) return null;
    if (lower.includes('insufficient') || lower.includes('available credit')) {
      return 'AMOUNT_ABOVE_AVAILABLE' as const;
    }
    if (lower.includes('minimum')) return 'AMOUNT_BELOW_MINIMUM' as const;
    if (lower.includes('invalid amount') || lower.includes('amount')) {
      return 'INVALID_AMOUNT' as const;
    }
    if (lower.includes('stale') || lower.includes('out of date')) {
      return 'STALE_STATE' as const;
    }
    if (lower.includes('wallet') && lower.includes('connect')) {
      return 'WALLET_NOT_CONNECTED' as const;
    }
    if (lower.includes('unauthorized') || lower.includes('401')) {
      return 'UNAUTHORIZED' as const;
    }
    if (lower.includes('forbidden') || lower.includes('403')) {
      return 'FORBIDDEN' as const;
    }
    if (lower.includes('conflict') || lower.includes('duplicate')) {
      return 'CONFLICT' as const;
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'GATEWAY_TIMEOUT' as const;
    }
    if (lower.includes('unavailable') || lower.includes('503')) {
      return 'SERVICE_UNAVAILABLE' as const;
    }
    if (lower.includes('rate limit') || lower.includes('too many')) {
      return 'RATE_LIMITED' as const;
    }
    return null;
  })();

  const code: CreditApiErrorCode =
    fromExplicit ?? fromStatus ?? fromMessage ?? 'UNKNOWN';
  const policy = CODE_POLICY[code];

  const withCorr =
    corr && policy.family === 'unknown'
      ? `${policy.userMessage} Reference: ${corr}.`
      : corr && policy.action === 'contact_support'
        ? `${policy.userMessage} Reference: ${corr}.`
        : policy.userMessage;

  return {
    family: policy.family,
    code,
    userMessage: withCorr,
    action: policy.action,
    retrySafe: policy.retrySafe,
    correlationId: corr,
  };
}

/** Exhaustive list of documented codes (for tests / docs). */
export function allDocumentedCreditApiErrorCodes(): readonly CreditApiErrorCode[] {
  return CREDIT_API_ERROR_CODES;
}

export function policyForCode(code: CreditApiErrorCode): ErrorPolicy {
  return CODE_POLICY[code];
}
