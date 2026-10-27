import { Store } from '../database.ts';
import type { WorkoutType } from '../../domain/shared/types.ts';

export type HistoricalKind = 'WORKOUT' | 'POWER_BENCHMARK' | 'CIRCUIT_BENCHMARK';
export type HistoricalStatus = 'COMPLETE' | 'INCOMPLETE';
export interface HistorySessionRow {
  kind: HistoricalKind; id: string; status: HistoricalStatus; workout_type: WorkoutType | null;
  started_at: string; completed_at: string | null; created_at: string;
}
/** One compact metadata query, regardless of timeline length. Child data is detail-only. */
export class HistoryRepository {
  private readonly store: Store;
  constructor(store: Store) { this.store = store; }
  list(): Promise<HistorySessionRow[]> {
    return this.store.read(db => db.getAllAsync(`
      SELECT 'WORKOUT' AS kind,id,status,workout_type,started_at,completed_at,created_at
      FROM workout_sessions WHERE status IN ('COMPLETE','INCOMPLETE')
      UNION ALL
      SELECT 'POWER_BENCHMARK',id,status,NULL,started_at,completed_at,created_at
      FROM power_benchmark_sessions WHERE status IN ('COMPLETE','INCOMPLETE')
      UNION ALL
      SELECT 'CIRCUIT_BENCHMARK',id,status,NULL,started_at,completed_at,created_at
      FROM circuit_benchmark_sessions WHERE status IN ('COMPLETE','INCOMPLETE')`));
  }
}
