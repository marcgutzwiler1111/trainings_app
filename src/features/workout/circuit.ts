import type { createRepositories } from '../../data/repositories/index.ts';
import { CircuitStateError, InactiveExerciseError } from '../../data/repositories/workout.ts';
import { validateCircuitSnapshot, type CircuitSnapshot, type CircuitCursor } from '../../data/circuitSnapshot.ts';
import { circuitPlan, nextCircuitPosition } from '../../domain/circuit/progression.ts';
import { FeatureError } from '../application/errors.ts';
import { circuitEffect, validateCircuitDraft, type CircuitDraft } from './builder.ts';

export function circuitView(snapshot: CircuitSnapshot) {
  try { validateCircuitSnapshot(snapshot); }
  catch { throw new FeatureError('Die gespeicherte Circuit-Konfiguration oder Position ist ungültig. Bitte den Bereich neu starten und bearbeiten.'); }
  const { section, stations } = snapshot;
  const complete = section.status === 'COMPLETE';
  const position = section.current_round !== null && section.current_station_position !== null ? { round: section.current_round, station: section.current_station_position } : null;
  const next = position && !complete ? nextCircuitPosition(section.round_count, stations.length, position) : null;
  return { ...snapshot, complete, cursor: position ? { ...position, sectionId: section.id } : null,
    current: position ? stations[position.station - 1] : null,
    next: next ? { position: next, station: stations[next.station - 1] } : null,
    stationSeconds: section.station_duration_seconds,
    ...circuitPlan(section.round_count, stations.length, section.station_duration_seconds),
    initiallyPaused: section.status === 'IN_PROGRESS',
  };
}
export type CircuitView = ReturnType<typeof circuitView>;
export function createCircuitServices(repositories: ReturnType<typeof createRepositories>) {
  const guarded = async <T,>(action: () => Promise<T>): Promise<T> => {
    try { return await action(); }
    catch (error) {
      if (error instanceof CircuitStateError) throw new FeatureError(error.message);
      if (error instanceof InactiveExerciseError) throw new FeatureError('Eine gewählte Übung ist nicht mehr aktiv. Bitte erneut auswählen.');
      throw error;
    }
  };
  return {
    load: (id: string) => guarded(async () => circuitView(await repositories.workouts.circuitRuntimeSnapshot(id))),
    start: (id: string, sectionId: string) => guarded(async () => circuitView(await repositories.workouts.startCircuitRuntime(id, sectionId))),
    advance: (id: string, cursor: CircuitCursor) => guarded(async () => circuitView(await repositories.workouts.advanceCircuitRuntime(id, cursor))),
    restart: (id: string, sectionId?: string) => guarded(() => repositories.workouts.restartCircuitRuntime(id, sectionId)),
    editor: (id: string) => guarded(async () => {
      const snapshot = await repositories.workouts.circuitRuntimeSnapshot(id, false);
      if (snapshot.section.status !== 'PLANNED' || snapshot.section.started_at) throw new FeatureError('Bitte Circuit vor dem Bearbeiten neu starten.');
      const exercises = await repositories.exercises.list();
      const active = new Set(exercises.map(e => e.id));
      return { sectionId: snapshot.section.id, workoutType: (await repositories.workouts.get(id)).workout_type, exercises,
        warnings: snapshot.stations.some(s => !active.has(s.exercise_id)) ? ['Nicht mehr aktive Übungen bitte erneut auswählen.'] : [],
        draft: { rounds: snapshot.section.round_count, stations: snapshot.stations.map(s => ({ role: s.role, exerciseId: active.has(s.exercise_id) ? s.exercise_id : null })) } satisfies CircuitDraft };
    }),
    saveEditor: (id: string, sectionId: string, draft: CircuitDraft) => guarded(async () => {
      const errors = validateCircuitDraft(draft, await repositories.exercises.list());
      if (errors.length) throw new FeatureError(errors.join('\n'));
      const session = await repositories.workouts.get(id);
      await repositories.workouts.saveCircuitConfiguration(id, sectionId, draft.rounds, draft.stations.map(s => ({ role: s.role, exerciseId: s.exerciseId!, effect: circuitEffect(session.workout_type, s.role) })));
    }),
  };
}
