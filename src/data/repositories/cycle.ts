import { Store, required } from '../database.ts';
import type { CycleState } from '../types.ts';
import { getCycleItem, completeRest, type CyclePosition } from '../../domain/cycle/cycle.ts';

export class CycleRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  get(): Promise<CycleState> { return this.store.read(db => required(db, 'SELECT * FROM cycle_state')); }
  async save(position: CyclePosition): Promise<void> {
    getCycleItem(position);
    await this.store.write(async db => { await db.runAsync('UPDATE cycle_state SET current_position=?, updated_at=?', position, this.store.now()); });
  }
  async completeRest(expectedPosition?: CyclePosition): Promise<void> {
    await this.store.write(async db => {
      const current = await required<CycleState>(db, 'SELECT * FROM cycle_state');
      if (expectedPosition !== undefined && current.current_position !== expectedPosition) throw new Error('Cycle changed. Reload Home.');
      if (await db.getFirstAsync("SELECT id FROM workout_sessions WHERE status='IN_PROGRESS'")) throw new Error('An active workout is pending.');
      const next = completeRest(current.current_position);
      await db.runAsync('UPDATE cycle_state SET current_position=?, updated_at=?', next.position, this.store.now());
    });
  }
}
