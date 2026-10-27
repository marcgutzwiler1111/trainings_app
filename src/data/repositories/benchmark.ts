import { readActiveTraining, ActiveTrainingError } from '../activeTraining.ts';
import { powerConditions, powerProgress, powerProtocol, circuitBenchmarkCursor, circuitBenchmarkFormat, type PowerSetup } from '../../domain/benchmarks/protocol.ts';
import { Store, required, insert, uuid, type Database } from '../database.ts';
import { readExercise } from './exercise.ts';
import { seedExercises } from '../seed.ts';
import type { BenchmarkSession, PowerTest, PowerAttempt, CircuitBenchmarkSession, BenchmarkStation, RoundResult } from '../types.ts';
import type { PowerTestConditions } from '../../domain/benchmarks/power.ts';
import { arePowerBenchmarksComparable } from '../../domain/benchmarks/power.ts';
import { calculateCircuitEffectiveWeight, calculateCircuitTotalVolume, calculateRelativePerformance, type CircuitRoundResult, type CircuitBenchmarkExerciseKey, type CircuitBenchmarkLoad } from '../../domain/benchmarks/circuit.ts';
import { integer, positive, nonNegative } from '../../domain/shared/validation.ts';

const circuitExercises: readonly [CircuitBenchmarkExerciseKey, string][] = [
  ['GOBLET_SQUAT', 'Goblet Squat'], ['PUSH_UPS', 'Push-Up'], ['KETTLEBELL_SWING', 'Kettlebell Swing'],
  ['PULL_UPS_CHIN_UPS', 'Pull-Up'], ['HANGING_LEG_RAISES', 'Hanging Leg Raise'], ['BURPEES', 'Burpees'],
];
async function active(db: Database, kind: 'power' | 'circuit', id: string): Promise<void> {
  const row = await db.getFirstAsync<BenchmarkSession>(`SELECT * FROM ${kind}_benchmark_sessions WHERE id=?`, id);
  if (!row) throw new BenchmarkStateError('Benchmark nicht gefunden.');
  if (row.status !== 'IN_PROGRESS') throw new BenchmarkStateError('Dieser Benchmark ist nicht mehr aktiv.');
}
export class BenchmarkRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  createPower(): Promise<string> {
    return this.store.write(async db => {
      if (await readActiveTraining(db)) throw new ActiveTrainingError();
      const id = await uuid(db); const now = this.store.now();
      await insert(db, 'power_benchmark_sessions', { id, status: 'IN_PROGRESS', started_at: now, created_at: now, updated_at: now });
      return id;
    });
  }
  addPowerTest(sessionId: string, conditions: PowerTestConditions, unit = 'cm'): Promise<string> {
    arePowerBenchmarksComparable(conditions, conditions); // Reuse domain condition validation.
    if (!unit.trim()) throw new RangeError('Unit is required.');
    return this.store.write(async db => {
      await active(db, 'power', sessionId);
      const count = await db.getFirstAsync<{ n: number }>('SELECT count(*) AS n FROM power_benchmark_tests WHERE power_benchmark_session_id=?', sessionId);
      if (count!.n >= 6) throw new BenchmarkStateError('Die Benchmark-Bedingungen sind gesperrt.');
      const id = await uuid(db);
      await insert(db, 'power_benchmark_tests', { id, power_benchmark_session_id: sessionId, test_type: conditions.testType, side: conditions.side,
        medicine_ball_weight_kg: conditions.testType === 'STANDING_BROAD_JUMP' ? null : conditions.medicineBallWeight, unit, best_value: null });
      return id;
    });
  }
  async savePowerAttempt(testId: string, attempt: number, value: number): Promise<void> {
    integer(attempt, 'attempt', 1); if (attempt > 3) throw new RangeError('Only three attempts per side.'); positive(value, 'value');
    await this.store.write(async db => {
      const test = await required<PowerTest>(db, 'SELECT * FROM power_benchmark_tests WHERE id=?', testId);
      await active(db, 'power', test.power_benchmark_session_id);
      await db.runAsync(`INSERT INTO power_benchmark_attempts (id,power_benchmark_test_id,attempt_number,value,created_at) VALUES (?,?,?,?,?)
        ON CONFLICT(power_benchmark_test_id,attempt_number) DO UPDATE SET value=excluded.value`, await uuid(db), testId, attempt, value, this.store.now());
      // best_value is optional cached data. Attempts remain the authoritative records.
    });
  }
  power(id: string) {
    return this.store.read(async db => {
      const session = await db.getFirstAsync<BenchmarkSession>('SELECT * FROM power_benchmark_sessions WHERE id=?', id);
      if (!session) throw new BenchmarkStateError('Benchmark nicht gefunden.');
      const tests = await db.getAllAsync<PowerTest>('SELECT * FROM power_benchmark_tests WHERE power_benchmark_session_id=? ORDER BY test_type,side', id);
      const attempts = await db.getAllAsync<PowerAttempt>('SELECT a.* FROM power_benchmark_attempts a JOIN power_benchmark_tests t ON t.id=a.power_benchmark_test_id WHERE t.power_benchmark_session_id=? ORDER BY t.test_type,t.side,a.attempt_number', id);
      return { session, tests, attempts };
    });
  }
  createCircuit(loads: Pick<CircuitBenchmarkSession, 'bodyweight_kg_snapshot' | 'goblet_squat_load_kg' | 'kettlebell_swing_load_kg' | 'pullup_added_load_kg'>): Promise<string> {
    positive(loads.bodyweight_kg_snapshot, 'bodyweight');
    nonNegative(loads.goblet_squat_load_kg, 'goblet load'); nonNegative(loads.kettlebell_swing_load_kg, 'swing load'); nonNegative(loads.pullup_added_load_kg, 'pullup load');
    return this.store.write(async db => {
      if (await readActiveTraining(db)) throw new ActiveTrainingError();
      const id = await uuid(db); const now = this.store.now();
      await insert(db, 'circuit_benchmark_sessions', { id, ...loads, status: 'IN_PROGRESS', started_at: now, created_at: now, updated_at: now });
      for (const [index, [key, name]] of circuitExercises.entries()) {
        const seed = seedExercises.find(e => e.name === name);
        if (!seed) throw new Error('Missing benchmark exercise definition.');
        const exercise = await readExercise(db, seed.id);
        let load: CircuitBenchmarkLoad;
        switch (key) {
          case 'GOBLET_SQUAT': load = { exercise: key, externalLoad: loads.goblet_squat_load_kg }; break;
          case 'KETTLEBELL_SWING': load = { exercise: key, externalLoad: loads.kettlebell_swing_load_kg }; break;
          case 'PULL_UPS_CHIN_UPS': load = { exercise: key, addedLoad: loads.pullup_added_load_kg }; break;
          default: load = { exercise: key };
        }
        await insert(db, 'circuit_benchmark_stations', { id: await uuid(db), circuit_benchmark_session_id: id, position: index + 1,
          exercise_key: key, exercise_name_snapshot: exercise.name, thumbnail_uri_snapshot: exercise.thumbnail_uri,
          effective_weight_kg: calculateCircuitEffectiveWeight(load, loads.bodyweight_kg_snapshot) });
      }
      return id;
    });
  }
  async saveCircuitResult(id: string, round: number, station: number, reps: number): Promise<void> {
    integer(round, 'round', 1); integer(station, 'station', 1); integer(reps, 'reps');
    if (round > circuitBenchmarkFormat.rounds || station > circuitBenchmarkFormat.stations) throw new RangeError('Circuit Benchmark has five rounds and six stations.');
    await this.store.write(async db => {
      await active(db, 'circuit', id);
      const session = await this.requireCircuit(db, id);
      const selected = await required<BenchmarkStation>(db, 'SELECT * FROM circuit_benchmark_stations WHERE circuit_benchmark_session_id=? AND position=?', id, station);
      const other = await db.getAllAsync<CircuitRoundResult>(`SELECT s.exercise_key AS exercise,r.reps,s.effective_weight_kg AS effectiveWeight
        FROM circuit_benchmark_round_results r JOIN circuit_benchmark_stations s ON s.circuit_benchmark_session_id=r.circuit_benchmark_session_id AND s.position=r.station_position
        WHERE r.circuit_benchmark_session_id=? AND NOT (r.round_number=? AND r.station_position=?)`, id, round, station);
      integer(other.filter(row => row.exercise === selected.exercise_key).reduce((sum,row)=>sum+row.reps,0)+reps, 'exercise total reps');
      calculateRelativePerformance(calculateCircuitTotalVolume([...other, { exercise: selected.exercise_key, reps, effectiveWeight: selected.effective_weight_kg }]), session.bodyweight_kg_snapshot);
      await db.runAsync(`INSERT INTO circuit_benchmark_round_results (id,circuit_benchmark_session_id,round_number,station_position,reps,saved_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(circuit_benchmark_session_id,round_number,station_position) DO UPDATE SET reps=excluded.reps,saved_at=excluded.saved_at`, await uuid(db), id, round, station, reps, this.store.now());
    });
  }
  circuit(id: string) {
    return this.store.read(async db => ({
      session: await this.requireCircuit(db, id),
      stations: await db.getAllAsync<BenchmarkStation>('SELECT * FROM circuit_benchmark_stations WHERE circuit_benchmark_session_id=? ORDER BY position', id),
      results: await db.getAllAsync<RoundResult>('SELECT * FROM circuit_benchmark_round_results WHERE circuit_benchmark_session_id=? ORDER BY round_number,station_position', id),
    }));
  }
  async finish(kind: 'power' | 'circuit', id: string, status: 'COMPLETE' | 'INCOMPLETE'): Promise<void> {
    if (kind !== 'power' && kind !== 'circuit') throw new RangeError('Unknown benchmark kind.');
    await this.store.transaction(async scope => {
      const db = scope.db;
      await active(db, kind, id);
      if (status !== 'COMPLETE' && status !== 'INCOMPLETE') throw new BenchmarkStateError('Ungültiger Benchmark-Status.');
      const repository = new BenchmarkRepository(scope);
      if (status === 'COMPLETE') {
        if (kind === 'power') {
          const data = await repository.power(id);
          if (!powerProgress(powerGroups(data)).ready) throw new BenchmarkStateError('Alle 18 Power-Versuche müssen gespeichert sein.');
        } else {
          const data = await repository.circuit(id);
          if (data.stations.length !== circuitBenchmarkFormat.stations || circuitBenchmarkCursor(data.results.map(row => ({ round: row.round_number, station: row.station_position }))) !== null) throw new BenchmarkStateError('Alle 30 Rundenergebnisse müssen gespeichert sein.');
        }
      }
      const now = this.store.now();
      await db.runAsync(`UPDATE ${kind}_benchmark_sessions SET status=?, completed_at=?, updated_at=? WHERE id=?`, status, now, now, id);
    });
  }
  activeTraining() { return this.store.read(readActiveTraining); }
  history(kind: 'power' | 'circuit'): Promise<BenchmarkSession[]> {
    if (kind !== 'power' && kind !== 'circuit') throw new BenchmarkStateError('Unbekannter Benchmark-Typ.');
    return this.store.read(db => db.getAllAsync(`SELECT * FROM ${kind}_benchmark_sessions ORDER BY created_at DESC,rowid DESC`));
  }
  private async requireCircuit(db: Database, id: string): Promise<CircuitBenchmarkSession> {
    const row = await db.getFirstAsync<CircuitBenchmarkSession>('SELECT * FROM circuit_benchmark_sessions WHERE id=?', id);
    if (!row) throw new BenchmarkStateError('Benchmark nicht gefunden.');
    return row;
  }
  startPower(setup: PowerSetup): Promise<string> {
    const conditions = powerConditions(setup);
    return this.store.transaction(async scope => {
      const current = await readActiveTraining(scope.db);
      if (current?.kind === 'POWER') return current.id;
      if (current) throw new ActiveTrainingError();
      const repository = new BenchmarkRepository(scope);
      const id = await repository.createPower();
      for (const condition of conditions) await repository.addPowerTest(id, condition, 'cm');
      return id;
    });
  }
  startCircuit(loads: Parameters<BenchmarkRepository['createCircuit']>[0]): Promise<string> {
    return this.store.transaction(async scope => {
      const current = await readActiveTraining(scope.db);
      if (current?.kind === 'CIRCUIT') return current.id;
      if (current) throw new ActiveTrainingError();
      return new BenchmarkRepository(scope).createCircuit(loads);
    });
  }
  /** Enforce fixed test order while still allowing corrections to prior active tests. */
  saveAttempt(id: string, testId: string, attempt: number, value: number) {
    return this.store.transaction(async scope => {
      await active(scope.db, 'power', id);
      const repository = new BenchmarkRepository(scope); const data = await repository.power(id);
      const group = data.tests.find(test => test.id === testId);
      if (!group) throw new BenchmarkStateError('Der Versuch gehört nicht zu dieser Session. Bitte neu laden.');
      if (powerProtocol.findIndex(test => test.testType === group.test_type) > powerProgress(powerGroups(data)).currentTest) throw new BenchmarkStateError('Bitte zuerst den aktuellen Power-Test vollständig erfassen.');
      await repository.savePowerAttempt(testId, attempt, value);
    });
  }
  /** The displayed cursor is consumed once. A saved cell advances the derived cursor atomically. */
  advanceCircuit(id: string, expected: { round: number; station: number }, reps: number) {
    return this.store.transaction(async scope => {
      await active(scope.db, 'circuit', id); const repository = new BenchmarkRepository(scope);
      const data = await repository.circuit(id);
      const cursor = circuitBenchmarkCursor(data.results.map(row => ({ round: row.round_number, station: row.station_position })));
      if (!cursor || cursor.round !== expected.round || cursor.station !== expected.station) throw new BenchmarkStateError('Die Benchmark-Position hat sich geändert. Bitte neu laden.');
      await repository.saveCircuitResult(id, cursor.round, cursor.station, reps);
      return repository.circuit(id);
    });
  }
  correctCircuitResult(id: string, round: number, station: number, reps: number) {
    return this.store.transaction(async scope => {
      await active(scope.db, 'circuit', id);
      if (!await scope.db.getFirstAsync('SELECT id FROM circuit_benchmark_round_results WHERE circuit_benchmark_session_id=? AND round_number=? AND station_position=?', id, round, station)) throw new BenchmarkStateError('Nur gespeicherte Ergebnisse können korrigiert werden.');
      await new BenchmarkRepository(scope).saveCircuitResult(id, round, station, reps);
    });
  }
  scheduledSessions() {
    return this.store.read(async db => {
      const rows = await db.getAllAsync<{ benchmarkType: 'POWER' | 'CIRCUIT'; status: BenchmarkSession['status']; completed_at: string | null }>(`SELECT 'POWER' AS benchmarkType,status,completed_at FROM power_benchmark_sessions
        UNION ALL SELECT 'CIRCUIT',status,completed_at FROM circuit_benchmark_sessions`);
      return rows.map(row => ({ benchmarkType: row.benchmarkType, status: row.status, completedAtMs: row.completed_at === null ? null : Date.parse(row.completed_at) }));
    });
  }
}

export class BenchmarkStateError extends Error {}
export function powerGroups(data: Awaited<ReturnType<BenchmarkRepository['power']>>) {
  return data.tests.map(test => ({ testType: test.test_type, side: test.side, unit: test.unit, ballWeight: test.medicine_ball_weight_kg,
    attempts: data.attempts.filter(attempt => attempt.power_benchmark_test_id === test.id).map(attempt => ({ number: attempt.attempt_number, value: attempt.value })) }));
}
