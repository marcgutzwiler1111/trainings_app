import { calculateEffectiveLoad, calculateVolume, relativeToBodyweight, type Load } from '../shared/measurements.ts';
import { integer, nonNegative } from '../shared/validation.ts';

export interface WorkingSet {
  readonly weight: number;
  readonly reps: number;
}

export interface ExercisePerformance {
  /** Exact variant ID, never a display name or muscle group. */
  readonly exerciseId: string;
  /** All planned working sets of this exercise were completed (normally four in MVP).
   * Independent of the overall workout status; the caller supplies exercise completion. */
  readonly isComplete: boolean;
  readonly sets: readonly WorkingSet[];
}

export const calculateSetVolume = calculateVolume;

export function calculateExerciseVolume(sets: readonly WorkingSet[]): number {
  return sets.reduce(
    (sum, set) => nonNegative(sum + calculateSetVolume(set.weight, set.reps), 'exerciseVolume'),
    0,
  );
}

export function calculateStrengthBenchmark(
  exerciseId: string,
  history: readonly ExercisePerformance[],
): number {
  return history.reduce((best, entry) => (
    entry.exerciseId === exerciseId && entry.isComplete
      ? Math.max(best, calculateExerciseVolume(entry.sets))
      : best
  ), 0);
}

/** History must exclude the current session. An empty eligible history has a baseline of 0. */
export function evaluateStrengthBenchmark(
  current: ExercisePerformance,
  history: readonly ExercisePerformance[],
) {
  const previousBenchmark = calculateStrengthBenchmark(current.exerciseId, history);
  const currentVolume = calculateExerciseVolume(current.sets);
  const eligible = current.isComplete;
  return {
    previousBenchmark,
    currentVolume,
    isNewPr: eligible && currentVolume > previousBenchmark,
    newBenchmark: eligible ? Math.max(previousBenchmark, currentVolume) : previousBenchmark,
  };
}

export function calculateE1RM(weight: number, reps: number, rir: number): number {
  nonNegative(weight, 'weight');
  integer(reps, 'reps');
  // The specification defines no upper RIR limit. Fractional RIR is not rounded.
  nonNegative(rir, 'rir');
  return nonNegative(weight * (1 + (reps + rir) / 30), 'e1RM');
}

export const calculateRelativeE1RM = relativeToBodyweight;

export function calculateRelativeStrength(load: Load, bodyweight: number): number {
  return relativeToBodyweight(calculateEffectiveLoad(load, bodyweight), bodyweight);
}
