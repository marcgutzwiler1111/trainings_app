import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateE1RM, calculateExerciseVolume, calculateRelativeE1RM, calculateRelativeStrength, calculateSetVolume, calculateStrengthBenchmark, evaluateStrengthBenchmark, type ExercisePerformance } from '../src/domain/strength/calculations.ts';
import { calculateEffectiveLoad, type Load } from '../src/domain/shared/measurements.ts';

const sets = Object.freeze([
  Object.freeze({ weight: 100, reps: 8 }),
  Object.freeze({ weight: 100, reps: 8 }),
  Object.freeze({ weight: 100, reps: 7 }),
  Object.freeze({ weight: 100, reps: 6 }),
]);
const history: readonly ExercisePerformance[] = Object.freeze([
  { exerciseId: 'bench', isComplete: true, sets: Array(4).fill({ weight: 100, reps: 5 }) },
  { exerciseId: 'bench', isComplete: true, sets: Array(4).fill({ weight: 100, reps: 7 }) },
  { exerciseId: 'bench', isComplete: false, sets: [{ weight: 1000, reps: 50 }] },
  { exerciseId: 'bench-variant', isComplete: true, sets: Array(4).fill({ weight: 2000, reps: 5 }) },
]);

test('100 kg × 8 reps produces a set volume of 800', () => {
  assert.equal(calculateSetVolume(100, 8), 800);
});

test('four working sets produce 2900 total volume without modifying the sets', () => {
  assert.equal(calculateExerciseVolume(sets), 2900);
  assert.equal(sets[0].reps, 8);
});

test('exercise volume accepts empty, single-set and more than four-set inputs', () => {
  assert.equal(calculateExerciseVolume([]), 0);
  assert.equal(calculateExerciseVolume([{ weight: 2.5, reps: 3 }]), 7.5);
  assert.equal(calculateExerciseVolume(Array(6).fill({ weight: 100, reps: 8 })), 4800);
});

test('Strength Benchmark uses only completed exercises for the exact exercise ID', () => {
  assert.equal(calculateStrengthBenchmark('bench', history), 2800);
  assert.equal(calculateStrengthBenchmark('unknown', history), 0);
});

test('a higher completed Exercise Volume establishes a new Strength PR', () => {
  assert.deepEqual(evaluateStrengthBenchmark({ exerciseId: 'bench', isComplete: true, sets }, history), {
    previousBenchmark: 2800, currentVolume: 2900, isNewPr: true, newBenchmark: 2900,
  });
});

for (const reps of [27, 28]) {
  test(`a volume of ${reps * 100} does not beat an existing 2800 PR`, () => {
    assert.deepEqual(evaluateStrengthBenchmark({ exerciseId: 'bench', isComplete: true, sets: Array.from({ length: 4 }, (_, index) => ({ weight: 100, reps: index === 3 ? reps - 21 : 7 })) }, history), {
      previousBenchmark: 2800, currentVolume: reps * 100, isNewPr: false, newBenchmark: 2800,
    });
  });
}

for (const workoutStatus of ['COMPLETE', 'INCOMPLETE'] as const) {
  test(`a completed Strength exercise remains eligible in an overall ${workoutStatus} workout`, () => {
    const workout = { status: workoutStatus, strength: { exerciseId: 'bench', isComplete: true, sets } };
    assert.deepEqual(evaluateStrengthBenchmark(workout.strength, history), {
      previousBenchmark: 2800, currentVolume: 2900, isNewPr: true, newBenchmark: 2900,
    });
    assert.equal(calculateStrengthBenchmark('bench', [workout.strength]), 2900);
  });
}

test('two completed sets produce an interim volume but cannot update the benchmark', () => {
  const partial: ExercisePerformance = {
    exerciseId: 'bench', isComplete: false,
    sets: [{ weight: 100, reps: 8 }, { weight: 100, reps: 7 }],
  };
  assert.deepEqual(evaluateStrengthBenchmark(partial, []), {
    previousBenchmark: 0, currentVolume: 1500, isNewPr: false, newBenchmark: 0,
  });
});

test('an unfinished exercise cannot set a PR even when its interim volume beats the benchmark', () => {
  const partial: ExercisePerformance = {
    exerciseId: 'bench', isComplete: false, sets: [{ weight: 200, reps: 8 }, { weight: 200, reps: 7 }],
  };
  assert.deepEqual(evaluateStrengthBenchmark(partial, history), {
    previousBenchmark: 2800, currentVolume: 3000, isNewPr: false, newBenchmark: 2800,
  });
  assert.equal(calculateStrengthBenchmark('bench', [...history, partial]), 2800);
});

