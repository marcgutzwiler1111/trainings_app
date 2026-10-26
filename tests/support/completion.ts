import type { connect } from './sqlite.ts';
import { seedExercises } from '../../src/data/seed.ts';

/** Build valid completed sections for lifecycle tests using persisted repository APIs. */
export async function completeSections(c: ReturnType<typeof connect>, id: string) {
  const seed = (name: string) => seedExercises.find(e => e.name === name)!.id;
  if (!(await c.workouts.power(id))) await c.workouts.selectPower(id, seed('Box Jump'));
  await c.workouts.savePowerProgress(id, 4, 'COMPLETE');
  for (const slot of ['A', 'B'] as const) {
    let row = (await c.workouts.strength(id)).find(e => e.slot === slot);
    if (!row) {
      await c.workouts.selectStrength(id, slot, seed(slot === 'A' ? 'Bench Press' : 'Pull-Up'));
      row = (await c.workouts.strength(id)).find(e => e.slot === slot)!;
    }
    if ((await c.workouts.sets(row.id)).length !== 4) {
      for (let n = 1; n <= 4; n++) await c.workouts.saveSet(row.id, n, 100, 8, 2);
    }
    await c.workouts.setStrengthComplete(row.id, true);
  }
  let circuit = await c.workouts.circuit(id);
  if (!circuit) {
    await c.workouts.saveCircuit(id, 1, [{ exerciseId: seed('Goblet Squat'), role: 'FOCUS' }]);
    circuit = (await c.workouts.circuit(id))!;
  }
  await c.workouts.saveCircuitProgress(id, circuit.section.round_count, circuit.stations.length, 'COMPLETE');
  await c.workouts.setStatus(id, 'IN_PROGRESS');
}
