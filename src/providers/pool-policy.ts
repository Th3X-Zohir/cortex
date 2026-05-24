import type {
  AccountCooldownConfig,
  AccountFailureReason,
  AccountStatus,
  ProviderAccountRecord,
} from '../types.js';

export const UNUSUAL_ACTIVITY_COOLDOWN_SECONDS = 12 * 60 * 60;

/**
 * Pure account-router policy: which account to use, and what cooldown to apply
 * when one fails. Kept free of Playwright / I/O so it can be exhaustively tested.
 */

export interface PickResult {
  chosen: ProviderAccountRecord | null;
  /** Accounts considered (passed filters) — handy for diagnostics. */
  candidates: ProviderAccountRecord[];
}

export function isInCooldown(record: ProviderAccountRecord, now: number = Date.now()): boolean {
  if (!record.cooldown_until) return false;
  return Date.parse(record.cooldown_until) > now;
}

/**
 * Pick a healthy account via priority + LRU.
 *
 * Filter: enabled === 1, not in cooldown, not in `excludeIds`.
 * Sort:   priority ascending (lower = picked first), then last_used_at
 *         ascending (null → 0, i.e. "never used" wins within a priority bucket).
 */
export function pickHealthyAccount(
  records: ProviderAccountRecord[],
  excludeIds: Set<string> = new Set(),
  now: number = Date.now(),
): PickResult {
  const candidates = records
    .filter(a => a.enabled === 1)
    .filter(a => !excludeIds.has(a.id))
    .filter(a => !isInCooldown(a, now));
  if (candidates.length === 0) return { chosen: null, candidates };
  const sorted = [...candidates].sort((a, b) => {
    const pa = typeof a.priority === 'number' ? a.priority : 100;
    const pb = typeof b.priority === 'number' ? b.priority : 100;
    if (pa !== pb) return pa - pb;
    const aT = a.last_used_at ? Date.parse(a.last_used_at) : 0;
    const bT = b.last_used_at ? Date.parse(b.last_used_at) : 0;
    return aT - bT;
  });
  return { chosen: sorted[0], candidates };
}

export interface CooldownDecision {
  until: Date | null;     // null means "no timer — re-login flow instead"
  status: AccountStatus;
}

/** Compute the cooldown to apply for a given failure reason. */
export function cooldownForReason(
  reason: AccountFailureReason,
  cfg: AccountCooldownConfig,
  now: number = Date.now(),
): CooldownDecision {
  const secs = reason === 'rate_limited' ? cfg.rate_limited_seconds
             : reason === 'unusual_activity' ? UNUSUAL_ACTIVITY_COOLDOWN_SECONDS
             : cfg.session_expired_seconds;
  const status: AccountStatus =
    reason === 'unusual_activity' ? 'blocked'
    : reason === 'session_expired' ? 'logged_out'
    : 'cooldown';
  const until = secs > 0 ? new Date(now + secs * 1000) : null;
  return { until, status };
}
