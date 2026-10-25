import { Store, insert, type Database } from './database.ts';
import type { ExerciseInput } from './types.ts';

export const seedExercises: readonly (ExerciseInput & { id: string })[] = [
  {"id": "10000000-0000-4000-8000-000000000001", "name": "Box Jump", "areas": ["POWER"], "effects": ["LOWER_ANTERIOR"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000002", "name": "Broad Jump", "areas": ["POWER"], "effects": ["LOWER_POSTERIOR"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000003", "name": "Plyometric Push-Up", "areas": ["POWER"], "effects": ["UPPER_PUSH"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000004", "name": "Medicine Ball Rotational Throw", "areas": ["POWER"], "effects": ["CORE"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000005", "name": "Medicine Ball Chest Pass", "areas": ["POWER"], "effects": ["UPPER_PUSH"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000006", "name": "Medicine Ball Shot-Put Throw", "areas": ["POWER"], "effects": ["UPPER_PUSH"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000007", "name": "Bench Press", "areas": ["STRENGTH"], "effects": ["UPPER_PUSH"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000008", "name": "Incline Bench Press", "areas": ["STRENGTH"], "effects": ["UPPER_PUSH"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000009", "name": "Dips", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["UPPER_PUSH"], "load_mode": "BODYWEIGHT_PLUS_EXTERNAL"},
  {"id": "10000000-0000-4000-8000-000000000010", "name": "Overhead Press", "areas": ["STRENGTH"], "effects": ["UPPER_PUSH"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000011", "name": "Pull-Up", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["UPPER_PULL"], "load_mode": "BODYWEIGHT_PLUS_EXTERNAL"},
  {"id": "10000000-0000-4000-8000-000000000012", "name": "Chin-Up", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["UPPER_PULL"], "load_mode": "BODYWEIGHT_PLUS_EXTERNAL"},
  {"id": "10000000-0000-4000-8000-000000000013", "name": "Barbell Row", "areas": ["STRENGTH"], "effects": ["UPPER_PULL"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000014", "name": "Dumbbell Row", "areas": ["STRENGTH"], "effects": ["UPPER_PULL"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000015", "name": "Back Squat", "areas": ["STRENGTH"], "effects": ["LOWER_ANTERIOR"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000016", "name": "Front Squat", "areas": ["STRENGTH"], "effects": ["LOWER_ANTERIOR"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000017", "name": "Goblet Squat", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["LOWER_ANTERIOR"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000018", "name": "Walking Lunge", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["LOWER_ANTERIOR"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000019", "name": "Romanian Deadlift", "areas": ["STRENGTH"], "effects": ["LOWER_POSTERIOR"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000020", "name": "Deadlift", "areas": ["STRENGTH"], "effects": ["LOWER_POSTERIOR"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000021", "name": "Hip Thrust", "areas": ["STRENGTH"], "effects": ["LOWER_POSTERIOR"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000022", "name": "Kettlebell Swing", "areas": ["POWER", "CIRCUIT"], "effects": ["LOWER_POSTERIOR", "CONDITIONING"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000023", "name": "Pallof Press", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["CORE"], "load_mode": "EXTERNAL_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000024", "name": "Hanging Leg Raise", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["CORE"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000025", "name": "Ab Wheel", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["CORE"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000026", "name": "Burpees", "areas": ["CIRCUIT"], "effects": ["CONDITIONING"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000027", "name": "Jump Rope", "areas": ["CIRCUIT"], "effects": ["CONDITIONING"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000028", "name": "High Knees", "areas": ["CIRCUIT"], "effects": ["CONDITIONING"], "load_mode": "BODYWEIGHT_ONLY"},
  {"id": "10000000-0000-4000-8000-000000000029", "name": "Push-Up", "areas": ["STRENGTH", "CIRCUIT"], "effects": ["UPPER_PUSH"], "load_mode": "BODYWEIGHT_ONLY"},
];

/** Insert missing fixed IDs only. Never overwrite user-edited names/taxonomy/active state. */
export async function seedDatabase(db: Database, now: () => string = () => new Date().toISOString()): Promise<void> {
  await new Store(db, now).write(async connection => {
    const timestamp = now();
    await connection.runAsync(`INSERT INTO profile (id,created_at,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING`, '00000000-0000-4000-8000-000000000001', timestamp, timestamp);
    await connection.runAsync(`INSERT INTO cycle_state (id,updated_at) VALUES (?,?) ON CONFLICT(id) DO NOTHING`, '00000000-0000-4000-8000-000000000002', timestamp);
    for (const exercise of seedExercises) {
      if (await connection.getFirstAsync('SELECT id FROM exercises WHERE id=?', exercise.id)) continue;
      await insert(connection, 'exercises', { id: exercise.id, name: exercise.name, thumbnail_uri: null, load_mode: exercise.load_mode, is_active: 1, created_at: timestamp, updated_at: timestamp });
      for (const area of exercise.areas) await connection.runAsync('INSERT INTO exercise_areas VALUES (?,?)', exercise.id, area);
      for (const effect of exercise.effects) await connection.runAsync('INSERT INTO exercise_effects VALUES (?,?)', exercise.id, effect);
    }
  });
}
