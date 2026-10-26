import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from './support/sqlite.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices, FeatureError } from '../src/features/application/services.ts';
import { parseSetInput } from '../src/features/workout/active.ts';
import { resetRestTimer, tickRestTimer, extendRestTimer, skipRestTimer, formatRestTime } from '../src/features/workout/restTimer.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';
import { seedExercises } from '../src/data/seed.ts';

const exercise = (name: string) => seedExercises.find(e => e.name === name)!.id;
function services(c: ReturnType<typeof connect>) { return createApplicationServices(createRepositories(c.db, c.store.now)); }
async function start(c: ReturnType<typeof connect>) {
  return services(c).workout.start({ workoutType: 'UK_HAMS', powerExerciseId: exercise('Box Jump'), strengthA: exercise('Bench Press'), strengthB: exercise('Pull-Up'), rounds: 5,
    stations: [{ role: 'FOCUS', exerciseId: exercise('Goblet Squat') }, { role: 'CONDITIONING', exerciseId: exercise('Burpees') }] });
}
async function setup(t: TestContext) {
  const c = connect(); t.after(() => c.sqlite.close()); await initializeDatabase(c.db);
  const app = services(c); const id = await start(c);
  return { ...c, app, id };
}
async function finishPower(c: { app: ReturnType<typeof services>; id: string }) {
  await c.app.training.beginPower(c.id);
  for (let count = 0; count < 4; count++) await c.app.training.completePowerSet(c.id, count);
  await c.app.training.completePower(c.id);
}
async function four(c: { app: ReturnType<typeof services>; id: string }, strengthId: string, weight = '100') {
  for (let n = 1; n <= 4; n++) await c.app.training.saveSet(c.id, strengthId, n, { weight, reps: '8', rir: '2' });
  await c.app.training.completeExercise(c.id, strengthId);
}

test('Power loads its snapshot, count and separate rest setting from the profile', async t => {
  const c = await setup(t); await c.profile.updateRestTimers(75, 45);
  const state = await c.app.training.power(c.id);
  assert.equal(state.power.exercise_name_snapshot, 'Box Jump'); assert.equal(state.power.completed_set_count, 0);
  assert.equal(state.nextSet, 1); assert.equal(state.restSeconds, 75);
  await c.app.training.beginPower(c.id);
  assert.equal((await c.app.training.power(c.id)).power.status, 'IN_PROGRESS');
  assert.equal((await c.app.workout.overview(c.id)).canStrength, false);
});

