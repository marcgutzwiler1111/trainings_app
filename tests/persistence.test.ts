import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from './support/sqlite.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { migrateDatabase, migrations } from '../src/data/migrations.ts';
import { seedDatabase, seedExercises } from '../src/data/seed.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';
import { calculateBenchmarkDueState } from '../src/domain/benchmarks/due.ts';

async function setup(t: TestContext) {
  const connection = connect();
  t.after(() => connection.sqlite.close());
  await initializeDatabase(connection.db);
  return connection;
}
const seedId = (name: string) => {
  const row = seedExercises.find(e => e.name === name);
  assert.ok(row); return row.id;
};
async function configured(c: Awaited<ReturnType<typeof setup>>, type: 'UK_HAMS' | 'OK_BRUST' = 'UK_HAMS') {
  const id = await c.workouts.create(type, 80);
  await c.workouts.selectPower(id, seedId('Box Jump'));
  const a = await c.workouts.selectStrength(id, 'A', seedId('Bench Press'), 'UPPER_PUSH');
  const b = await c.workouts.selectStrength(id, 'B', seedId('Pull-Up'), 'UPPER_PULL');
  await c.workouts.saveCircuit(id, 5, [
    { exerciseId: seedId('Goblet Squat'), role: 'FOCUS' },
    { exerciseId: seedId('Burpees'), role: 'CONDITIONING' },
  ]);
  return { id, a, b };
}

