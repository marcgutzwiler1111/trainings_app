import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arePowerBenchmarksComparable, type PowerTestConditions } from '../src/domain/benchmarks/power.ts';

for (const testType of ['ROTATIONAL_THROW', 'SHOT_PUT_THROW'] as const) {
  const left: PowerTestConditions = Object.freeze({ testType, side: 'LEFT', medicineBallWeight: 4 });
  test(`${testType}: same side and 4 kg ball are comparable`, () => {
    assert.equal(arePowerBenchmarksComparable(left, { ...left }), true);
  });
  test(`${testType}: a different medicine-ball weight prevents comparison`, () => {
    assert.equal(arePowerBenchmarksComparable(left, { ...left, medicineBallWeight: 5 }), false);
  });
  test(`${testType}: left and right are not comparable`, () => {
    assert.equal(arePowerBenchmarksComparable(left, { ...left, side: 'RIGHT' }), false);
  });
  test(`${testType}: right-side comparisons work independently`, () => {
    assert.equal(arePowerBenchmarksComparable({ ...left, side: 'RIGHT' }, { ...left, side: 'RIGHT' }), true);
  });
}

test('Broad Jump compares by test type without needing a medicine-ball weight', () => {
  assert.equal(arePowerBenchmarksComparable({ testType: 'STANDING_BROAD_JUMP', side: 'NONE' }, { testType: 'STANDING_BROAD_JUMP', side: 'NONE' }), true);
});

test('Chest Pass compares only at the same ball weight', () => {
  const chest: PowerTestConditions = { testType: 'CHEST_PASS', side: 'NONE', medicineBallWeight: 4 };
  assert.equal(arePowerBenchmarksComparable(chest, { ...chest }), true);
  assert.equal(arePowerBenchmarksComparable(chest, { ...chest, medicineBallWeight: 5 }), false);
});

test('different Power test types never compare, even with equal ball weights', () => {
  const conditions: readonly PowerTestConditions[] = [
    { testType: 'STANDING_BROAD_JUMP', side: 'NONE' },
    { testType: 'CHEST_PASS', side: 'NONE', medicineBallWeight: 4 },
    { testType: 'ROTATIONAL_THROW', side: 'LEFT', medicineBallWeight: 4 },
    { testType: 'SHOT_PUT_THROW', side: 'LEFT', medicineBallWeight: 4 },
  ];
  for (const a of conditions) for (const b of conditions) {
    assert.equal(arePowerBenchmarksComparable(a, b), a.testType === b.testType);
  }
});

for (const medicineBallWeight of [0, -1, NaN, Infinity]) {
  test(`invalid medicine-ball weight ${medicineBallWeight} is rejected`, () => {
    const conditions: PowerTestConditions = { testType: 'CHEST_PASS', side: 'NONE', medicineBallWeight };
    assert.throws(() => arePowerBenchmarksComparable(conditions, conditions), RangeError);
  });
}

test('invalid side and unknown test values are rejected at runtime', () => {
  for (const conditions of [
    { testType: 'ROTATIONAL_THROW', side: 'NONE', medicineBallWeight: 4 },
    { testType: 'STANDING_BROAD_JUMP', side: 'LEFT' },
    { testType: 'OTHER', side: 'NONE' },
  ]) {
    assert.throws(() => arePowerBenchmarksComparable(conditions as PowerTestConditions, conditions as PowerTestConditions), RangeError);
  }
});
