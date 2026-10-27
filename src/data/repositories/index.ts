import { Store, type Database } from '../database.ts';
import { ProfileRepository, BodyweightRepository } from './profile.ts';
import { ExerciseRepository } from './exercise.ts';
import { CycleRepository } from './cycle.ts';
import { WorkoutRepository } from './workout.ts';
import { HistoryRepository } from './history.ts';
import { BenchmarkRepository } from './benchmark.ts';

/** Call after initializeDatabase; use one SQLite connection for the app. */
export function createRepositories(db: Database, now?: () => string) {
  const store = new Store(db, now);
  return {
    profile: new ProfileRepository(store),
    bodyweight: new BodyweightRepository(store),
    exercises: new ExerciseRepository(store),
    cycle: new CycleRepository(store),
    workouts: new WorkoutRepository(store),
    benchmarks: new BenchmarkRepository(store),
    history: new HistoryRepository(store),
  };
}