test('each Power event persists once and concurrent duplicate expected counts cannot double-increment', async t => {
  const c = await setup(t);
  const outcomes = await Promise.allSettled([c.app.training.completePowerSet(c.id, 0), c.app.training.completePowerSet(c.id, 0)]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  assert.equal((await c.app.training.power(c.id)).power.completed_set_count, 1);
  await assert.rejects(c.app.training.completePowerSet(c.id, 0), FeatureError);
  assert.equal((await c.app.training.power(c.id)).nextSet, 2);
});

for (const count of [0,1,2,3]) {
  test(`Power cannot complete after ${count} of four sets`, async t => {
    const c = await setup(t);
    for (let n = 0; n < count; n++) await c.app.training.completePowerSet(c.id, n);
    await assert.rejects(c.app.training.completePower(c.id), /vier/);
    assert.notEqual((await c.workouts.power(c.id))?.status, 'COMPLETE');
  });
}

test('four Power sets enable explicit completion without completing the workout or advancing the cycle', async t => {
  const c = await setup(t); await finishPower(c);
  const power = await c.app.training.power(c.id);
  assert.equal(power.power.completed_set_count, 4); assert.equal(power.power.status, 'COMPLETE');
  await assert.rejects(c.app.training.completePowerSet(c.id, 4));
  const overview = await c.app.workout.overview(c.id);
  assert.equal(overview.canStrength, true); assert.equal(overview.session.status, 'IN_PROGRESS');
  assert.equal((await c.cycle.get()).current_position, 1);
});

test('Power selection locks on begin even before the first completed set', async t => {
  const c = await setup(t); await c.app.training.beginPower(c.id);
  await assert.rejects(c.workouts.selectPower(c.id, exercise('Broad Jump')));
});

test('Power restart preserves Strength sets/completion and Circuit snapshot', async t => {
  const c = await setup(t); await finishPower(c);
  const rows = (await c.app.training.strength(c.id)).rows;
  await four(c, rows[0].exercise.id);
  const before = await c.workouts.trainingSnapshot(c.id); const circuit = await c.workouts.circuit(c.id);
  await c.app.training.restart(c.id, 'POWER');
  const after = await c.workouts.trainingSnapshot(c.id);
  assert.equal(after?.power?.completed_set_count, 0); assert.equal(after?.power?.status, 'PLANNED');
  assert.deepEqual(after?.strength, before?.strength); assert.deepEqual(await c.workouts.circuit(c.id), circuit);
  await assert.rejects(c.app.training.strength(c.id), /Power/);
});

test('Strength and Circuit routes reject premature access and Strength writes are guarded too', async t => {
  const c = await setup(t); const a = (await c.workouts.strength(c.id))[0].id;
  await assert.rejects(c.app.training.strength(c.id), /Power/);
  await assert.rejects(c.app.training.preview(c.id), /Power/);
  await assert.rejects(c.app.training.saveSet(c.id, a, 1, { weight: '80', reps: '8', rir: '2' }), /Power/);
  assert.deepEqual(await c.workouts.sets(a), []);
});

test('Strength loads both exercises, empty reference state and its own profile rest setting', async t => {
  const c = await setup(t); await finishPower(c); await c.profile.updateRestTimers(75, 45);
  const state = await c.app.training.strength(c.id);
  assert.equal(state.rows.length, 2); assert.equal(state.restSeconds, 45);
  assert.deepEqual(state.rows.map(r => r.exercise.slot), ['A','B']);
  assert.ok(state.rows.every(r => r.previous === null && r.sets.length === 0));
  assert.equal(state.progress.status, 'PLANNED');
});

test('A1 B1 A2 B2 save freely; saved set updates preserve ID and never duplicate the row', async t => {
  const c = await setup(t); await finishPower(c);
  const [a,b] = (await c.app.training.strength(c.id)).rows;
  for (const [strengthId, number] of [[a.exercise.id,1],[b.exercise.id,1],[a.exercise.id,2],[b.exercise.id,2]] as const) {
    await c.app.training.saveSet(c.id, strengthId, number, { weight: '80.5', reps: '8', rir: '1.5' });
  }
  const before = (await c.workouts.sets(a.exercise.id))[0];
  await c.app.training.saveSet(c.id, a.exercise.id, 1, { weight: '82,5', reps: '7', rir: '2' });
  const state = await c.app.training.strength(c.id);
  assert.deepEqual(state.progress.exercises.map(e => e.saved), [2,2]);
  assert.equal(state.rows[0].sets[0].id, before.id); assert.equal(state.rows[0].sets[0].saved_at, before.saved_at);
  assert.equal(state.rows[0].sets[0].weight_kg, 82.5);
  assert.equal(state.progress.status, 'IN_PROGRESS');
});

for (const input of [
  { weight: '', reps: '8', rir: '2' }, { weight: '-1', reps: '8', rir: '2' },
  { weight: '80', reps: '2.5', rir: '2' }, { weight: '80', reps: '-1', rir: '2' },
  { weight: '80', reps: '8', rir: '-1' }, { weight: 'Infinity', reps: '8', rir: '2' },
  { weight: '80', reps: '8', rir: '' }, { weight: 'NaN', reps: '8', rir: '2' },
]) {
  test(`invalid Strength inputs ${JSON.stringify(input)} are rejected without saving`, async t => {
    const c = await setup(t); await finishPower(c); const a = (await c.workouts.strength(c.id))[0].id;
    assert.throws(() => parseSetInput(input), FeatureError);
    await assert.rejects(c.app.training.saveSet(c.id, a, 1, input), FeatureError);
    assert.deepEqual(await c.workouts.sets(a), []);
  });
}

test('zero weight/reps/RIR and fractional RIR are allowed without imposing a new maximum', () => {
  assert.deepEqual(parseSetInput({ weight: '0', reps: '0', rir: '0' }), { weight: 0, reps: 0, rir: 0 });
  assert.equal(parseSetInput({ weight: '80,5', reps: '8', rir: '100.5' }).rir, 100.5);
});

test('A/B completion is independent, partial PR is suppressed and Circuit unlocks only after both complete', async t => {
  const c = await setup(t); await finishPower(c);
  const [a,b] = (await c.app.training.strength(c.id)).rows;
  await c.app.training.saveSet(c.id, a.exercise.id, 1, { weight: '100', reps: '8', rir: '2' });
  await assert.rejects(c.app.training.completeExercise(c.id, a.exercise.id), /vier/);
  assert.equal((await c.app.training.strength(c.id)).rows[0].benchmark.isNewPr, false);
  await four(c, a.exercise.id);
  let state = await c.app.training.strength(c.id);
  assert.equal(state.rows[0].exercise.is_complete, 1); assert.equal(state.rows[1].exercise.is_complete, 0);
  assert.equal(state.rows[0].benchmark.currentVolume, 3200); assert.equal(state.rows[0].benchmark.isNewPr, true);
  assert.ok(Math.abs(state.rows[0].bestE1RM! - 100 * (1 + 10/30)) < 1e-12);
  assert.equal((await c.app.workout.overview(c.id)).canCircuit, false);
  await assert.rejects(c.app.training.preview(c.id));
  await four(c, b.exercise.id, '20'); state = await c.app.training.strength(c.id);
  assert.equal(state.progress.status, 'COMPLETE'); assert.equal((await c.app.workout.overview(c.id)).canCircuit, true);
  const preview = await c.app.training.preview(c.id);
  assert.equal(preview.durationSeconds, 600); assert.equal(preview.section.status, 'PLANNED');
  assert.equal(preview.section.current_round, null); assert.equal(preview.section.started_at, null);
});

test('a completed exercise can have an existing set corrected while the workout stays editable', async t => {
  const c = await setup(t); await finishPower(c); const a = (await c.workouts.strength(c.id))[0].id;
  await four(c,a); await c.app.training.saveSet(c.id, a, 2, { weight: '100', reps: '9', rir: '1' });
  const row = (await c.app.training.strength(c.id)).rows[0];
  assert.equal(row.sets.length, 4); assert.equal(row.exercise.is_complete, 1); assert.equal(row.benchmark.currentVolume, 3300);
});

test('Strength restart clears only current sets/flags, preserves selections, Power, Circuit and historical PRs', async t => {
  const c = await setup(t); await finishPower(c); const oldA = (await c.workouts.strength(c.id))[0].id;
  await four(c,oldA); await c.app.workout.endIncomplete(c.id);
  const current = await start(c); const app = c.app;
  await finishPower({ app, id: current }); const [a,b] = (await app.training.strength(current)).rows;
  await four({ app, id: current },a.exercise.id); await four({ app, id: current },b.exercise.id,'20');
  const power = await c.workouts.power(current); const circuit = await c.workouts.circuit(current);
  await app.training.restart(current, 'STRENGTH'); const state = await app.training.strength(current);
  assert.ok(state.rows.every(r => r.sets.length === 0 && r.exercise.is_complete === 0));
  assert.equal(state.rows[0].exercise.id, a.exercise.id);
  assert.deepEqual(await c.workouts.power(current), power); assert.deepEqual(await c.workouts.circuit(current), circuit);
  assert.equal((await c.workouts.sets(oldA)).length, 4);
  assert.equal(calculateStrengthBenchmark(exercise('Bench Press'), await c.workouts.performances(exercise('Bench Press'))), 3200);
});

test('Strength choice locks after first saved set and becomes editable after confirmed restart', async t => {
  const c = await setup(t); await finishPower(c);
  await c.app.training.changeStrength(c.id, 'A', exercise('Incline Bench Press'));
  let row = (await c.app.training.strength(c.id)).rows[0]; assert.equal(row.exercise.exercise_id, exercise('Incline Bench Press'));
  await c.app.training.saveSet(c.id, row.exercise.id, 1, { weight: '80', reps: '8', rir: '2' });
  await assert.rejects(c.app.training.changeStrength(c.id, 'A', exercise('Bench Press')), /neu starten/);
  await c.app.training.restart(c.id, 'STRENGTH');
  await c.app.training.changeStrength(c.id, 'A', exercise('Bench Press'));
  row = (await c.app.training.strength(c.id)).rows[0]; assert.equal(row.exercise.exercise_id, exercise('Bench Press'));
});

test('unexpected inactivity warns while the saved snapshot remains usable; a newly selected inactive exercise is refused', async t => {
  const c = await setup(t); await c.exercises.setActive(exercise('Box Jump'), false);
  assert.equal((await c.app.training.power(c.id)).inactive, true); await finishPower(c);
  await c.exercises.setActive(exercise('Bench Press'), false);
  assert.equal((await c.app.training.strength(c.id)).rows[0].inactive, true);
  await c.app.training.saveSet(c.id, (await c.workouts.strength(c.id))[0].id, 1, { weight: '100', reps: '8', rir: '2' });
  await c.exercises.setActive(exercise('Incline Bench Press'), false);
  await assert.rejects(c.app.training.changeStrength(c.id, 'B', exercise('Incline Bench Press')), /nicht mehr aktiv/);
});

for (const status of ['COMPLETE','INCOMPLETE'] as const) {
  test(`${status} history preserves exercise-based PRs and rejects all active training mutations`, async t => {
    const c = await setup(t); await finishPower(c); const rows = (await c.app.training.strength(c.id)).rows;
    for (const row of rows) await four(c, row.exercise.id);
    if (status === 'COMPLETE') await c.workouts.finish(c.id);
    else await c.app.workout.endIncomplete(c.id);
    const before = await c.workouts.trainingSnapshot(c.id);
    await assert.rejects(c.app.training.beginPower(c.id), /nicht mehr aktiv/);
    await assert.rejects(c.app.training.completePowerSet(c.id, 4), /nicht mehr aktiv/);
    await assert.rejects(c.app.training.completePower(c.id), /nicht mehr aktiv/);
    await assert.rejects(c.app.training.saveSet(c.id, rows[0].exercise.id, 1, { weight: '1', reps: '1', rir: '1' }), /nicht mehr aktiv/);
    await assert.rejects(c.app.training.completeExercise(c.id, rows[0].exercise.id), /nicht mehr aktiv/);
    await assert.rejects(c.app.training.restart(c.id, 'POWER'), /nicht mehr aktiv/);
    await assert.rejects(c.app.training.restart(c.id, 'STRENGTH'), /nicht mehr aktiv/);
    assert.deepEqual(await c.workouts.trainingSnapshot(c.id), before);
    assert.equal(calculateStrengthBenchmark(exercise('Bench Press'), await c.workouts.performances(exercise('Bench Press'))), 3200);
  });
}

test('two-set exercise in INCOMPLETE history never becomes a PR and exact IDs remain separated', async t => {
  const c = await setup(t); await finishPower(c); const a = (await c.workouts.strength(c.id))[0].id;
  for (let n = 1; n <= 2; n++) await c.app.training.saveSet(c.id, a, n, { weight: '1000', reps: '8', rir: '2' });
  await c.app.workout.endIncomplete(c.id);
  assert.equal(calculateStrengthBenchmark(exercise('Bench Press'), await c.workouts.performances(exercise('Bench Press'))), 0);
  const current = await start(c); await finishPower({ app: c.app, id: current });
  await c.app.training.changeStrength(current, 'A', exercise('Incline Bench Press'));
  const incline = (await c.app.training.strength(current)).rows[0];
  assert.equal(incline.previous, null); assert.equal(incline.benchmark.previousBenchmark, 0);
});

test('latest terminal exact-exercise performance is read as reference only, with no automatic set copying', async t => {
  const c = await setup(t); await finishPower(c); const oldA = (await c.workouts.strength(c.id))[0].id;
  await four(c, oldA, '80'); await c.app.workout.endIncomplete(c.id);
  const second = await start(c); await finishPower({ app: c.app, id: second });
  const a = (await c.workouts.strength(second))[0].id;
  await c.app.training.saveSet(second, a, 1, { weight: '90', reps: '7', rir: '1' });
  await c.app.workout.endIncomplete(second);
  const current = await start(c); await finishPower({ app: c.app, id: current });
  const row = (await c.app.training.strength(current)).rows[0];
  assert.equal(row.previous?.exercise.workout_session_id, second); assert.equal(row.previous?.sets[0].weight_kg, 90);
  assert.equal(row.sets.length, 0); assert.equal(row.benchmark.previousBenchmark, 2560);
});

test('database save failure leaves the previous set and completion flag intact', async t => {
  const c = await setup(t); await finishPower(c); const a = (await c.workouts.strength(c.id))[0].id;
  await four(c,a); const before = await c.workouts.sets(a);
  c.sqlite.exec("CREATE TRIGGER fail_set BEFORE UPDATE ON strength_sets BEGIN SELECT RAISE(ABORT,'injected save failure'); END;");
  await assert.rejects(c.app.training.saveSet(c.id, a, 1, { weight: '90', reps: '7', rir: '1' }), /injected save failure/);
  assert.deepEqual(await c.workouts.sets(a), before); assert.equal((await c.workouts.strength(c.id))[0].is_complete, 1);
});

test('missing workout, missing Power and missing Strength yield safe feature errors', async t => {
  const c = await setup(t);
  await assert.rejects(c.app.training.power('missing'), /nicht gefunden/);
  c.sqlite.prepare('DELETE FROM workout_power_sections WHERE workout_session_id=?').run(c.id);
  await assert.rejects(c.app.training.power(c.id), /Power-Bereich fehlt/);
  await c.workouts.selectPower(c.id, exercise('Box Jump'));
  c.sqlite.prepare('DELETE FROM workout_strength_exercises WHERE workout_session_id=?').run(c.id);
  await assert.rejects(c.app.training.power(c.id), /Strength-Übung fehlt/);
});

test('file-backed resume preserves mixed legacy progress: Power 2, A1/B1, active session and unchanged cycle', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'power-strength-')); const file = join(dir, 'app.db');
  let c = connect(file); t.after(() => { c.sqlite.close(); rmSync(dir, { recursive: true }); });
  await initializeDatabase(c.db); let app = services(c); const id = await start(c);
  await app.training.completePowerSet(id,0); await app.training.completePowerSet(id,1);
  const rows = await c.workouts.strength(id);
  // Persistence fixture required by CODEX-005. New application writes still enforce Power → Strength.
  await c.workouts.saveSet(rows[0].id,1,100,8,2); await c.workouts.saveSet(rows[1].id,1,20,8,2);
  c.sqlite.close(); c = connect(file); await initializeDatabase(c.db); app = services(c);
  const overview = await app.workout.overview(id);
  assert.equal(overview.power.completed_set_count, 2); assert.deepEqual(overview.progress.exercises.map(e => e.saved), [1,1]);
  assert.equal(overview.session.status, 'IN_PROGRESS'); assert.equal((await c.cycle.get()).current_position,1);
});

