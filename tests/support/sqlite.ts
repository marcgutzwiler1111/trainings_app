import { DatabaseSync } from 'node:sqlite';
import type { Database, BindValue } from '../../src/data/database.ts';
import { Store } from '../../src/data/database.ts';
import { ProfileRepository, BodyweightRepository } from '../../src/data/repositories/profile.ts';
import { ExerciseRepository } from '../../src/data/repositories/exercise.ts';
import { CycleRepository } from '../../src/data/repositories/cycle.ts';
import { WorkoutRepository } from '../../src/data/repositories/workout.ts';
import { BenchmarkRepository } from '../../src/data/repositories/benchmark.ts';

export function connect(filename = ':memory:') {
  const sqlite = new DatabaseSync(filename);
  const db: Database = {
    async execAsync(sql) { sqlite.exec(sql); },
    async getFirstAsync<T>(sql: string, ...params: BindValue[]) {
      return (sqlite.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: BindValue[]) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async runAsync(sql, ...params) {
      const result = sqlite.prepare(sql).run(...params);
      return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
    },
    async withTransactionAsync(task) {
      sqlite.exec('BEGIN');
      try { await task(); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  let time = Date.parse('2026-10-25T12:00:00.000Z');
  const store = new Store(db, () => new Date(time++).toISOString());
  return {
    sqlite, db, store,
    profile: new ProfileRepository(store), bodyweight: new BodyweightRepository(store),
    exercises: new ExerciseRepository(store), cycle: new CycleRepository(store),
    workouts: new WorkoutRepository(store), benchmarks: new BenchmarkRepository(store),
  };
}
