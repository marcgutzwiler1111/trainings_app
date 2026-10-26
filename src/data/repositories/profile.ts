import { Store, required, insert, uuid } from '../database.ts';
import type { Profile, BodyweightEntry } from '../types.ts';
import { validateBodyweight, validateRestDuration, type RestKind } from '../profileValidation.ts';

export class ProfileRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  get(): Promise<Profile> { return this.store.read(db => required(db, 'SELECT * FROM profile')); }
  async updateRestTimers(powerSeconds: number, strengthSeconds: number): Promise<void> {
    validateRestDuration(powerSeconds); validateRestDuration(strengthSeconds);
    await this.store.write(async db => {
      await db.runAsync('UPDATE profile SET power_rest_seconds=?, strength_rest_seconds=?, updated_at=?', powerSeconds, strengthSeconds, this.store.now());
    });
  }
  /** Update only the selected field; never write a stale copy of the other timer. */
  async updateRestTimer(kind: RestKind, seconds: number): Promise<void> {
    validateRestDuration(seconds);
    if (kind !== 'POWER' && kind !== 'STRENGTH') throw new RangeError('Invalid rest timer kind.');
    const column = kind === 'POWER' ? 'power_rest_seconds' : 'strength_rest_seconds';
    await this.store.write(async db => {
      const current = await required<Profile>(db, 'SELECT * FROM profile');
      if (current[column] === seconds) return;
      // The SQL identifier is selected from the two internal constants above.
      await db.runAsync(`UPDATE profile SET ${column}=?, updated_at=?`, seconds, this.store.now());
    });
  }
}

export class BodyweightRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  list(newestFirst = false): Promise<BodyweightEntry[]> {
    return this.store.read(db => db.getAllAsync(`SELECT * FROM bodyweight_entries ORDER BY measured_at ${newestFirst ? 'DESC' : 'ASC'}, rowid ${newestFirst ? 'DESC' : 'ASC'}`));
  }
  async update(weight: number, measuredAt = this.store.now()): Promise<string | null> {
    validateBodyweight(weight);
    if (!Number.isFinite(Date.parse(measuredAt))) throw new RangeError('Invalid measured_at.');
    return this.store.write(async db => {
      const profile = await required<Profile>(db, 'SELECT * FROM profile');
      if (profile.current_bodyweight_kg === weight) return null;
      const id = await uuid(db); const now = this.store.now();
      await db.runAsync('UPDATE profile SET current_bodyweight_kg=?, updated_at=?', weight, now);
      await insert(db, 'bodyweight_entries', { id, bodyweight_kg: weight, measured_at: new Date(measuredAt).toISOString(), source: 'PROFILE_UPDATE', created_at: now });
      return id;
    });
  }
}