test('file-backed INCOMPLETE retains Power and both completed exercises as valid historical PRs', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'strength-history-')); const file = join(dir, 'app.db');
  let c = connect(file); t.after(() => { c.sqlite.close(); rmSync(dir, { recursive: true }); });
  await initializeDatabase(c.db); const app = services(c); const id = await start(c);
  await finishPower({ app, id });
  const rows = (await app.training.strength(id)).rows;
  for (const row of rows) await four({ app, id },row.exercise.id);
  await app.workout.endIncomplete(id);
  c.sqlite.close(); c = connect(file); await initializeDatabase(c.db);
  assert.equal((await c.workouts.get(id)).status,'INCOMPLETE'); assert.equal((await c.cycle.get()).current_position,1);
  assert.equal((await c.workouts.power(id))?.completed_set_count,4);
  for (const row of await c.workouts.strength(id)) {
    assert.equal(row.is_complete,1); assert.equal((await c.workouts.sets(row.id)).length,4);
    assert.equal(calculateStrengthBenchmark(row.exercise_id, await c.workouts.performances(row.exercise_id)),3200);
  }
});

for (const seconds of [0,120,150]) {
  test(`rest timer resets to the supplied profile default ${seconds} and never resumes a persisted timer`, () => {
    const state = resetRestTimer(seconds); assert.equal(state.remaining,seconds); assert.equal(state.running,seconds>0);
    assert.deepEqual(skipRestTimer(), { remaining:0, running:false });
  });
}

