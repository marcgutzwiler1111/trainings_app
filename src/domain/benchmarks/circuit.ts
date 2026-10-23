import { calculateEffectiveLoad, calculateVolume, relativeToBodyweight } from '../shared/measurements.ts';
import { assertNever, nonNegative } from '../shared/validation.ts';

export type CircuitBenchmarkExerciseKey =
  | 'GOBLET_SQUAT'
  | 'PUSH_UPS'
  | 'KETTLEBELL_SWING'
  | 'PULL_UPS_CHIN_UPS'
  | 'HANGING_LEG_RAISES'
  | 'BURPEES';

export type CircuitBenchmarkLoad =
  | { readonly exercise: 'GOBLET_SQUAT' | 'KETTLEBELL_SWING'; readonly externalLoad: number }
  | { readonly exercise: 'PULL_UPS_CHIN_UPS'; readonly addedLoad: number }
  | { readonly exercise: 'PUSH_UPS' | 'HANGING_LEG_RAISES' | 'BURPEES' };

export interface CircuitRoundResult {
  readonly exercise: CircuitBenchmarkExerciseKey;
  readonly reps: number;
  /** Locked effective weight from the benchmark snapshot, in kg. */
  readonly effectiveWeight: number;
}

export function calculateCircuitEffectiveWeight(load: CircuitBenchmarkLoad, bodyweight: number): number {
  switch (load.exercise) {
    case 'GOBLET_SQUAT':
    case 'KETTLEBELL_SWING':
      return calculateEffectiveLoad({ mode: 'EXTERNAL_ONLY', externalLoad: load.externalLoad }, bodyweight);
    case 'PULL_UPS_CHIN_UPS':
      return calculateEffectiveLoad({ mode: 'BODYWEIGHT_PLUS_EXTERNAL', addedLoad: load.addedLoad }, bodyweight);
    case 'PUSH_UPS':
    case 'HANGING_LEG_RAISES':
    case 'BURPEES':
      return calculateEffectiveLoad({ mode: 'BODYWEIGHT_ONLY' }, bodyweight);
    default:
      return assertNever(load);
  }
}

export const calculateCircuitRowVolume = calculateVolume;

export function calculateCircuitExerciseVolume(
  exercise: CircuitBenchmarkExerciseKey,
  results: readonly CircuitRoundResult[],
): number {
  return results.reduce((sum, row) => row.exercise === exercise
    ? nonNegative(sum + calculateCircuitRowVolume(row.effectiveWeight, row.reps), 'exerciseVolume')
    : sum, 0);
}

export function calculateCircuitTotalVolume(results: readonly CircuitRoundResult[]): number {
  return results.reduce((sum, row) => nonNegative(
    sum + calculateCircuitRowVolume(row.effectiveWeight, row.reps), 'totalVolume',
  ), 0);
}

export const calculateRelativePerformance = relativeToBodyweight;
