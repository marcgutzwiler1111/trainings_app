import type { createRepositories } from '../../data/repositories/index.ts';
import { ActiveWorkoutError, InactiveExerciseError } from '../../data/repositories/workout.ts';
import { getCycleItem, type CyclePosition } from '../../domain/cycle/cycle.ts';
import { calculateCircuitDuration } from '../../domain/circuit/duration.ts';
import type { WorkoutType } from '../../domain/shared/types.ts';
import { defaultBuilder, validateBuilder, strengthEffects, circuitEffect, workoutLabels, type BuilderDraft } from '../workout/builder.ts';

export class FeatureError extends Error {}
export function userMessage(error: unknown): string {
  console.error('Application operation failed', error);
  return error instanceof FeatureError ? error.message : 'Die Daten konnten nicht geladen oder gespeichert werden. Bitte erneut versuchen.';
}
export function createApplicationServices(repositories: ReturnType<typeof createRepositories>) {
  const home = {
    async load() {
      const [cycle, active] = await Promise.all([repositories.cycle.get(), repositories.workouts.active()]);
      const item = getCycleItem(cycle.current_position);
      return { cycle, item, active, nextLabel: item.type === 'REST' ? 'Rest' : workoutLabels[item.workoutType] };
    },
    async completeRest(position: CyclePosition) { await repositories.cycle.completeRest(position); },
  };
  const workout = {
    async builder(type: WorkoutType) {
      if (await repositories.workouts.active()) throw new FeatureError('Ein Workout ist bereits aktiv. Bitte über Home fortsetzen.');
      const [exercises, previous] = await Promise.all([repositories.exercises.list(), repositories.workouts.lastConfiguration(type)]);
      let draft = defaultBuilder(type); const warnings: string[] = [];
      if (previous) {
        draft = { workoutType: type, powerExerciseId: previous.powerExerciseId,
          strengthA: previous.strength.find(s => s.slot === 'A')?.exercise_id ?? null,
          strengthB: previous.strength.find(s => s.slot === 'B')?.exercise_id ?? null,
          rounds: previous.circuit.roundCount, stations: previous.circuit.stations.map(s => ({ role: s.role, exerciseId: s.exercise_id })) };
        const active = new Set(exercises.map(e => e.id));
        const available = (id: string | null) => id && active.has(id) ? id : null;
        const selected = [draft.powerExerciseId, draft.strengthA, draft.strengthB, ...draft.stations.map(s => s.exerciseId)];
        if (selected.some(id => !id || !active.has(id))) warnings.push('Die letzte Konfiguration enthält nicht mehr aktive Übungen. Bitte die leeren Auswahlfelder erneut belegen.');
        draft = { ...draft, powerExerciseId: available(draft.powerExerciseId), strengthA: available(draft.strengthA), strengthB: available(draft.strengthB),
          stations: draft.stations.map(s => ({ ...s, exerciseId: available(s.exerciseId) })) };
      }
      if (!exercises.length) warnings.push('Keine aktiven Übungen verfügbar. Ein Workout kann derzeit nicht gestartet werden.');
      return { draft, exercises, warnings, fromPrevious: previous !== null };
    },
    async start(draft: BuilderDraft) {
      const errors = validateBuilder(draft, await repositories.exercises.list());
      if (errors.length) throw new FeatureError(errors.join('\n'));
      const [a, b] = strengthEffects(draft.workoutType);
      try {
        return await repositories.workouts.startConfigured({ workoutType: draft.workoutType, powerExerciseId: draft.powerExerciseId!,
          strengthA: { exerciseId: draft.strengthA!, effect: a }, strengthB: { exerciseId: draft.strengthB!, effect: b },
          rounds: draft.rounds, stations: draft.stations.map(s => ({ role: s.role, exerciseId: s.exerciseId!, effect: circuitEffect(draft.workoutType, s.role) })) });
      } catch (error) {
        if (error instanceof ActiveWorkoutError) throw new FeatureError('Ein Workout ist bereits aktiv. Bitte über Home fortsetzen.');
        if (error instanceof InactiveExerciseError) throw new FeatureError('Eine gewählte Übung ist nicht mehr aktiv. Bitte den Builder neu laden.');
        throw error;
      }
    },
    async overview(id: string) {
      const [session, power, strength, circuit] = await Promise.all([
        repositories.workouts.get(id), repositories.workouts.power(id), repositories.workouts.strength(id), repositories.workouts.circuit(id),
      ]);
      if (!power || strength.length !== 2 || !circuit) throw new FeatureError('Die Workout-Konfiguration ist unvollständig. Bitte zu Home zurückkehren.');
      return { session, power, strength, circuit, label: workoutLabels[session.workout_type],
        durationSeconds: calculateCircuitDuration(circuit.stations.length, circuit.section.round_count) };
    },
    async endIncomplete(id: string) { await repositories.workouts.setStatus(id, 'INCOMPLETE'); },
  };
  return { home, workout };
}
export type ApplicationServices = ReturnType<typeof createApplicationServices>;
