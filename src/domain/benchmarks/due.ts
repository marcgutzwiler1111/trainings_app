import type { SessionStatus } from '../shared/types.ts';
import { assertNever } from '../shared/validation.ts';

export type ScheduledBenchmarkType = 'POWER' | 'CIRCUIT';
export type BenchmarkDueState =
  | { readonly status: 'NOT_TESTED_YET' }
  | { readonly status: 'NOT_DUE'; readonly daysRemaining: number }
  | { readonly status: 'DUE'; readonly daysOverdue: number };

export interface ScheduledBenchmarkSession {
  readonly benchmarkType: ScheduledBenchmarkType;
  readonly status: SessionStatus;
  /** Absolute UTC instant (milliseconds since Unix epoch), not a calendar date. */
  readonly completedAtMs: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const INTERVAL_MS = 30 * DAY_MS;

function validateInstant(value: number): void {
  if (!Number.isSafeInteger(value) || Math.abs(value) > 8_640_000_000_000_000) {
    throw new RangeError('Timestamp must be a valid integer Unix timestamp in milliseconds.');
  }
}

/** Thirty elapsed UTC days; timezone and daylight-saving changes have no effect. */
export function calculateBenchmarkDueState(
  benchmarkType: ScheduledBenchmarkType,
  sessions: readonly ScheduledBenchmarkSession[],
  nowMs: number,
): BenchmarkDueState {
  switch (benchmarkType) {
    case 'POWER':
    case 'CIRCUIT':
      break;
    default:
      return assertNever(benchmarkType);
  }
  validateInstant(nowMs);
  let latest: number | null = null;
  for (const session of sessions) {
    if (session.benchmarkType !== benchmarkType || session.status !== 'COMPLETE') continue;
    if (session.completedAtMs === null) throw new RangeError('A COMPLETE benchmark needs a completion timestamp.');
    validateInstant(session.completedAtMs);
    if (session.completedAtMs > nowMs) throw new RangeError('Completion timestamp cannot be in the future.');
    latest = latest === null ? session.completedAtMs : Math.max(latest, session.completedAtMs);
  }
  if (latest === null) return { status: 'NOT_TESTED_YET' };
  const remainingMs = INTERVAL_MS - (nowMs - latest);
  return remainingMs > 0
    ? { status: 'NOT_DUE', daysRemaining: Math.ceil(remainingMs / DAY_MS) }
    : { status: 'DUE', daysOverdue: Math.max(0, Math.floor(-remainingMs / DAY_MS)) };
}
