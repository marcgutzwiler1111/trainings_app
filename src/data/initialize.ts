import { migrateDatabase } from './migrations.ts';
import { seedDatabase } from './seed.ts';
import type { Database } from './database.ts';

/** Await before allowing repository access; never reset/recreate the database. */
export async function initializeDatabase(db: Database): Promise<void> {
  await migrateDatabase(db);
  await seedDatabase(db);
}