test('the first positive completed volume beats an empty history baseline of zero', () => {
  assert.deepEqual(evaluateStrengthBenchmark({ exerciseId: 'bench', isComplete: true, sets }, []), {
    previousBenchmark: 0, currentVolume: 2900, isNewPr: true, newBenchmark: 2900,
  });
  assert.equal(evaluateStrengthBenchmark({ exerciseId: 'bench', isComplete: true, sets: [] }, []).isNewPr, false);
});

test('RIR-aware Epley: 100 × 6 @ RIR 2 retains full precision', () => {
  assert.equal(calculateE1RM(100, 6, 2), 100 * (1 + 8 / 30));
  assert.ok(Math.abs(calculateE1RM(100, 6, 2) - 126.66666666666667) < 1e-12);
});

test('Epley accepts RIR zero and fractional RIR without rounding', () => {
  assert.equal(calculateE1RM(100, 6, 0), 120);
  assert.equal(calculateE1RM(100, 6, 0.5), 100 * (1 + 6.5 / 30));
  assert.equal(calculateE1RM(0, 0, 0), 0);
});

test('Relative e1RM divides the unrounded estimate by positive bodyweight', () => {
  assert.equal(calculateRelativeE1RM(126.7, 90), 126.7 / 90);
});

const modes: readonly [Load, number, number][] = [
  [{ mode: 'EXTERNAL_ONLY', externalLoad: 100 }, 100, 1.25],
  [{ mode: 'BODYWEIGHT_PLUS_EXTERNAL', addedLoad: 20 }, 100, 1.25],
  [{ mode: 'BODYWEIGHT_ONLY' }, 80, 1],
  [{ mode: 'BODYWEIGHT_PLUS_EXTERNAL', addedLoad: 0 }, 80, 1],
  [{ mode: 'EXTERNAL_ONLY', externalLoad: 0 }, 0, 0],
];
for (const [load, effective, relative] of modes) {
  test(`load ${JSON.stringify(load)} produces effective ${effective} and relative ${relative}`, () => {
    assert.equal(calculateEffectiveLoad(load, 80), effective);
    assert.equal(calculateRelativeStrength(load, 80), relative);
  });
}

for (const value of [-1, NaN, Infinity, -Infinity]) {
  test(`invalid weight, RIR and bodyweight ${value} are rejected`, () => {
    assert.throws(() => calculateSetVolume(value, 8), RangeError);
    assert.throws(() => calculateE1RM(100, 6, value), RangeError);
    assert.throws(() => calculateRelativeE1RM(100, value), RangeError);
    assert.throws(() => calculateRelativeStrength({ mode: 'BODYWEIGHT_ONLY' }, value), RangeError);
  });
}

test('zero bodyweight is rejected for every relative metric and load mode', () => {
  assert.throws(() => calculateRelativeE1RM(100, 0), RangeError);
  for (const [load] of modes) assert.throws(() => calculateRelativeStrength(load, 0), RangeError);
});

test('negative external or added loads cannot produce a plausible relative result', () => {
  assert.throws(() => calculateRelativeStrength({ mode: 'EXTERNAL_ONLY', externalLoad: -1 }, 80), RangeError);
  assert.throws(() => calculateRelativeStrength({ mode: 'BODYWEIGHT_PLUS_EXTERNAL', addedLoad: -1 }, 80), RangeError);
});

for (const reps of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  test(`invalid repetition count ${reps} is rejected by volume and Epley calculations`, () => {
    assert.throws(() => calculateSetVolume(100, reps), RangeError);
    assert.throws(() => calculateE1RM(100, reps, 2), RangeError);
  });
}

test('non-finite arithmetic outputs are rejected instead of leaking Infinity', () => {
  assert.throws(() => calculateSetVolume(Number.MAX_VALUE, 2), RangeError);
  assert.throws(() => calculateExerciseVolume([{ weight: Number.MAX_VALUE, reps: 1 }, { weight: Number.MAX_VALUE, reps: 1 }]), RangeError);
  assert.throws(() => calculateE1RM(Number.MAX_VALUE, 60, 0), RangeError);
  assert.throws(() => calculateRelativeE1RM(Number.MAX_VALUE, Number.MIN_VALUE), RangeError);
});
