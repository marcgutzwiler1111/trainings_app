import { readActiveTraining, ActiveTrainingError } from '../activeTraining.ts';
import { nextCircuitPosition } from '../../domain/circuit/progression.ts';
import { validateCircuitSnapshot, type CircuitSnapshot, type CircuitCursor } from '../circuitSnapshot.ts';
import { Store, required, insert, uuid, type Database } from '../database.ts';
import { readExercise } from './exercise.ts';
import type { WorkoutSession, PowerSection, StrengthExercise, StrengthSet, CircuitSection, CircuitStation, CycleState, Effect, CircuitRole, Profile, WorkoutStartConfiguration } from '../types.ts';
import type { WorkoutType } from '../../domain/shared/types.ts';
import { completeWorkout, getCycleItem, type ManualOverrideResult } from '../../domain/cycle/cycle.ts';
import { calculateCircuitDuration } from '../../domain/circuit/duration.ts';
import { integer, nonNegative, positive } from '../../domain/shared/validation.ts';
import { calculateExerciseVolume, calculateE1RM, type ExercisePerformance } from '../../domain/strength/calculations.ts';

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
  latestFinished(): Promise<WorkoutSession | null> {
    return this.store.read(db => db.getFirstAsync("SELECT * FROM workout_sessions WHERE status IN ('COMPLETE','INCOMPLETE') ORDER BY completed_at DESC,rowid DESC LIMIT 1"));
  }
  active(): Promise<WorkoutSession | null> {
    return this.store.read(db => db.getFirstAsync("SELECT * FROM workout_sessions WHERE status='IN_PROGRESS'"));
  }
  /** Reuse selection APIs inside one serialized transaction, never several independent commits. */
  startConfigured(config: WorkoutStartConfiguration): Promise<string> {
    calculateCircuitDuration(config.stations.length, config.rounds);
    return this.store.transaction(async scope => {
      const repository = new WorkoutRepository(scope);
      if (await repository.active()) throw new ActiveWorkoutError();
      if (await readActiveTraining(scope.db)) throw new ActiveTrainingError();
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
      const current = status === 'IN_PROGRESS' ? await readActiveTraining(db) : null;
      if (current && current.id !== id) throw new ActiveTrainingError();
      await db.runAsync('UPDATE workout_sessions SET status=?, completed_at=?, updated_at=? WHERE id=?', status, status === 'INCOMPLETE' ? this.store.now() : null, this.store.now(), id);
    });
  }
  /** Coherent persisted summary, including the cycle used for completion preview. */
  completionSnapshot(id: string) {
    return this.store.transaction(async scope => {
      const repository = new WorkoutRepository(scope);
      const training = await repository.trainingSnapshot(id);
      if (!training) throw new WorkoutCompletionError('Workout nicht gefunden.');
      return { ...training, circuit: await repository.circuit(id),
        cycle: await required<CycleState>(scope.db, 'SELECT * FROM cycle_state') };
    });
  }
  /** Commit guarded workout completion and domain-derived cycle transition as one unit. */
  finish(id: string, manualOverride?: ManualOverrideResult) {
    return this.store.transaction(async scope => {
      const snapshot = await new WorkoutRepository(scope).completionSnapshot(id);
      const { session, cycle } = snapshot;
      if (session.status !== 'IN_PROGRESS') throw new WorkoutCompletionError('Dieses Workout ist nicht mehr aktiv und kann nicht abgeschlossen werden.');
      if (manualOverride !== undefined && manualOverride !== 'CONTINUE_CYCLE_NORMALLY' && manualOverride !== 'COUNT_AS_CURRENT_CYCLE_WORKOUT') {
        throw new WorkoutCompletionError('Bitte eine gültige Cycle-Entscheidung wählen.');
      }
      const missing = workoutCompletionIssues(snapshot);
      if (missing.length) throw new WorkoutCompletionError(missing.join('\n'));
      const expected = getCycleItem(session.expected_cycle_position);
      const expectedType = expected.type === 'WORKOUT' ? expected.workoutType : null;
      if (cycle.current_position !== session.expected_cycle_position || expectedType !== session.expected_workout_type ||
        session.was_manual_override !== Number(session.workout_type !== expectedType)) {
        throw new WorkoutCompletionError('Der Cycle passt nicht mehr zum Workout-Start. Bitte zu Home zurückkehren. Das Workout bleibt gespeichert.');
      }
      const result = completeWorkout({ position: cycle.current_position, workoutType: session.workout_type, status: 'COMPLETE', manualOverride });
      if (result.outcome === 'OVERRIDE_REQUIRED') return result;
      const now = this.store.now();
      await scope.db.runAsync("UPDATE workout_sessions SET status='COMPLETE', completed_at=?, updated_at=?, cycle_override_decision=? WHERE id=?",
        now, now, session.was_manual_override ? manualOverride! : null, id);
      await scope.db.runAsync('UPDATE cycle_state SET current_position=?, updated_at=?', result.position, now);
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
  async restart(id: string, section: 'POWER' | 'STRENGTH' | 'CIRCUIT', preserveStrengthSelections = false): Promise<void> {
    await this.store.write(async db => {
      await editableWorkout(db, id);
      // Constants only; no user-controlled SQL identifiers.
      switch (section) {
        case 'POWER':
          await db.runAsync("UPDATE workout_power_sections SET status='PLANNED', completed_set_count=0, started_at=NULL, completed_at=NULL WHERE workout_session_id=?", id); break;
        case 'STRENGTH':
          if (preserveStrengthSelections) {
            await db.runAsync('DELETE FROM strength_sets WHERE workout_strength_exercise_id IN (SELECT id FROM workout_strength_exercises WHERE workout_session_id=?)', id);
            await db.runAsync('UPDATE workout_strength_exercises SET is_complete=0 WHERE workout_session_id=?', id);
          } else await db.runAsync('DELETE FROM workout_strength_exercises WHERE workout_session_id=?', id);
          break;
        case 'CIRCUIT':
          await db.runAsync('DELETE FROM workout_circuit_sections WHERE workout_session_id=?', id); break;
        default: throw new RangeError('Unknown section.');
      }
    });
  }

  /** One serialized read of the persisted training state. No derived metrics in SQL. */
  trainingSnapshot(id: string) {
    return this.store.read(async db => {
      const session = await db.getFirstAsync<WorkoutSession>('SELECT * FROM workout_sessions WHERE id=?', id);
      if (!session) return null;
      const power = await db.getFirstAsync<PowerSection>('SELECT * FROM workout_power_sections WHERE workout_session_id=?', id);
      const exercises = await db.getAllAsync<StrengthExercise>('SELECT * FROM workout_strength_exercises WHERE workout_session_id=? ORDER BY slot', id);
      const strength = [];
      for (const exercise of exercises) strength.push({ exercise, sets: await db.getAllAsync<StrengthSet>('SELECT * FROM strength_sets WHERE workout_strength_exercise_id=? ORDER BY set_number', exercise.id) });
      return { session, power, strength };
    });
  }
  strengthHistory(exerciseId: string, excludeWorkoutId: string) {
    return this.store.read(async db => {
      const exercises = await db.getAllAsync<StrengthExercise>(`SELECT e.* FROM workout_strength_exercises e JOIN workout_sessions w ON w.id=e.workout_session_id
        WHERE e.exercise_id=? AND w.id<>? AND w.status IN ('COMPLETE','INCOMPLETE')
        ORDER BY coalesce(w.completed_at,w.started_at) DESC,w.created_at DESC,w.rowid DESC,e.slot`, exerciseId, excludeWorkoutId);
      const result = [];
      for (const exercise of exercises) result.push({ exercise, sets: await db.getAllAsync<StrengthSet>('SELECT * FROM strength_sets WHERE workout_strength_exercise_id=? ORDER BY set_number', exercise.id) });
      return result;
    });
  }
  /** Guard and mutation share a transaction; UI state is never authoritative. */
  private trainingWrite<T>(id: string, task: (scope: Store, repository: WorkoutRepository, power: PowerSection) => Promise<T>): Promise<T> {
    return this.store.transaction(async scope => {
      const session = await scope.db.getFirstAsync<WorkoutSession>('SELECT * FROM workout_sessions WHERE id=?', id);
      if (!session) throw new TrainingStateError('Workout nicht gefunden.');
      if (session.status !== 'PLANNED' && session.status !== 'IN_PROGRESS') throw new TrainingStateError('Dieses Workout ist nicht mehr aktiv. Gespeicherte Daten bleiben erhalten.');
      const power = await scope.db.getFirstAsync<PowerSection>('SELECT * FROM workout_power_sections WHERE workout_session_id=?', id);
      if (!power) throw new TrainingStateError('Der Power-Bereich fehlt. Bitte zum Workout Overview zurückkehren.');
      return task(scope, new WorkoutRepository(scope), power);
    });
  }
  beginPower(id: string): Promise<void> {
    return this.trainingWrite(id, async (_scope, repository, power) => {
      if (power.status === 'PLANNED') await repository.savePowerProgress(id, power.completed_set_count, 'IN_PROGRESS');
    });
  }
  advancePower(id: string, expectedCount: number): Promise<void> {
    integer(expectedCount, 'expectedCount');
    return this.trainingWrite(id, async (_scope, repository, power) => {
      if (power.status === 'COMPLETE' || power.completed_set_count >= 4) throw new TrainingStateError('Alle vier Power-Sets sind bereits gespeichert.');
      if (power.completed_set_count !== expectedCount) throw new TrainingStateError('Der Set-Fortschritt hat sich geändert. Bitte neu laden.');
      await repository.savePowerProgress(id, expectedCount + 1, 'IN_PROGRESS');
    });
  }
  completePower(id: string): Promise<void> {
    return this.trainingWrite(id, async (_scope, repository, power) => {
      if (power.completed_set_count !== 4) throw new TrainingStateError('Bitte zuerst alle vier Power-Sets abschließen.');
      await repository.savePowerProgress(id, 4, 'COMPLETE');
    });
  }
  saveTrainingSet(id: string, strengthId: string, setNumber: number, weight: number, reps: number, rir: number): Promise<void> {
    return this.trainingWrite(id, async (scope, repository, power) => {
      requirePowerComplete(power);
      await requireStrength(scope.db, id, strengthId);
      // Validate computable metrics before committing, without introducing arbitrary input caps.
      const previous = await repository.sets(strengthId);
      calculateExerciseVolume([...previous.filter(s => s.set_number !== setNumber).map(s => ({ weight: s.weight_kg, reps: s.reps })), { weight, reps }]);
      calculateE1RM(weight, reps, rir);
      await repository.saveSet(strengthId, setNumber, weight, reps, rir);
    });
  }
  completeTrainingExercise(id: string, strengthId: string): Promise<void> {
    return this.trainingWrite(id, async (scope, repository, power) => {
      requirePowerComplete(power);
      await requireStrength(scope.db, id, strengthId);
      const sets = await repository.sets(strengthId);
      if (sets.length !== 4) throw new TrainingStateError('Bitte zuerst alle vier Arbeitssätze dieser Übung speichern.');
      await repository.setStrengthComplete(strengthId, true);
    });
  }
  changeTrainingStrength(id: string, slot: 'A' | 'B', exerciseId: string, effect: Effect): Promise<void> {
    return this.trainingWrite(id, async (scope, repository, power) => {
      requirePowerComplete(power);
      const current = await scope.db.getFirstAsync<StrengthExercise>('SELECT * FROM workout_strength_exercises WHERE workout_session_id=? AND slot=?', id, slot);
      if (!current) throw new TrainingStateError('Die Strength-Übung fehlt.');
      if ((await repository.sets(current.id)).length) throw new TrainingStateError('Für diese Übung sind bereits Sätze gespeichert. Bitte zuerst Strength neu starten.');
      if (!(await readExercise(scope.db, exerciseId)).is_active) throw new InactiveExerciseError();
      await repository.selectStrength(id, slot, exerciseId, effect);
    });
  }
  restartTraining(id: string, section: 'POWER' | 'STRENGTH'): Promise<void> {
    return this.trainingWrite(id, async (_scope, repository) => {
      await repository.restart(id, section, true);
    });
  }

  circuitRuntimeSnapshot(id: string, requireReady = true): Promise<CircuitSnapshot> {
    return this.store.read(db => circuitContext(db, id, requireReady));
  }
  startCircuitRuntime(id: string, sectionId: string): Promise<CircuitSnapshot> {
    return this.store.transaction(async scope => {
      const snapshot = await circuitContext(scope.db, id);
      validateRuntime(snapshot);
      if (snapshot.section.id !== sectionId) throw new CircuitStateError('Die Circuit-Konfiguration hat sich geändert. Bitte neu laden.');
      if (snapshot.section.status === 'COMPLETE') throw new CircuitStateError('Circuit ist bereits abgeschlossen.');
      if (snapshot.section.status === 'PLANNED') {
        await new WorkoutRepository(scope).saveCircuitProgress(id, 1, 1, 'IN_PROGRESS');
      }
      return circuitContext(scope.db, id); // An overlapping second start never resets progress.
    });
  }
  advanceCircuitRuntime(id: string, expected: CircuitCursor): Promise<CircuitSnapshot> {
    return this.store.transaction(async scope => {
      const snapshot = await circuitContext(scope.db, id);
      validateRuntime(snapshot);
      const { section, stations } = snapshot;
      if (section.status !== 'IN_PROGRESS') throw new CircuitStateError('Circuit läuft nicht oder ist bereits abgeschlossen.');
      if (section.id !== expected.sectionId || section.current_round !== expected.round || section.current_station_position !== expected.station) {
        throw new CircuitStateError('Der Stationsfortschritt hat sich geändert. Bitte neu laden.');
      }
      const next = nextCircuitPosition(section.round_count, stations.length, expected);
      await new WorkoutRepository(scope).saveCircuitProgress(id, next?.round ?? expected.round, next?.station ?? expected.station, next ? 'IN_PROGRESS' : 'COMPLETE');
      return circuitContext(scope.db, id);
    });
  }
  restartCircuitRuntime(id: string, expectedSectionId?: string): Promise<CircuitSnapshot> {
    return this.store.transaction(async scope => {
      const snapshot = await circuitContext(scope.db, id, false);
      if (expectedSectionId !== undefined && snapshot.section.id !== expectedSectionId) throw new CircuitStateError('Circuit wurde inzwischen geändert. Bitte neu laden.');
      // Preserve captured names/images/roles, but rotate identity so old timer events cannot affect a new run.
      await new WorkoutRepository(scope).restart(id, 'CIRCUIT');
      const sectionId = await uuid(scope.db);
      await insert(scope.db, 'workout_circuit_sections', { id: sectionId, workout_session_id: id, round_count: snapshot.section.round_count, station_duration_seconds: snapshot.section.station_duration_seconds, status: 'PLANNED' });
      for (const station of snapshot.stations) {
        await insert(scope.db, 'workout_circuit_stations', { ...station, id: await uuid(scope.db), circuit_section_id: sectionId });
      }
      return circuitContext(scope.db, id, false);
    });
  }
  saveCircuitConfiguration(id: string, sectionId: string, rounds: number, stations: readonly { exerciseId: string; role: CircuitRole; effect: Effect }[]): Promise<void> {
    return this.store.transaction(async scope => {
      const current = await circuitContext(scope.db, id, false);
      if (current.section.id !== sectionId || current.section.status !== 'PLANNED' || current.section.started_at) throw new CircuitStateError('Circuit ist gesperrt oder wurde geändert. Bitte zuerst neu starten.');
      for (const station of stations) if (!(await readExercise(scope.db, station.exerciseId)).is_active) throw new InactiveExerciseError();
      await new WorkoutRepository(scope).saveCircuit(id, rounds, stations);
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

export class TrainingStateError extends Error {}
function requirePowerComplete(power: PowerSection): void {
  if (power.status !== 'COMPLETE') throw new TrainingStateError('Bitte zuerst Power abschließen.');
}
async function requireStrength(db: Database, workoutId: string, strengthId: string): Promise<void> {
  if (!await db.getFirstAsync('SELECT id FROM workout_strength_exercises WHERE id=? AND workout_session_id=?', strengthId, workoutId)) {
    throw new TrainingStateError('Die Strength-Übung gehört nicht zu diesem Workout oder wurde neu gestartet. Bitte neu laden.');
  }
}

export class CircuitStateError extends Error {}
async function circuitContext(db: Database, id: string, requireReady = true): Promise<CircuitSnapshot> {
  const session = await db.getFirstAsync<WorkoutSession>('SELECT * FROM workout_sessions WHERE id=?', id);
  if (!session) throw new CircuitStateError('Workout nicht gefunden.');
  if (session.status !== 'IN_PROGRESS') throw new CircuitStateError('Dieses Workout ist nicht aktiv. Gespeicherte Daten bleiben erhalten.');
  const power = await db.getFirstAsync<PowerSection>('SELECT * FROM workout_power_sections WHERE workout_session_id=?', id);
  const strength = await db.getAllAsync<StrengthExercise>('SELECT * FROM workout_strength_exercises WHERE workout_session_id=?', id);
  if (requireReady && (power?.status !== 'COMPLETE' || strength.length !== 2 || strength.some(s => s.is_complete !== 1))) throw new CircuitStateError('Bitte zuerst Power und beide Strength-Übungen abschließen.');
  const section = await db.getFirstAsync<CircuitSection>('SELECT * FROM workout_circuit_sections WHERE workout_session_id=?', id);
  if (!section) throw new CircuitStateError('Der Circuit-Snapshot fehlt.');
  return { section, stations: await db.getAllAsync<CircuitStation>('SELECT * FROM workout_circuit_stations WHERE circuit_section_id=? ORDER BY position', section.id) };
}
function validateRuntime(snapshot: CircuitSnapshot): void {
  try { validateCircuitSnapshot(snapshot); }
  catch { throw new CircuitStateError('Die gespeicherte Circuit-Konfiguration oder Position ist ungültig. Bitte den Bereich neu starten und bearbeiten.'); }
}

export class WorkoutCompletionError extends Error {}

/** One prerequisite definition used by preview and by the transactional finish guard. */
export function workoutCompletionIssues(snapshot: {
  power: PowerSection | null;
  strength: readonly { exercise: StrengthExercise; sets: readonly StrengthSet[] }[];
  circuit: CircuitSnapshot | null;
}): string[] {
  const issues: string[] = [];
  if (snapshot.power?.status !== 'COMPLETE' || snapshot.power.completed_set_count !== 4) issues.push('Power ist noch nicht vollständig abgeschlossen.');
  for (const slot of ['A', 'B'] as const) {
    const row = snapshot.strength.find(row => row.exercise.slot === slot);
    if (!row || row.exercise.is_complete !== 1 || row.sets.length !== 4) issues.push(`Strength ${slot} ist noch nicht vollständig abgeschlossen.`);
  }
  if (!snapshot.circuit || snapshot.circuit.section.status !== 'COMPLETE') issues.push('Circuit ist noch nicht vollständig abgeschlossen.');
  else {
    try { validateCircuitSnapshot(snapshot.circuit); }
    catch { issues.push('Die gespeicherte Circuit-Completion ist ungültig. Bitte den Bereich prüfen.'); }
  }
  return issues;
}
