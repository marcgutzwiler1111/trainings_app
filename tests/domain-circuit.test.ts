import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCircuitDuration } from '../src/domain/circuit/duration.ts';
import { calculateCircuitEffectiveWeight, calculateCircuitExerciseVolume, calculateCircuitRowVolume, calculateCircuitTotalVolume, calculateRelativePerformance, type CircuitBenchmarkLoad, type CircuitRoundResult } from '../src/domain/benchmarks/circuit.ts';

for (const [stations, rounds, expected] of [[6, 5, 1800], [1, 1, 60], [4, 3, 720]]) {
  test(`${stations} stations × ${rounds} rounds have a duration of ${expected} seconds`, () => {
    assert.equal(calculateCircuitDuration(stations, rounds), expected);
  });
}

for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid station or round count ${invalid} is rejected`, () => {
    assert.throws(() => calculateCircuitDuration(invalid, 5), RangeError);
    assert.throws(() => calculateCircuitDuration(6, invalid), RangeError);
  });
}

test('Circuit duration rejects results outside the safe integer range', () => {
  assert.throws(() => calculateCircuitDuration(Number.MAX_SAFE_INTEGER, 2), RangeError);
});

const loads: readonly [CircuitBenchmarkLoad, number][] = [
  [{ exercise: 'GOBLET_SQUAT', externalLoad: 20 }, 20],
  [{ exercise: 'PUSH_UPS' }, 80],
  [{ exercise: 'KETTLEBELL_SWING', externalLoad: 24 }, 24],
  [{ exercise: 'PULL_UPS_CHIN_UPS', addedLoad: 10 }, 90],
  [{ exercise: 'HANGING_LEG_RAISES' }, 80],
  [{ exercise: 'BURPEES' }, 80],
];
for (const [load, expected] of loads) {
  test(`${load.exercise} has an effective weight of ${expected} kg at 80 kg bodyweight`, () => {
    assert.equal(calculateCircuitEffectiveWeight(load, 80), expected);
  });
}

test('unweighted pull-ups use the full bodyweight', () => {
  assert.equal(calculateCircuitEffectiveWeight({ exercise: 'PULL_UPS_CHIN_UPS', addedLoad: 0 }, 80), 80);
});

test('Circuit effective weight rejects missing bodyweight and negative loads', () => {
  for (const [load] of loads) assert.throws(() => calculateCircuitEffectiveWeight(load, 0), RangeError);
  assert.throws(() => calculateCircuitEffectiveWeight({ exercise: 'GOBLET_SQUAT', externalLoad: -1 }, 80), RangeError);
  assert.throws(() => calculateCircuitEffectiveWeight({ exercise: 'PULL_UPS_CHIN_UPS', addedLoad: -1 }, 80), RangeError);
});

const results: readonly CircuitRoundResult[] = Object.freeze([
  Object.freeze({ exercise: 'GOBLET_SQUAT', reps: 10, effectiveWeight: 20 }),
  Object.freeze({ exercise: 'PUSH_UPS', reps: 12, effectiveWeight: 80 }),
  Object.freeze({ exercise: 'GOBLET_SQUAT', reps: 8, effectiveWeight: 20 }),
]);

test('Circuit row volume multiplies reps by the locked effective weight', () => {
  assert.equal(calculateCircuitRowVolume(20, 10), 200);
  assert.equal(calculateCircuitRowVolume(80, 0), 0);
});

test('Circuit exercise volume sums that exact exercise across arbitrary result arrays', () => {
  assert.equal(calculateCircuitExerciseVolume('GOBLET_SQUAT', results), 360);
  assert.equal(calculateCircuitExerciseVolume('PUSH_UPS', results), 960);
  assert.equal(calculateCircuitExerciseVolume('BURPEES', results), 0);
});

test('Circuit total volume sums all rows without requiring a full benchmark', () => {
  assert.equal(calculateCircuitTotalVolume(results), 1320);
  assert.equal(calculateCircuitTotalVolume([...results].reverse()), 1320);
  assert.equal(results[0].reps, 10);
});

test('empty Circuit results have zero exercise and total volume', () => {
  assert.equal(calculateCircuitExerciseVolume('GOBLET_SQUAT', []), 0);
  assert.equal(calculateCircuitTotalVolume([]), 0);
  assert.equal(calculateRelativePerformance(0, 80), 0);
});

test('six exercises and five rounds produce volume 18700 and Relative Performance 233.75', () => {
  const rows: CircuitRoundResult[] = [];
  for (let round = 0; round < 5; round++) {
    for (const [load, effectiveWeight] of loads) rows.push({ exercise: load.exercise, effectiveWeight, reps: 10 });
  }
  assert.equal(calculateCircuitTotalVolume(rows), 18700);
  assert.equal(calculateCircuitExerciseVolume('PULL_UPS_CHIN_UPS', rows), 4500);
  assert.equal(calculateRelativePerformance(18700, 80), 233.75);
});

test('Relative Performance uses total volume divided by bodyweight without rounding', () => {
  assert.equal(calculateRelativePerformance(1320, 90), 1320 / 90);
  for (const invalid of [0, -1, NaN, Infinity]) {
    assert.throws(() => calculateRelativePerformance(1320, invalid), RangeError);
  }
});

test('Circuit volumes reject invalid rows and non-finite totals', () => {
  assert.throws(() => calculateCircuitTotalVolume([{ exercise: 'BURPEES', reps: -1, effectiveWeight: 80 }]), RangeError);
  assert.throws(() => calculateCircuitRowVolume(-1, 10), RangeError);
  assert.throws(() => calculateCircuitTotalVolume([
    { exercise: 'BURPEES', reps: 1, effectiveWeight: Number.MAX_VALUE },
    { exercise: 'BURPEES', reps: 1, effectiveWeight: Number.MAX_VALUE },
  ]), RangeError);
});
