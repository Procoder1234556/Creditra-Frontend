import { describe, it, expect } from 'vitest';
import {
  allDocumentedCreditApiErrorCodes,
  mapCreditApiError,
  policyForCode,
  actionLabelFor,
} from './creditApiErrors';
import type { CreditApiErrorCode } from '../types/creditApiError';

describe('mapCreditApiError', () => {
  it('covers every documented error code with a defined action and retry policy', () => {
    const codes = allDocumentedCreditApiErrorCodes();
    expect(codes.length).toBeGreaterThan(0);

    for (const code of codes) {
      const mapped = mapCreditApiError({ code, message: code });
      const policy = policyForCode(code);
      expect(mapped.code).toBe(code);
      expect(mapped.family).toBe(policy.family);
      expect(mapped.action).toBe(policy.action);
      expect(mapped.retrySafe).toBe(policy.retrySafe);
      expect(mapped.userMessage.length).toBeGreaterThan(0);
      if (mapped.retrySafe) {
        expect(mapped.action).toBe('wait_and_retry');
      }
    }
  });

  it.each([
    [400, 'INVALID_AMOUNT'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [409, 'CONFLICT'],
    [412, 'PRECONDITION_FAILED'],
    [429, 'RATE_LIMITED'],
    [503, 'SERVICE_UNAVAILABLE'],
    [504, 'GATEWAY_TIMEOUT'],
  ] as const)('HTTP %s maps to %s', (status, code) => {
    const mapped = mapCreditApiError(new Error('fail'), status);
    expect(mapped.code).toBe(code);
  });

  it('unknown errors stay safe and include correlation id for support', () => {
    const mapped = mapCreditApiError(
      { message: 'boom from nowhere' },
      500,
      'corr-abc-123',
    );
    expect(mapped.family).toBe('unknown');
    expect(mapped.retrySafe).toBe(false);
    expect(mapped.correlationId).toBe('corr-abc-123');
    expect(mapped.userMessage).toMatch(/corr-abc-123/);
    expect(mapped.action).toBe('contact_support');
  });

  it('retrySafe is true only for safe families', () => {
    const retryable: CreditApiErrorCode[] = [
      'CONFLICT',
      'SERVICE_UNAVAILABLE',
      'GATEWAY_TIMEOUT',
      'RATE_LIMITED',
    ];
    for (const code of allDocumentedCreditApiErrorCodes()) {
      const policy = policyForCode(code);
      if (retryable.includes(code)) {
        expect(policy.retrySafe).toBe(true);
      } else {
        expect(policy.retrySafe).toBe(false);
      }
    }
  });

  it('actionLabelFor returns Retry only for wait_and_retry', () => {
    expect(actionLabelFor('wait_and_retry')).toBe('Retry');
    expect(actionLabelFor('fix_amount')).toBe('Edit amount');
    expect(actionLabelFor('none')).toBe('');
  });

  it('maps insufficient-funds style messages to invalid_amount', () => {
    const mapped = mapCreditApiError(new Error('Insufficient funds available'));
    expect(mapped.family).toBe('invalid_amount');
    expect(mapped.retrySafe).toBe(false);
    expect(mapped.action).toBe('fix_amount');
  });
});
