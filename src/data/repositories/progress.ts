import { Store } from '../database.ts';
import type { BenchmarkSession, PowerTest, PowerAttempt, CircuitBenchmarkSession, BenchmarkStation, RoundResult, StrengthExercise, StrengthSet } from '../types.ts';
import type { WorkoutType } from '../../domain/shared/types.ts';

export interface StrengthSource extends StrengthExercise {
  session_status: 'COMPLETE' | 'INCOMPLETE'; workout_type: WorkoutType;
  started_at: string; completed_at: string | null; session_created_at: string;
  bodyweight_snapshot_kg: number | null; library_name: string | null; library_active: number | null;
}
function indexBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const index = new Map<string, T[]>();
  for (const row of rows) { const id = key(row); const group = index.get(id) ?? []; group.push(row); index.set(id, group); }
  return index;
}
/** Bounded batch SELECTs per opened area, never a query per point/session. */
export class ProgressRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  strength(exerciseId?: string) {
    return this.store.read(async db => {
      const filter = exerciseId === undefined ? '' : ' AND e.exercise_id=?';
      const params = exerciseId === undefined ? [] : [exerciseId];
      const exercises = await db.getAllAsync<StrengthSource>(`SELECT e.*,s.status AS session_status,s.workout_type,s.started_at,s.completed_at,
        s.created_at AS session_created_at,s.bodyweight_snapshot_kg,l.name AS library_name,l.is_active AS library_active
        FROM workout_strength_exercises e JOIN workout_sessions s ON s.id=e.workout_session_id
        LEFT JOIN exercises l ON l.id=e.exercise_id
        WHERE s.status IN ('COMPLETE','INCOMPLETE')${filter}`, ...params);
      if (!exercises.length) return [];
      const sets = await db.getAllAsync<StrengthSet>(`SELECT t.* FROM strength_sets t
        JOIN workout_strength_exercises e ON e.id=t.workout_strength_exercise_id
        JOIN workout_sessions s ON s.id=e.workout_session_id
        WHERE s.status IN ('COMPLETE','INCOMPLETE')${filter} ORDER BY t.set_number`, ...params);
      const grouped = indexBy(sets, set => set.workout_strength_exercise_id);
      return exercises.map(exercise => ({ exercise, sets: grouped.get(exercise.id) ?? [] }));
    });
  }
  power() {
    return this.store.read(async db => {
      const sessions = await db.getAllAsync<BenchmarkSession>("SELECT * FROM power_benchmark_sessions WHERE status='COMPLETE'");
      if (!sessions.length) return [];
      const tests = await db.getAllAsync<PowerTest>(`SELECT t.* FROM power_benchmark_tests t JOIN power_benchmark_sessions s
        ON s.id=t.power_benchmark_session_id WHERE s.status='COMPLETE'`);
      const attempts = await db.getAllAsync<PowerAttempt>(`SELECT a.* FROM power_benchmark_attempts a JOIN power_benchmark_tests t
        ON t.id=a.power_benchmark_test_id JOIN power_benchmark_sessions s ON s.id=t.power_benchmark_session_id
        WHERE s.status='COMPLETE' ORDER BY a.attempt_number`);
      const bySession = indexBy(tests, test => test.power_benchmark_session_id);
      const byTest = indexBy(attempts, attempt => attempt.power_benchmark_test_id);
      return sessions.map(session => { const rows = bySession.get(session.id) ?? [];
        return { session, tests: rows, attempts: rows.flatMap(test => byTest.get(test.id) ?? []) };
      });
    });
  }
  circuit() {
    return this.store.read(async db => {
      const sessions = await db.getAllAsync<CircuitBenchmarkSession>("SELECT * FROM circuit_benchmark_sessions WHERE status='COMPLETE'");
      if (!sessions.length) return [];
      const stations = await db.getAllAsync<BenchmarkStation>(`SELECT t.* FROM circuit_benchmark_stations t JOIN circuit_benchmark_sessions s
        ON s.id=t.circuit_benchmark_session_id WHERE s.status='COMPLETE' ORDER BY t.position`);
      const results = await db.getAllAsync<RoundResult>(`SELECT t.* FROM circuit_benchmark_round_results t JOIN circuit_benchmark_sessions s
        ON s.id=t.circuit_benchmark_session_id WHERE s.status='COMPLETE' ORDER BY t.round_number,t.station_position`);
      const byStation = indexBy(stations, station => station.circuit_benchmark_session_id);
      const byResult = indexBy(results, result => result.circuit_benchmark_session_id);
      return sessions.map(session => ({ session, stations: byStation.get(session.id) ?? [], results: byResult.get(session.id) ?? [] }));
    });
  }
}
