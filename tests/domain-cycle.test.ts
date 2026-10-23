import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeRest, completeWorkout, getCycleItem, nextCyclePosition, type CyclePosition } from '../src/domain/cycle/cycle.ts';
import type { SessionStatus, WorkoutType } from '../src/domain/shared/types.ts';

const expectedCycle = ['UK_HAMS', 'OK_BRUST', 'REST', 'UK_QUADS', 'OK_RUECKEN', 'REST'] as const;
for (const [index, expected] of expectedCycle.entries()) {
  const position = (index + 1) as CyclePosition;
  test(`cycle position ${position} is ${expected}`, () => {
    assert.deepEqual(getCycleItem(position), expected === 'REST'
      ? { position, type: 'REST' }
      : { position, type: 'WORKOUT', workoutType: expected });
  });
  test(`cycle transition ${position} → ${position === 6 ? 1 : position + 1}`, () => {
    assert.equal(nextCyclePosition(position), position === 6 ? 1 : position + 1);
  });
}

test('six explicit events return to the starting position without calendar input', () => {
  let position: CyclePosition = 1;
  for (let i = 0; i < 6; i++) position = nextCyclePosition(position);
  assert.equal(position, 1);
});

test('returned cycle items cannot change the canonical cycle', () => {
  const item = getCycleItem(1);
  Object.assign(item, { workoutType: 'OK_BRUST' });
  assert.equal(getCycleItem(1).type, 'WORKOUT');
  assert.deepEqual(getCycleItem(1), { position: 1, type: 'WORKOUT', workoutType: 'UK_HAMS' });
});

for (const position of [0, 7, -1, 1.5, NaN, Infinity]) {
  test(`invalid cycle position ${position} is rejected`, () => {
    assert.throws(() => getCycleItem(position as CyclePosition), RangeError);
    assert.throws(() => nextCyclePosition(position as CyclePosition), RangeError);
  });
}

for (const [position, workoutType] of [[1, 'UK_HAMS'], [2, 'OK_BRUST'], [4, 'UK_QUADS'], [5, 'OK_RUECKEN']] as const) {
  test(`COMPLETE matching ${workoutType} advances position ${position}`, () => {
    assert.deepEqual(completeWorkout({ position, workoutType, status: 'COMPLETE' }), {
      position: position + 1, outcome: 'ADVANCED',
    });
  });
}

for (const status of ['PLANNED', 'IN_PROGRESS', 'INCOMPLETE'] as const satisfies readonly SessionStatus[]) {
  test(`${status} cannot advance even with an explicit override choice`, () => {
    for (const workoutType of ['UK_HAMS', 'OK_BRUST'] as const) {
      for (const manualOverride of [undefined, 'CONTINUE_CYCLE_NORMALLY', 'COUNT_AS_CURRENT_CYCLE_WORKOUT'] as const) {
        assert.deepEqual(completeWorkout({ position: 1, workoutType, status, manualOverride }), {
          position: 1, outcome: 'UNCHANGED',
        });
      }
    }
  });
}

test('a completed override requires a decision and leaves the position pending', () => {
  assert.deepEqual(completeWorkout({ position: 1, workoutType: 'OK_BRUST', status: 'COMPLETE' }), {
    position: 1, outcome: 'OVERRIDE_REQUIRED',
  });
});

test('CONTINUE_CYCLE_NORMALLY keeps the original expected workout pending', () => {
  assert.deepEqual(completeWorkout({ position: 1, workoutType: 'OK_BRUST', status: 'COMPLETE', manualOverride: 'CONTINUE_CYCLE_NORMALLY' }), {
    position: 1, outcome: 'UNCHANGED',
  });
});

test('COUNT_AS_CURRENT_CYCLE_WORKOUT advances exactly one item, not to the performed workout position', () => {
  assert.deepEqual(completeWorkout({ position: 1, workoutType: 'OK_RUECKEN', status: 'COMPLETE', manualOverride: 'COUNT_AS_CURRENT_CYCLE_WORKOUT' }), {
    position: 2, outcome: 'ADVANCED',
  });
});

for (const position of [3, 6] as const) {
  test(`Rest at position ${position} advances only through an explicit completion`, () => {
    assert.deepEqual(completeRest(position), { position: position === 6 ? 1 : 4, outcome: 'ADVANCED' });
    assert.deepEqual(completeWorkout({ position, workoutType: 'UK_HAMS', status: 'COMPLETE' }), {
      position, outcome: 'OVERRIDE_REQUIRED',
    });
    assert.deepEqual(completeWorkout({ position, workoutType: 'UK_HAMS', status: 'COMPLETE', manualOverride: 'COUNT_AS_CURRENT_CYCLE_WORKOUT' }), {
      position: position === 6 ? 1 : 4, outcome: 'ADVANCED',
    });
  });
}

test('Rest completion refuses to skip a workout item', () => {
  assert.throws(() => completeRest(1), /not Rest/);
});

test('unsupported workout and session status values fail instead of advancing', () => {
  assert.throws(() => completeWorkout({ position: 1, workoutType: 'OTHER' as WorkoutType, status: 'COMPLETE' }), RangeError);
  assert.throws(() => completeWorkout({ position: 1, workoutType: 'UK_HAMS', status: 'OTHER' as SessionStatus }), RangeError);
});