test('fresh MVP schema has 18 tables, version 2, foreign keys and all singleton defaults', async t => {
  const c = await setup(t);
  assert.equal(c.sqlite.prepare('PRAGMA user_version').get()?.user_version, 2);
  assert.equal(c.sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
  assert.equal(c.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get()?.n, 18);
  const profile = await c.profile.get();
  assert.equal(profile.current_bodyweight_kg, null);
  assert.equal(profile.power_rest_seconds, 150);
  assert.equal(profile.strength_rest_seconds, 120);
  assert.equal((await c.cycle.get()).current_position, 1);
});

test('Phase 0 database upgrades non-destructively and initialization is repeatable', async t => {
  const c = connect(); t.after(() => c.sqlite.close());
  await migrateDatabase(c.db, migrations.slice(0, 1));
  c.sqlite.exec('CREATE TABLE preservation_fixture (value TEXT); INSERT INTO preservation_fixture VALUES (\'keep\')');
  await initializeDatabase(c.db);
  const first = await c.profile.get();
  await initializeDatabase(c.db);
  assert.deepEqual(await c.profile.get(), first);
  assert.equal(c.sqlite.prepare('SELECT value FROM preservation_fixture').get()?.value, 'keep');
  assert.equal((await c.exercises.list()).length, 29);
});

test('failed MVP migration rolls back all newly created tables and its version', async t => {
  const c = connect(); t.after(() => c.sqlite.close());
  await migrateDatabase(c.db, migrations.slice(0, 1));
  await assert.rejects(migrateDatabase(c.db, [migrations[0], { version: 2, async up(db) {
    await migrations[1].up(db); await db.execAsync('INVALID SQL');
  } }]));
  assert.equal(c.sqlite.prepare('PRAGMA user_version').get()?.user_version, 1);
  assert.equal(c.sqlite.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get()?.n, 0);
  await initializeDatabase(c.db);
});

test('profile rest timer updates persist and reject invalid numeric values', async t => {
  const c = await setup(t);
  await c.profile.updateRestTimers(180, 90);
  assert.equal((await c.profile.get()).power_rest_seconds, 180);
  assert.equal((await c.profile.get()).strength_rest_seconds, 90);
  await assert.rejects(c.profile.updateRestTimers(-1, 90), RangeError);
});

test('bodyweight updates append history without changing older entries', async t => {
  const c = await setup(t);
  await c.bodyweight.update(80); const first = (await c.bodyweight.list())[0];
  await c.bodyweight.update(81);
  const rows = await c.bodyweight.list();
  assert.equal(rows.length, 2); assert.deepEqual(rows[0], first);
  assert.equal(rows[1].source, 'PROFILE_UPDATE');
  assert.equal((await c.profile.get()).current_bodyweight_kg, 81);
});

test('bodyweight history failure rolls back the profile update', async t => {
  const c = await setup(t);
  c.sqlite.exec("CREATE TRIGGER reject_history BEFORE INSERT ON bodyweight_entries BEGIN SELECT RAISE(ABORT,'injected history failure'); END;");
  await assert.rejects(c.bodyweight.update(80), /injected history failure/);
  assert.equal((await c.profile.get()).current_bodyweight_kg, null);
  assert.deepEqual(await c.bodyweight.list(), []);
});

test('seed has stable UUIDs, covers all areas/effects and remains idempotent', async t => {
  const c = await setup(t);
  const before = await c.exercises.list(true);
  await seedDatabase(c.db); await seedDatabase(c.db);
  assert.deepEqual(await c.exercises.list(true), before);
  assert.equal(new Set(before.map(e => e.id)).size, 29);
  for (const exercise of before) assert.match(exercise.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const swing = await c.exercises.get(seedId('Kettlebell Swing'));
  assert.deepEqual(swing.areas, ['CIRCUIT', 'POWER']);
  assert.deepEqual(swing.effects, ['CONDITIONING', 'LOWER_POSTERIOR']);
  assert.equal(new Set(before.flatMap(e => e.effects)).size, 6);
});

test('seeding preserves edited and deactivated exercises, profile and cycle state', async t => {
  const c = await setup(t); const id = seedId('Bench Press'); const exercise = await c.exercises.get(id);
  await c.exercises.update(id, { ...exercise, name: 'My Bench', areas: ['STRENGTH'], effects: ['UPPER_PUSH'] });
  await c.exercises.setActive(id, false); await c.cycle.save(4); await c.profile.updateRestTimers(200, 180);
  await initializeDatabase(c.db);
  assert.equal((await c.exercises.get(id)).name, 'My Bench');
  assert.equal((await c.exercises.get(id)).is_active, false);
  assert.equal((await c.cycle.get()).current_position, 4);
  assert.equal((await c.profile.get()).power_rest_seconds, 200);
});

test('custom exercise create/update maps multiple areas/effects and inactive filtering', async t => {
  const c = await setup(t);
  const id = await c.exercises.create({ name: 'Custom', load_mode: 'EXTERNAL_ONLY', areas: ['POWER','CIRCUIT'], effects: ['CORE','CONDITIONING'], thumbnail_uri: 'local://custom' });
  let exercise = await c.exercises.get(id);
  assert.equal(exercise.thumbnail_uri, 'local://custom');
  assert.equal(exercise.areas.length, 2); assert.equal(exercise.effects.length, 2);
  await c.exercises.update(id, { ...exercise, name: 'Changed', effects: ['CORE'] });
  await c.exercises.setActive(id, false); exercise = await c.exercises.get(id);
  assert.equal(exercise.name, 'Changed'); assert.deepEqual(exercise.effects, ['CORE']);
  assert.equal((await c.exercises.list()).some(e => e.id === id), false);
  assert.equal((await c.exercises.list(true)).some(e => e.id === id), true);
});

test('invalid exercise taxonomy rolls back both row and relationships', async t => {
  const c = await setup(t); const exercise = await c.exercises.get(seedId('Bench Press'));
  await assert.rejects(c.exercises.update(exercise.id, { ...exercise, name: 'Must roll back', effects: [] }));
  assert.deepEqual(await c.exercises.get(exercise.id), exercise);
});

test('cycle persists valid positions and uses the domain for explicit Rest completion', async t => {
  const c = await setup(t); await c.cycle.save(6); await c.cycle.completeRest();
  assert.equal((await c.cycle.get()).current_position, 1);
  await assert.rejects(c.cycle.completeRest());
  await c.cycle.save(4); assert.equal((await c.cycle.get()).current_position, 4);
});

test('workout creation captures expected cycle, overrides, status and bodyweight', async t => {
  const c = await setup(t); const id = await c.workouts.create('OK_BRUST', 80);
  const row = await c.workouts.get(id);
  assert.equal(row.status, 'PLANNED'); assert.equal(row.expected_workout_type, 'UK_HAMS');
  assert.equal(row.was_manual_override, 1); assert.equal(row.bodyweight_snapshot_kg, 80);
  await c.workouts.setStatus(id, 'IN_PROGRESS'); assert.equal((await c.workouts.get(id)).status, 'IN_PROGRESS');
  await c.workouts.setStatus(id, 'INCOMPLETE'); assert.equal((await c.workouts.get(id)).status, 'INCOMPLETE');
  assert.equal((await c.cycle.get()).current_position, 1);
});

test('only one normal workout can be in progress at a time', async t => {
  const c = await setup(t); const a = await c.workouts.create('UK_HAMS'); const b = await c.workouts.create('UK_QUADS');
  await c.workouts.setStatus(a, 'IN_PROGRESS'); await assert.rejects(c.workouts.setStatus(b, 'IN_PROGRESS'));
  assert.equal((await c.workouts.get(b)).status, 'PLANNED');
});

test('workout completion and cycle transition commit atomically and cannot repeat', async t => {
  const c = await setup(t); const id = await c.workouts.create('UK_HAMS');
  assert.equal((await c.workouts.finish(id)).outcome, 'ADVANCED');
  assert.equal((await c.cycle.get()).current_position, 2);
  assert.equal((await c.workouts.get(id)).status, 'COMPLETE');
  await assert.rejects(c.workouts.finish(id)); assert.equal((await c.cycle.get()).current_position, 2);
});

test('cycle update failure rolls back workout completion', async t => {
  const c = await setup(t); const id = await c.workouts.create('UK_HAMS');
  c.sqlite.exec("CREATE TRIGGER reject_cycle BEFORE UPDATE ON cycle_state BEGIN SELECT RAISE(ABORT,'cycle failure'); END;");
  await assert.rejects(c.workouts.finish(id), /cycle failure/);
  assert.equal((await c.workouts.get(id)).status, 'PLANNED');
  assert.equal((await c.cycle.get()).current_position, 1);
});

test('override requires explicit choice before persistence and can keep the cycle pending', async t => {
  const c = await setup(t); const id = await c.workouts.create('OK_BRUST');
  assert.equal((await c.workouts.finish(id)).outcome, 'OVERRIDE_REQUIRED');
  assert.equal((await c.workouts.get(id)).status, 'PLANNED');
  await c.workouts.finish(id, 'CONTINUE_CYCLE_NORMALLY');
  assert.equal((await c.cycle.get()).current_position, 1);
});

test('Power section captures snapshot, saves minimal progress and locks the selection', async t => {
  const c = await setup(t); const { id } = await configured(c);
  await c.workouts.savePowerProgress(id, 3, 'COMPLETE');
  const power = await c.workouts.power(id); assert.equal(power?.completed_set_count, 3);
  assert.equal(power?.status, 'COMPLETE'); assert.ok(power?.started_at);
  await assert.rejects(c.workouts.selectPower(id, seedId('Broad Jump')));
});

test('Strength supports both slots, arbitrary save order, upsert and explicit exercise completion', async t => {
  const c = await setup(t); const { a, b } = await configured(c);
  await c.workouts.saveSet(b, 1, 20, 8, 2); await c.workouts.saveSet(a, 3, 100, 7, 1);
  await assert.rejects(c.workouts.setStrengthComplete(a, true), /four/);
  await c.workouts.saveSet(a, 1, 100, 8, 2); const original = (await c.workouts.sets(a))[0];
  await c.workouts.saveSet(a, 1, 105, 8, 1);
  const changed = (await c.workouts.sets(a))[0];
  assert.equal(changed.id, original.id); assert.equal(changed.saved_at, original.saved_at); assert.equal(changed.weight_kg, 105);
  await c.workouts.saveSet(a, 2, 100, 8, 2); await c.workouts.saveSet(a, 4, 100, 6, 2);
  await c.workouts.setStrengthComplete(a, true);
  assert.equal((await c.workouts.sets(a)).length, 4); assert.equal((await c.workouts.sets(b)).length, 1);
});

test('completed Strength remains PR eligible in a persisted INCOMPLETE workout', async t => {
  const c = await setup(t); const { id, a } = await configured(c);
  for (const [i, reps] of [8,8,7,6].entries()) await c.workouts.saveSet(a, i + 1, 100, reps, 2);
  await c.workouts.setStrengthComplete(a, true); await c.workouts.setStatus(id, 'INCOMPLETE');
  const performances = await c.workouts.performances(seedId('Bench Press'));
  assert.equal(performances[0].isComplete, true);
  assert.equal(calculateStrengthBenchmark(seedId('Bench Press'), performances), 2900);
});

test('normal Circuit snapshots preserve order, progress and lock once started', async t => {
  const c = await setup(t); const { id } = await configured(c);
  await c.workouts.saveCircuitProgress(id, 2, 2, 'IN_PROGRESS');
  const circuit = await c.workouts.circuit(id);
  assert.equal(circuit?.section.current_round, 2); assert.equal(circuit?.section.current_station_position, 2);
  assert.deepEqual(circuit?.stations.map(s => s.exercise_name_snapshot), ['Goblet Squat','Burpees']);
  await assert.rejects(c.workouts.saveCircuit(id, 2, [{ exerciseId: seedId('Burpees'), role: 'CONDITIONING' }]));
  await assert.rejects(c.workouts.saveCircuitProgress(id, 2, 3, 'IN_PROGRESS'));
});

test('Circuit snapshot write is atomic if a station reference is invalid', async t => {
  const c = await setup(t); const { id } = await configured(c); const before = await c.workouts.circuit(id);
  await assert.rejects(c.workouts.saveCircuit(id, 2, [{ exerciseId: 'missing', role: 'FOCUS' }]));
  assert.deepEqual(await c.workouts.circuit(id), before);
});

for (const section of ['POWER','STRENGTH','CIRCUIT'] as const) {
  test(`restarting ${section} changes only that section and cannot touch historical workouts`, async t => {
    const c = await setup(t); const { id, a } = await configured(c);
    await c.workouts.saveSet(a, 1, 100, 8, 2); await c.workouts.savePowerProgress(id, 2, 'IN_PROGRESS');
    const power = await c.workouts.power(id); const strength = await c.workouts.strength(id); const circuit = await c.workouts.circuit(id);
    await c.workouts.restart(id, section);
    if (section === 'POWER') { assert.equal((await c.workouts.power(id))?.completed_set_count, 0); }
    else assert.deepEqual(await c.workouts.power(id), power);
    if (section === 'STRENGTH') { assert.deepEqual(await c.workouts.strength(id), []); assert.deepEqual(await c.workouts.sets(a), []); }
    else assert.deepEqual(await c.workouts.strength(id), strength);
    if (section === 'CIRCUIT') assert.equal(await c.workouts.circuit(id), null);
    else assert.deepEqual(await c.workouts.circuit(id), circuit);
    await c.workouts.setStatus(id, 'INCOMPLETE'); await assert.rejects(c.workouts.restart(id, section));
  });
}

test('last configuration selects latest valid matching type and exposes no performance data', async t => {
  const c = await setup(t); await configured(c); const newest = await configured(c);
  await c.workouts.saveSet(newest.a, 1, 100, 8, 2);
  await c.workouts.saveCircuit(newest.id, 7, [{ exerciseId: seedId('Burpees'), role: 'CONDITIONING' }]);
  await configured(c, 'OK_BRUST'); await c.workouts.create('UK_HAMS'); // Incomplete config must not mask a valid one.
  const config = await c.workouts.lastConfiguration('UK_HAMS');
  assert.equal(config?.circuit.roundCount, 7); assert.equal(config?.strength[0].exercise_id, seedId('Bench Press'));
  assert.equal(config?.powerExerciseId, seedId('Box Jump')); assert.equal(config?.circuit.stations[0].role, 'CONDITIONING');
  assert.equal(JSON.stringify(config).includes('reps'), false); assert.equal(JSON.stringify(config).includes('is_complete'), false);
  assert.equal(await c.workouts.lastConfiguration('OK_RUECKEN'), null);
  const fresh = await c.workouts.create('UK_HAMS');
  assert.deepEqual(await c.workouts.strength(fresh), []); assert.equal(await c.workouts.power(fresh), null);
});

test('exercise edits/deactivation never alter historical Power, Strength and Circuit snapshots', async t => {
  const c = await setup(t); const { id } = await configured(c);
  const exercise = await c.exercises.get(seedId('Bench Press'));
  await c.workouts.setStatus(id, 'INCOMPLETE');
  await c.exercises.update(exercise.id, { ...exercise, name: 'Renamed Bench', thumbnail_uri: 'local://new' });
  await c.exercises.setActive(exercise.id, false);
  assert.equal((await c.workouts.strength(id))[0].exercise_name_snapshot, 'Bench Press');
  assert.equal((await c.workouts.strength(id))[0].thumbnail_uri_snapshot, null);
  assert.throws(() => c.sqlite.prepare('DELETE FROM exercises WHERE id=?').run(exercise.id));
  const jump = await c.exercises.get(seedId('Box Jump'));
  await c.exercises.update(jump.id, { ...jump, name: 'New Jump' });
  assert.equal((await c.workouts.power(id))?.exercise_name_snapshot, 'Box Jump');
  const goblet = await c.exercises.get(seedId('Goblet Squat'));
  await c.exercises.update(goblet.id, { ...goblet, name: 'New Goblet' });
  assert.equal((await c.workouts.circuit(id))?.stations[0].exercise_name_snapshot, 'Goblet Squat');
});

test('Power Benchmark stores independent sides, weights, attempts and terminal status', async t => {
  const c = await setup(t); const id = await c.benchmarks.createPower();
  const left = await c.benchmarks.addPowerTest(id, { testType: 'ROTATIONAL_THROW', side: 'LEFT', medicineBallWeight: 4 });
  const right = await c.benchmarks.addPowerTest(id, { testType: 'ROTATIONAL_THROW', side: 'RIGHT', medicineBallWeight: 5 });
  await c.benchmarks.savePowerAttempt(left, 1, 300); await c.benchmarks.savePowerAttempt(right, 1, 280);
  await c.benchmarks.savePowerAttempt(left, 1, 310);
  const data = await c.benchmarks.power(id);
  assert.deepEqual(data.tests.map(x => x.medicine_ball_weight_kg), [4,5]);
  assert.deepEqual(data.attempts.map(x => x.value), [310,280]);
  await c.benchmarks.finish('power', id, 'INCOMPLETE');
  assert.equal((await c.benchmarks.power(id)).session.status, 'INCOMPLETE');
  await assert.rejects(c.benchmarks.savePowerAttempt(left, 2, 290));
  const complete = await c.benchmarks.createPower(); await c.benchmarks.finish('power', complete, 'COMPLETE');
  assert.ok((await c.benchmarks.power(complete)).session.completed_at);
  assert.equal(calculateBenchmarkDueState('POWER', await c.benchmarks.scheduledSessions(), Date.parse('2027-01-01T00:00:00Z')).status, 'DUE');
});

const loads = { bodyweight_kg_snapshot: 80, goblet_squat_load_kg: 20, kettlebell_swing_load_kg: 24, pullup_added_load_kg: 10 };
test('Circuit Benchmark creates six immutable snapshots and upserts ordered round results', async t => {
  const c = await setup(t); const id = await c.benchmarks.createCircuit(loads);
  await c.benchmarks.saveCircuitResult(id, 5, 6, 10); await c.benchmarks.saveCircuitResult(id, 1, 1, 12);
  await c.benchmarks.saveCircuitResult(id, 1, 1, 15);
  const data = await c.benchmarks.circuit(id);
  assert.deepEqual(data.stations.map(s => s.effective_weight_kg), [20,80,24,90,80,80]);
  assert.deepEqual(data.results.map(r => r.reps), [15,10]);
  await c.bodyweight.update(90);
  assert.equal((await c.benchmarks.circuit(id)).session.bodyweight_kg_snapshot, 80);
  assert.throws(() => c.sqlite.prepare('UPDATE circuit_benchmark_sessions SET bodyweight_kg_snapshot=90 WHERE id=?').run(id), /immutable/);
  assert.throws(() => c.sqlite.prepare("UPDATE circuit_benchmark_stations SET exercise_name_snapshot='Changed' WHERE circuit_benchmark_session_id=?").run(id), /immutable/);
  await c.benchmarks.finish('circuit', id, 'COMPLETE');
  await assert.rejects(c.benchmarks.saveCircuitResult(id, 1, 1, 16));
});

test('repository calls serialize concurrent transactions without mixing rollback boundaries', async t => {
  const c = await setup(t);
  const outcomes = await Promise.allSettled([c.bodyweight.update(80), c.bodyweight.update(-1), c.bodyweight.update(82)]);
  assert.deepEqual(outcomes.map(r => r.status), ['fulfilled','rejected','fulfilled']);
  assert.deepEqual((await c.bodyweight.list()).map(e => e.bodyweight_kg), [80,82]);
  assert.equal((await c.profile.get()).current_bodyweight_kg, 82);
});

test('file-backed database retains profile, sets, cycle and benchmark data after actual connection reopen', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hybrid-persistence-')); const filename = join(directory, 'test.db');
  let c = connect(filename);
  t.after(() => { c.sqlite.close(); rmSync(directory, { recursive: true }); });
  await initializeDatabase(c.db);
  await c.bodyweight.update(80); await c.cycle.save(4);
  const { id, a } = await configured(c);
  for (let set = 1; set <= 4; set++) await c.workouts.saveSet(a, set, 100, 7, 2);
  await c.workouts.setStrengthComplete(a, true);
  await c.workouts.saveCircuitProgress(id, 2, 1, 'IN_PROGRESS');
  const benchmark = await c.benchmarks.createCircuit(loads); await c.benchmarks.saveCircuitResult(benchmark, 3, 2, 12);
  const powerBenchmark = await c.benchmarks.createPower();
  const powerTest = await c.benchmarks.addPowerTest(powerBenchmark, { testType: 'CHEST_PASS', side: 'NONE', medicineBallWeight: 4 });
  await c.benchmarks.savePowerAttempt(powerTest, 2, 330);
  const powerBefore = await c.benchmarks.power(powerBenchmark);
  const circuitBefore = await c.benchmarks.circuit(benchmark);
  const normalBefore = await c.workouts.circuit(id);
  c.sqlite.close(); c = connect(filename); await initializeDatabase(c.db);
  assert.equal((await c.profile.get()).current_bodyweight_kg, 80);
  assert.equal((await c.bodyweight.list()).length, 1);
  assert.equal((await c.cycle.get()).current_position, 4);
  assert.equal((await c.workouts.sets(a))[0].reps, 7);
  assert.deepEqual(await c.workouts.circuit(id), normalBefore);
  assert.deepEqual(await c.benchmarks.circuit(benchmark), circuitBefore);
  assert.deepEqual(await c.benchmarks.power(powerBenchmark), powerBefore);
  assert.equal((await c.workouts.strength(id))[0].is_complete, 1);
});
