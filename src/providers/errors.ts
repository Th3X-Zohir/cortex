import type { AccountFailureReason } from '../types.js';

/**
 * Thrown by per-account chat operations when the failure is account-level
 * (the account is rate-limited, blocked, or its session has expired) and
 * the caller (account pool) should rotate to a different account.
 *
 * Non-account errors (user input, network, DOM-timeouts unrelated to a
 * blocker) MUST NOT be wrapped in this type — they should bubble up so the
 * caller surfaces the original error to the client.
 */
export class AccountFailureError extends Error {
  readonly reason: AccountFailureReason;
  readonly providerMessage: string;

  constructor(reason: AccountFailureReason, providerMessage: string) {
    super(`${reason}: ${providerMessage}`);
    this.name = 'AccountFailureError';
    this.reason = reason;
    this.providerMessage = providerMessage;
  }
}

export function isAccountFailure(err: unknown): err is AccountFailureError {
  return err instanceof AccountFailureError;
}