test('rest timer deterministic elapsed ticks clamp at zero and support +30 and skip', () => {
  assert.deepEqual(tickRestTimer(resetRestTimer(120)), { remaining:119, running:true });
  assert.equal(tickRestTimer(resetRestTimer(120),30).remaining,90);
  assert.deepEqual(tickRestTimer(resetRestTimer(5),20), { remaining:0, running:false });
  assert.equal(extendRestTimer(resetRestTimer(120)).remaining,150);
  assert.deepEqual(extendRestTimer(skipRestTimer()), { remaining:30, running:true });
  assert.equal(formatRestTime(150),'02:30'); assert.equal(formatRestTime(0),'00:00');
  assert.equal(resetRestTimer(45).remaining,45);
});


test('uncomputable finite metrics are rejected before committing a set or overflowing the exercise total', async t => {
  const c = await setup(t); await finishPower(c); const a = (await c.workouts.strength(c.id))[0].id;
  await assert.rejects(c.app.training.saveSet(c.id, a, 1, { weight: String(Number.MAX_VALUE), reps: '1', rir: '100' }), FeatureError);
  assert.deepEqual(await c.workouts.sets(a), []);
  await c.app.training.saveSet(c.id, a, 1, { weight: '1e308', reps: '1', rir: '0' });
  await assert.rejects(c.app.training.saveSet(c.id, a, 2, { weight: '1e308', reps: '1', rir: '0' }), FeatureError);
  assert.equal((await c.workouts.sets(a)).length, 1);
});
