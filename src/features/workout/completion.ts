import type { createRepositories } from '../../data/repositories/index.ts';
import { WorkoutCompletionError, workoutCompletionIssues } from '../../data/repositories/workout.ts';
import { completeWorkout, getCycleItem, type ManualOverrideResult } from '../../domain/cycle/cycle.ts';
import { calculateExerciseVolume } from '../../domain/strength/calculations.ts';
import { FeatureError } from '../application/errors.ts';
import { workoutLabels } from './builder.ts';

export function createCompletionServices(repositories: ReturnType<typeof createRepositories>) {
  const guarded = async <T,>(task: () => Promise<T>): Promise<T> => {
    try { return await task(); }
    catch (error) {
      if (error instanceof WorkoutCompletionError) throw new FeatureError(error.message);
      throw error;
    }
  };
  const itemLabel = (position: Parameters<typeof getCycleItem>[0]) => {
    const item = getCycleItem(position);
    return item.type === 'REST' ? 'Rest' : workoutLabels[item.workoutType];
  };
  return {
    load: (id: string) => guarded(async () => {
      const snapshot = await repositories.workouts.completionSnapshot(id);
      const { session, power, circuit } = snapshot;
      if (session.status !== 'IN_PROGRESS') throw new FeatureError('Dieses Workout ist nicht mehr aktiv.');
      const issues = workoutCompletionIssues(snapshot);
      const requiresDecision = session.workout_type !== session.expected_workout_type;
      const count = completeWorkout({ position: session.expected_cycle_position, workoutType: session.workout_type,
        status: 'COMPLETE', manualOverride: 'COUNT_AS_CURRENT_CYCLE_WORKOUT' });
      return { session, power, circuit, issues, ready: issues.length === 0, requiresDecision,
        label: workoutLabels[session.workout_type], expectedLabel: itemLabel(session.expected_cycle_position),
        countedNextLabel: itemLabel(count.position),
        strength: snapshot.strength.map(({ exercise, sets }) => ({ exercise, setCount: sets.length,
          volume: calculateExerciseVolume(sets.map(set => ({ weight: set.weight_kg, reps: set.reps }))) })),
      };
    }),
    finish: (id: string, decision?: ManualOverrideResult) => guarded(async () => {
      const result = await repositories.workouts.finish(id, decision);
      if (result.outcome === 'OVERRIDE_REQUIRED') throw new FeatureError('Bitte ausdrücklich wählen, wie das abweichende Training für den Cycle zählen soll.');
      return { ...result, nextLabel: itemLabel(result.position) };
    }),
  };
}
