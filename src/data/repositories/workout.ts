import { Store, required, insert, uuid, type Database } from '../database.ts';
import { readExercise } from './exercise.ts';
import type { WorkoutSession, PowerSection, StrengthExercise, StrengthSet, CircuitSection, CircuitStation, CycleState, Effect, CircuitRole, Profile, WorkoutStartConfiguration } from '../types.ts';
import type { WorkoutType } from '../../domain/shared/types.ts';
import { completeWorkout, getCycleItem, type ManualOverrideResult } from '../../domain/cycle/cycle.ts';
import { calculateCircuitDuration } from '../../domain/circuit/duration.ts';
import { integer, nonNegative, positive } from '../../domain/shared/validation.ts';
import type { ExercisePerformance } from '../../domain/strength/calculations.ts';

export async function editableWorkout(db: Database, id: string): Promise<WorkoutSession> {
  const session = await required<WorkoutSession>(db, 'SELECT * FROM workout_sessions WHERE id=?', id);
  if (session.status === 'COMPLETE' || session.status === 'INCOMPLETE') throw new Error('Historical workout is immutable.');
  return session;
}
export class WorkoutRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  get(id: string): Promise<WorkoutSession> { return this.store.read(db => required(db, 'SELECT * FROM workout_sessions WHERE id=?', id)); }
  list(): Promise<WorkoutSession[]> { return this.store.read(db => db.getAllAsync('SELECT * FROM workout_sessions ORDER BY created_at,rowid')); }
  active(): Promise<WorkoutSession | null> {
    return this.store.read(db => db.getFirstAsync("SELECT * FROM workout_sessions WHERE status='IN_PROGRESS'"));
  }
  /** Reuse selection APIs inside one serialized transaction, never several independent commits. */
  startConfigured(config: WorkoutStartConfiguration): Promise<string> {
    calculateCircuitDuration(config.stations.length, config.rounds);
    return this.store.transaction(async scope => {
      const repository = new WorkoutRepository(scope);
      if (await repository.active()) throw new ActiveWorkoutError();
      for (const id of [config.powerExerciseId, config.strengthA.exerciseId, config.strengthB.exerciseId, ...config.stations.map(s => s.exerciseId)]) {
        if (!(await readExercise(scope.db, id)).is_active) throw new InactiveExerciseError();
      }
      const profile = await required<Profile>(scope.db, 'SELECT * FROM profile');
      const id = await repository.create(config.workoutType, profile.current_bodyweight_kg);
      await repository.selectPower(id, config.powerExerciseId);
      await repository.selectStrength(id, 'A', config.strengthA.exerciseId, config.strengthA.effect);
      await repository.selectStrength(id, 'B', config.strengthB.exerciseId, config.strengthB.effect);
      await repository.saveCircuit(id, config.rounds, config.stations);
      await repository.setStatus(id, 'IN_PROGRESS');
      return id;
    });
  }
  create(workoutType: WorkoutType, bodyweight: number | null = null): Promise<string> {
    if (bodyweight !== null) positive(bodyweight, 'bodyweight');
    return this.store.write(async db => {
      const cycle = await required<CycleState>(db, 'SELECT * FROM cycle_state');
      const expected = getCycleItem(cycle.current_position);
      const expectedType = expected.type === 'WORKOUT' ? expected.workoutType : null;
      const id = await uuid(db); const now = this.store.now();
      await insert(db, 'workout_sessions', { id, workout_type: workoutType, expected_cycle_position: cycle.current_position, expected_workout_type: expectedType,
        was_manual_override: Number(expectedType !== workoutType), status: 'PLANNED', started_at: now, completed_at: null, bodyweight_snapshot_kg: bodyweight, created_at: now, updated_at: now });
      return id;
    });
  }
  async setStatus(id: string, status: 'IN_PROGRESS' | 'INCOMPLETE'): Promise<void> {
    await this.store.write(async db => {
      await editableWorkout(db, id);
      await db.runAsync('UPDATE workout_sessions SET status=?, completed_at=?, updated_at=? WHERE id=?', status, status === 'INCOMPLETE' ? this.store.now() : null, this.store.now(), id);
    });
  }
  /** Commit workout completion and domain-derived cycle transition as one unit. */
  finish(id: string, manualOverride?: ManualOverrideResult) {
    return this.store.write(async db => {
      const session = await editableWorkout(db, id);
      const cycle = await required<CycleState>(db, 'SELECT * FROM cycle_state');
      if (cycle.current_position !== session.expected_cycle_position) throw new Error('Cycle changed since workout creation.');
      const result = completeWorkout({ position: cycle.current_position, workoutType: session.workout_type, status: 'COMPLETE', manualOverride });
      if (result.outcome === 'OVERRIDE_REQUIRED') return result;
      const now = this.store.now();
      await db.runAsync("UPDATE workout_sessions SET status='COMPLETE', completed_at=?, updated_at=? WHERE id=?", now, now, id);
      await db.runAsync('UPDATE cycle_state SET current_position=?, updated_at=?', result.position, now);
      return result;
    });
  }
  power(id: string): Promise<PowerSection | null> { return this.store.read(db => db.getFirstAsync('SELECT * FROM workout_power_sections WHERE workout_session_id=?', id)); }
  async selectPower(id: string, exerciseId: string): Promise<void> {
    await this.store.write(async db => {
      await editableWorkout(db, id);
      const old = await db.getFirstAsync<PowerSection>('SELECT * FROM workout_power_sections WHERE workout_session_id=?', id);
      if (old && (old.started_at || old.completed_set_count)) throw new Error('Restart Power before changing its exercise.');
      const exercise = await readExercise(db, exerciseId);
      if (old) await db.runAsync('DELETE FROM workout_power_sections WHERE id=?', old.id);
      await insert(db, 'workout_power_sections', { id: await uuid(db), workout_session_id: id, exercise_id: exerciseId,
        exercise_name_snapshot: exercise.name, thumbnail_uri_snapshot: exercise.thumbnail_uri, status: 'PLANNED', completed_set_count: 0 });
    });
  }
  async savePowerProgress(id: string, count: number, status: 'IN_PROGRESS' | 'COMPLETE'): Promise<void> {
    integer(count, 'completed_set_count');
    await this.store.write(async db => {
      await editableWorkout(db, id);
      await required(db, 'SELECT id FROM workout_power_sections WHERE workout_session_id=?', id);
      const now = this.store.now();
      await db.runAsync('UPDATE workout_power_sections SET completed_set_count=?, status=?, started_at=coalesce(started_at,?), completed_at=? WHERE workout_session_id=?', count, status, now, status === 'COMPLETE' ? now : null, id);
    });
  }
  strength(id: string): Promise<StrengthExercise[]> { return this.store.read(db => db.getAllAsync('SELECT * FROM workout_strength_exercises WHERE workout_session_id=? ORDER BY slot', id)); }
  sets(strengthId: string): Promise<StrengthSet[]> { return this.store.read(db => db.getAllAsync('SELECT * FROM strength_sets WHERE workout_strength_exercise_id=? ORDER BY set_number', strengthId)); }
  selectStrength(id: string, slot: 'A' | 'B', exerciseId: string, effect: Effect | null = null): Promise<string> {
    return this.store.write(async db => {
      await editableWorkout(db, id);
      const old = await db.getFirstAsync<StrengthExercise>('SELECT * FROM workout_strength_exercises WHERE workout_session_id=? AND slot=?', id, slot);
      if (old && await db.getFirstAsync('SELECT id FROM strength_sets WHERE workout_strength_exercise_id=?', old.id)) throw new Error('Restart Strength before changing a saved exercise.');
      const exercise = await readExercise(db, exerciseId);
      if (old) await db.runAsync('DELETE FROM workout_strength_exercises WHERE id=?', old.id);
      const strengthId = await uuid(db);
      await insert(db, 'workout_strength_exercises', { id: strengthId, workout_session_id: id, slot, exercise_id: exerciseId,
        exercise_name_snapshot: exercise.name, thumbnail_uri_snapshot: exercise.thumbnail_uri, effect_snapshot: effect, is_complete: 0, created_at: this.store.now() });
      return strengthId;
    });
  }
  async saveSet(strengthId: string, setNumber: number, weight: number, reps: number, rir: number): Promise<void> {
    integer(setNumber, 'set_number', 1); if (setNumber > 4) throw new RangeError('MVP uses four working sets.');
    nonNegative(weight, 'weight'); integer(reps, 'reps'); nonNegative(rir, 'rir');
    await this.store.write(async db => {
      const exercise = await required<StrengthExercise>(db, 'SELECT * FROM workout_strength_exercises WHERE id=?', strengthId);
      await editableWorkout(db, exercise.workout_session_id);
      const now = this.store.now();
      await db.runAsync(`INSERT INTO strength_sets (id,workout_strength_exercise_id,set_number,weight_kg,reps,rir,saved_at,updated_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(workout_strength_exercise_id,set_number) DO UPDATE SET weight_kg=excluded.weight_kg,reps=excluded.reps,rir=excluded.rir,updated_at=excluded.updated_at`,
      await uuid(db), strengthId, setNumber, weight, reps, rir, now, now);
    });
  }
  async setStrengthComplete(strengthId: string, complete: boolean): Promise<void> {
    await this.store.write(async db => {
      const exercise = await required<StrengthExercise>(db, 'SELECT * FROM workout_strength_exercises WHERE id=?', strengthId);
      await editableWorkout(db, exercise.workout_session_id);
      const sets = await db.getAllAsync<StrengthSet>('SELECT * FROM strength_sets WHERE workout_strength_exercise_id=?', strengthId);
      if (complete && sets.length !== 4) throw new Error('Complete all four working sets first.');
      await db.runAsync('UPDATE workout_strength_exercises SET is_complete=? WHERE id=?', Number(complete), strengthId);
    });
  }
  performances(exerciseId: string): Promise<ExercisePerformance[]> {
    return this.store.read(async db => {
      const exercises = await db.getAllAsync<StrengthExercise>('SELECT * FROM workout_strength_exercises WHERE exercise_id=?', exerciseId);
      const results: ExercisePerformance[] = [];
      for (const exercise of exercises) {
        const sets = await db.getAllAsync<StrengthSet>('SELECT * FROM strength_sets WHERE workout_strength_exercise_id=? ORDER BY set_number', exercise.id);
        results.push({ exerciseId: exercise.exercise_id, isComplete: exercise.is_complete === 1, sets: sets.map(s => ({ weight: s.weight_kg, reps: s.reps })) });
      }
      return results;
    });
  }
  circuit(id: string) {
    return this.store.read(async db => {
      const section = await db.getFirstAsync<CircuitSection>('SELECT * FROM workout_circuit_sections WHERE workout_session_id=?', id);
      return section ? { section, stations: await db.getAllAsync<CircuitStation>('SELECT * FROM workout_circuit_stations WHERE circuit_section_id=? ORDER BY position', section.id) } : null;
    });
  }
  async saveCircuit(id: string, rounds: number, stations: readonly { exerciseId: string; role: CircuitRole; effect?: Effect | null }[]): Promise<void> {
    calculateCircuitDuration(stations.length, rounds);
    await this.store.write(async db => {
      await editableWorkout(db, id);
      const old = await db.getFirstAsync<CircuitSection>('SELECT * FROM workout_circuit_sections WHERE workout_session_id=?', id);
      if (old?.started_at) throw new Error('Restart Circuit before editing the snapshot.');
      if (old) await db.runAsync('DELETE FROM workout_circuit_sections WHERE id=?', old.id);
      const sectionId = await uuid(db);
      await insert(db, 'workout_circuit_sections', { id: sectionId, workout_session_id: id, round_count: rounds, station_duration_seconds: 60, status: 'PLANNED' });
      for (const [index, station] of stations.entries()) {
        const exercise = await readExercise(db, station.exerciseId);
        await insert(db, 'workout_circuit_stations', { id: await uuid(db), circuit_section_id: sectionId, position: index + 1, role: station.role, exercise_id: exercise.id,
          exercise_name_snapshot: exercise.name, thumbnail_uri_snapshot: exercise.thumbnail_uri, effect_snapshot: station.effect ?? null });
      }
    });
  }
  async saveCircuitProgress(id: string, round: number, station: number, status: 'IN_PROGRESS' | 'COMPLETE'): Promise<void> {
    integer(round, 'round', 1); integer(station, 'station', 1);
    await this.store.write(async db => {
      await editableWorkout(db, id);
      const section = await required<CircuitSection>(db, 'SELECT * FROM workout_circuit_sections WHERE workout_session_id=?', id);
      const exists = await db.getFirstAsync('SELECT id FROM workout_circuit_stations WHERE circuit_section_id=? AND position=?', section.id, station);
      if (!exists || round > section.round_count) throw new RangeError('Invalid circuit position.');
      const now = this.store.now();
      await db.runAsync('UPDATE workout_circuit_sections SET current_round=?, current_station_position=?, status=?, started_at=coalesce(started_at,?), completed_at=? WHERE id=?', round, station, status, now, status === 'COMPLETE' ? now : null, section.id);
    });
  }
  async restart(id: string, section: 'POWER' | 'STRENGTH' | 'CIRCUIT'): Promise<void> {
    await this.store.write(async db => {
      await editableWorkout(db, id);
      // Constants only; no user-controlled SQL identifiers.
      switch (section) {
        case 'POWER':
          await db.runAsync("UPDATE workout_power_sections SET status='PLANNED', completed_set_count=0, started_at=NULL, completed_at=NULL WHERE workout_session_id=?", id); break;
        case 'STRENGTH':
          await db.runAsync('DELETE FROM workout_strength_exercises WHERE workout_session_id=?', id); break;
        case 'CIRCUIT':
          await db.runAsync('DELETE FROM workout_circuit_sections WHERE workout_session_id=?', id); break;
        default: throw new RangeError('Unknown section.');
      }
    });
  }
  lastConfiguration(workoutType: WorkoutType) {
    return this.store.read(async db => {
      const candidates = await db.getAllAsync<WorkoutSession>('SELECT * FROM workout_sessions WHERE workout_type=? ORDER BY created_at DESC,rowid DESC', workoutType);
      for (const session of candidates) {
        const power = await db.getFirstAsync<{ exercise_id: string }>('SELECT exercise_id FROM workout_power_sections WHERE workout_session_id=?', session.id);
        const strength = await db.getAllAsync<{ slot: 'A' | 'B'; exercise_id: string }>('SELECT slot,exercise_id FROM workout_strength_exercises WHERE workout_session_id=? ORDER BY slot', session.id);
        const circuit = await db.getFirstAsync<{ id: string; round_count: number }>('SELECT id,round_count FROM workout_circuit_sections WHERE workout_session_id=?', session.id);
        if (!power || strength.length !== 2 || !circuit) continue;
        const stations = await db.getAllAsync<Pick<CircuitStation, 'position' | 'role' | 'exercise_id' | 'effect_snapshot'>>('SELECT position,role,exercise_id,effect_snapshot FROM workout_circuit_stations WHERE circuit_section_id=? ORDER BY position', circuit.id);
        if (!stations.length) continue;
        return { powerExerciseId: power.exercise_id, strength, circuit: { roundCount: circuit.round_count, stations } };
      }
      return null;
    });
  }
}

export class ActiveWorkoutError extends Error {
  constructor() { super('An active workout already exists.'); }
}
export class InactiveExerciseError extends Error {
  constructor() { super('An exercise is no longer active.'); }
}
