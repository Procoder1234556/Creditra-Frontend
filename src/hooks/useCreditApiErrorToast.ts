import { useCallback } from 'react';
import { useToast } from './useToast';
import {
  actionLabelFor,
  mapCreditApiError,
} from '../lib/creditApiErrors';
import type { CreditApiError } from '../types/creditApiError';

/**
 * Show a credit-API error toast with an action CTA only when appropriate (#921).
 */
export function useCreditApiErrorToast() {
  const toast = useToast();

  const showCreditApiError = useCallback(
    (
      raw: unknown,
      opts?: {
        httpStatus?: number;
        correlationId?: string;
        onRetry?: () => void;
        onFixAmount?: () => void;
        onReconnect?: () => void;
        onRefresh?: () => void;
      },
    ): CreditApiError => {
      const mapped = mapCreditApiError(raw, opts?.httpStatus, opts?.correlationId);
      const label = actionLabelFor(mapped.action);

      let onClick: (() => void) | undefined;
      if (mapped.action === 'wait_and_retry' && mapped.retrySafe && opts?.onRetry) {
        onClick = opts.onRetry;
      } else if (mapped.action === 'fix_amount' && opts?.onFixAmount) {
        onClick = opts.onFixAmount;
      } else if (mapped.action === 'reconnect_wallet' && opts?.onReconnect) {
        onClick = opts.onReconnect;
      } else if (mapped.action === 'refresh_data' && opts?.onRefresh) {
        onClick = opts.onRefresh;
      }

      toast.error('Credit action failed', mapped.userMessage, {
        category: 'credit_line',
        persistent: !mapped.retrySafe,
        action: onClick && label ? { label, onClick } : undefined,
      });

      return mapped;
    },
    [toast],
  );

  return { showCreditApiError, mapCreditApiError };
}
