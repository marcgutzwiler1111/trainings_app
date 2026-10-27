import { evaluateStrengthBenchmark, type ExercisePerformance } from './calculations.ts';

/** Input is chronological (oldest first). Separate exact IDs keep separate baselines.
 * Ties and partial performances never establish a new record. O(n) evaluations. */
export function historicalVolumePrs(performances: readonly ExercisePerformance[]) {
  const best = new Map<string, ExercisePerformance>();
  return performances.map(performance => {
    const previous = best.get(performance.exerciseId);
    const result = evaluateStrengthBenchmark(performance, previous ? [previous] : []);
    if (result.isNewPr) best.set(performance.exerciseId, performance);
    return result;
  });
}
