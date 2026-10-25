import { Store, required, insert, uuid, type Database } from '../database.ts';
import type { Exercise, ExerciseInput, Area, Effect } from '../types.ts';

type ExerciseRow = Omit<Exercise, 'areas' | 'effects' | 'is_active'> & { is_active: number };
export async function readExercise(db: Database, id: string): Promise<Exercise> {
  const row = await required<ExerciseRow>(db, 'SELECT * FROM exercises WHERE id=?', id);
  const areas = await db.getAllAsync<{ area: Area }>('SELECT area FROM exercise_areas WHERE exercise_id=? ORDER BY area', id);
  const effects = await db.getAllAsync<{ effect: Effect }>('SELECT effect FROM exercise_effects WHERE exercise_id=? ORDER BY effect', id);
  return { ...row, is_active: row.is_active === 1, areas: areas.map(x => x.area), effects: effects.map(x => x.effect) };
}
async function taxonomy(db: Database, id: string, input: ExerciseInput): Promise<void> {
  if (!input.areas.length || !input.effects.length) throw new RangeError('An exercise needs at least one area and effect.');
  await db.runAsync('DELETE FROM exercise_areas WHERE exercise_id=?', id);
  await db.runAsync('DELETE FROM exercise_effects WHERE exercise_id=?', id);
  for (const area of new Set(input.areas)) await db.runAsync('INSERT INTO exercise_areas VALUES (?,?)', id, area);
  for (const effect of new Set(input.effects)) await db.runAsync('INSERT INTO exercise_effects VALUES (?,?)', id, effect);
}
export class ExerciseRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  get(id: string): Promise<Exercise> { return this.store.read(db => readExercise(db, id)); }
  list(includeInactive = false): Promise<Exercise[]> {
    return this.store.read(async db => {
      const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM exercises ${includeInactive ? '' : 'WHERE is_active=1'} ORDER BY name,id`);
      const result: Exercise[] = [];
      for (const row of rows) result.push(await readExercise(db, row.id));
      return result;
    });
  }
  create(input: ExerciseInput): Promise<string> {
    return this.store.write(async db => {
      const id = await uuid(db); const now = this.store.now();
      await insert(db, 'exercises', { id, name: input.name, thumbnail_uri: input.thumbnail_uri ?? null, load_mode: input.load_mode, is_active: 1, created_at: now, updated_at: now });
      await taxonomy(db, id, input); return id;
    });
  }
  async update(id: string, input: ExerciseInput): Promise<void> {
    await this.store.write(async db => {
      await readExercise(db, id);
      await db.runAsync('UPDATE exercises SET name=?, thumbnail_uri=?, load_mode=?, updated_at=? WHERE id=?', input.name, input.thumbnail_uri ?? null, input.load_mode, this.store.now(), id);
      await taxonomy(db, id, input);
    });
  }
  async setActive(id: string, active: boolean): Promise<void> {
    await this.store.write(async db => { await readExercise(db, id); await db.runAsync('UPDATE exercises SET is_active=?, updated_at=? WHERE id=?', Number(active), this.store.now(), id); });
  }
  // Deliberately no hard-delete API: historical references must survive.
}
