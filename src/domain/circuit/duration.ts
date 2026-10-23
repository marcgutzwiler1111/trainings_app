import { integer } from '../shared/validation.ts';

export function calculateCircuitDuration(stationCount: number, roundCount: number): number {
  integer(stationCount, 'stationCount', 1);
  integer(roundCount, 'roundCount', 1);
  return integer(stationCount * roundCount * 60, 'durationSeconds', 1);
}
