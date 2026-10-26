import type { PowerBenchmarkTestType, PowerTestConditions } from './power.ts';
import type { Side } from '../shared/types.ts';
import { integer, positive } from '../shared/validation.ts';
import { nextCircuitPosition, type CircuitPosition } from '../circuit/progression.ts';

export const powerProtocol = [
  { testType: 'STANDING_BROAD_JUMP', label: 'Standing Broad Jump', sides: ['NONE'] },
  { testType: 'ROTATIONAL_THROW', label: 'Rotational Medicine Ball Throw', sides: ['LEFT', 'RIGHT'] },
  { testType: 'CHEST_PASS', label: 'Medicine Ball Chest Pass', sides: ['NONE'] },
  { testType: 'SHOT_PUT_THROW', label: 'Medicine Ball Shot-Put Throw', sides: ['LEFT', 'RIGHT'] },
] as const;
export interface PowerSetup { rotation: number; chest: number; shotPut: number }
export function powerConditions(setup: PowerSetup): PowerTestConditions[] {
  positive(setup.rotation, 'rotation ball'); positive(setup.chest, 'chest ball'); positive(setup.shotPut, 'shot-put ball');
  return [{ testType: 'STANDING_BROAD_JUMP', side: 'NONE' },
    { testType: 'ROTATIONAL_THROW', side: 'LEFT', medicineBallWeight: setup.rotation },
    { testType: 'ROTATIONAL_THROW', side: 'RIGHT', medicineBallWeight: setup.rotation },
    { testType: 'CHEST_PASS', side: 'NONE', medicineBallWeight: setup.chest },
    { testType: 'SHOT_PUT_THROW', side: 'LEFT', medicineBallWeight: setup.shotPut },
    { testType: 'SHOT_PUT_THROW', side: 'RIGHT', medicineBallWeight: setup.shotPut }];
}
export function bestPowerAttempt(values: readonly number[]): number | null {
  values.forEach(value => positive(value, 'attempt')); return values.length ? Math.max(...values) : null;
}
export interface PowerGroup {
  testType: PowerBenchmarkTestType; side: Side; unit: string; ballWeight: number | null; attempts: readonly { number: number; value: number }[];
}
export function completePowerGroup(group: PowerGroup): boolean {
  return group.attempts.length === 3 && [1,2,3].every(number => group.attempts.some(attempt => attempt.number === number && Number.isFinite(attempt.value) && attempt.value > 0));
}
export function powerProgress(groups: readonly PowerGroup[]) {
  const completeTests = powerProtocol.map(test => test.sides.every(side => {
    const group = groups.find(group => group.testType === test.testType && group.side === side);
    return group !== undefined && completePowerGroup(group);
  }));
  const missing = completeTests.indexOf(false);
  return { completeTests, currentTest: missing < 0 ? 3 : missing, ready: groups.length === 6 && completeTests.every(Boolean) };
}
export const circuitBenchmarkFormat = { rounds: 5, stations: 6, stationSeconds: 60 } as const;
/** Saved cells determine the first unsaved station. No wall clock or separate cursor is needed. */
export function circuitBenchmarkCursor(results: readonly { round: number; station: number }[]): CircuitPosition | null {
  const keys = new Set<string>();
  for (const row of results) {
    integer(row.round, 'round', 1); integer(row.station, 'station', 1);
    if (row.round > circuitBenchmarkFormat.rounds || row.station > circuitBenchmarkFormat.stations || keys.has(`${row.round}/${row.station}`)) throw new RangeError('Invalid benchmark result coordinates.');
    keys.add(`${row.round}/${row.station}`);
  }
  let cursor: CircuitPosition | null = { round: 1, station: 1 };
  while (cursor && keys.has(`${cursor.round}/${cursor.station}`)) cursor = nextCircuitPosition(circuitBenchmarkFormat.rounds,circuitBenchmarkFormat.stations,cursor);
  return cursor;
}
