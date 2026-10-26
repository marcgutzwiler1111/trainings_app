import { circuitPlan } from './progression.ts';

export function calculateCircuitDuration(stationCount: number, roundCount: number): number {
  return circuitPlan(roundCount, stationCount, 60).durationSeconds;
}
