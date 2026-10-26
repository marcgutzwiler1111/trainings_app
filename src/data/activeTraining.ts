import type { Database } from './database.ts';
export type ActiveTraining = { kind: 'WORKOUT' | 'POWER' | 'CIRCUIT'; id: string };
export async function readActiveTraining(db: Database): Promise<ActiveTraining | null> {
  return db.getFirstAsync(`SELECT 'WORKOUT' AS kind,id FROM workout_sessions WHERE status='IN_PROGRESS'
    UNION ALL SELECT 'POWER',id FROM power_benchmark_sessions WHERE status='IN_PROGRESS'
    UNION ALL SELECT 'CIRCUIT',id FROM circuit_benchmark_sessions WHERE status='IN_PROGRESS' LIMIT 1`);
}
export class ActiveTrainingError extends Error {
  constructor() { super('Eine Trainingseinheit ist bereits aktiv. Bitte über Home fortsetzen oder bewusst beenden.'); }
}
