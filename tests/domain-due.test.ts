import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateBenchmarkDueState, type ScheduledBenchmarkSession, type ScheduledBenchmarkType } from '../src/domain/benchmarks/due.ts';

const day = 86_400_000;
const completedAtMs = Date.parse('2026-03-01T12:00:00.000Z');
const complete: ScheduledBenchmarkSession = Object.freeze({ benchmarkType: 'POWER', status: 'COMPLETE', completedAtMs });

test('no completed benchmark produces NOT_TESTED_YET', () => {
  assert.deepEqual(calculateBenchmarkDueState('POWER', [], completedAtMs), { status: 'NOT_TESTED_YET' });
});

for (const [elapsedDays, state] of [
  [0, { status: 'NOT_DUE', daysRemaining: 30 }],
  [29, { status: 'NOT_DUE', daysRemaining: 1 }],
  [30, { status: 'DUE', daysOverdue: 0 }],
  [35, { status: 'DUE', daysOverdue: 5 }],
] as const) {
  test(`Power benchmark due state at day ${elapsedDays}`, () => {
    assert.deepEqual(calculateBenchmarkDueState('POWER', [complete], completedAtMs + elapsedDays * day), state);
  });
}

test('the exact 30-day boundary is due, but one millisecond earlier is not', () => {
  assert.deepEqual(calculateBenchmarkDueState('POWER', [complete], completedAtMs + 30 * day - 1), {
    status: 'NOT_DUE', daysRemaining: 1,
  });
  assert.deepEqual(calculateBenchmarkDueState('POWER', [complete], completedAtMs + 30 * day + 1), {
    status: 'DUE', daysOverdue: 0,
  });
});

test('remaining days round up and overdue days count only fully elapsed days', () => {
  assert.deepEqual(calculateBenchmarkDueState('POWER', [complete], completedAtMs + 28.5 * day), {
    status: 'NOT_DUE', daysRemaining: 2,
  });
  assert.deepEqual(calculateBenchmarkDueState('POWER', [complete], completedAtMs + 35.9 * day), {
    status: 'DUE', daysOverdue: 5,
  });
});

for (const status of ['PLANNED', 'IN_PROGRESS', 'INCOMPLETE'] as const) {
  test(`${status} sessions are ignored even if more recent or without a completion date`, () => {
    const sessions: readonly ScheduledBenchmarkSession[] = [
      complete,
      { benchmarkType: 'POWER', status, completedAtMs: completedAtMs + 34 * day },
      { benchmarkType: 'POWER', status, completedAtMs: null },
    ];
    assert.deepEqual(calculateBenchmarkDueState('POWER', sessions, completedAtMs + 35 * day), {
      status: 'DUE', daysOverdue: 5,
    });
    assert.deepEqual(calculateBenchmarkDueState('POWER', sessions.slice(1), completedAtMs + 35 * day), {
      status: 'NOT_TESTED_YET',
    });
  });
}

test('Power and Circuit due states are independent', () => {
  const sessions: readonly ScheduledBenchmarkSession[] = Object.freeze([
    complete,
    Object.freeze({ benchmarkType: 'CIRCUIT', status: 'COMPLETE', completedAtMs: completedAtMs + 20 * day }),
  ]);
  const nowMs = completedAtMs + 35 * day;
  assert.deepEqual(calculateBenchmarkDueState('POWER', sessions, nowMs), { status: 'DUE', daysOverdue: 5 });
  assert.deepEqual(calculateBenchmarkDueState('CIRCUIT', sessions, nowMs), { status: 'NOT_DUE', daysRemaining: 15 });
  assert.deepEqual(calculateBenchmarkDueState('CIRCUIT', [complete], nowMs), { status: 'NOT_TESTED_YET' });
});

test('the latest COMPLETE session wins regardless of input order', () => {
  const sessions: readonly ScheduledBenchmarkSession[] = [
    { ...complete, completedAtMs: completedAtMs + 10 * day }, complete,
    { ...complete, completedAtMs: completedAtMs + 5 * day },
  ];
  assert.deepEqual(calculateBenchmarkDueState('POWER', sessions, completedAtMs + 35 * day), {
    status: 'NOT_DUE', daysRemaining: 5,
  });
  assert.equal(sessions[0].completedAtMs, completedAtMs + 10 * day);
});

test('elapsed UTC days remain deterministic across the Zurich daylight-saving transition', () => {
  const start = Date.parse('2026-03-01T13:00:00+01:00');
  const end = Date.parse('2026-03-31T14:00:00+02:00');
  assert.deepEqual(calculateBenchmarkDueState('POWER', [{ ...complete, completedAtMs: start }], end), {
    status: 'DUE', daysOverdue: 0,
  });
});

test('Unix epoch completion is not mistaken for an absent timestamp', () => {
  assert.deepEqual(calculateBenchmarkDueState('POWER', [{ ...complete, completedAtMs: 0 }], 30 * day), {
    status: 'DUE', daysOverdue: 0,
  });
});

test('a COMPLETE benchmark requires a valid, non-future completion timestamp', () => {
  for (const invalid of [null, NaN, Infinity, 0.5, 8_640_000_000_000_001, completedAtMs + 1]) {
    assert.throws(() => calculateBenchmarkDueState('POWER', [{ ...complete, completedAtMs: invalid }], completedAtMs), RangeError);
  }
});

test('invalid now timestamps and Strength scheduling are rejected', () => {
  for (const now of [NaN, Infinity, 0.5]) {
    assert.throws(() => calculateBenchmarkDueState('POWER', [], now), RangeError);
  }
  assert.throws(() => calculateBenchmarkDueState('STRENGTH' as ScheduledBenchmarkType, [], completedAtMs), RangeError);
});
