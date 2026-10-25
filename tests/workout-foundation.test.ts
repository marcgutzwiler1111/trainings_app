import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from './support/sqlite.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices, FeatureError, userMessage } from '../src/features/application/services.ts';
import { defaultBuilder, defaultRoles, builderDuration, circuitEffect, exerciseOptions, moveStation, strengthEffects, validateBuilder, type BuilderDraft } from '../src/features/workout/builder.ts';
import type { WorkoutType } from '../src/domain/shared/types.ts';
import { seedExercises } from '../src/data/seed.ts';

const id = (name: string) => seedExercises.find(e => e.name === name)!.id;
function valid(type: WorkoutType = 'UK_HAMS'): BuilderDraft {
  return { ...defaultBuilder(type), powerExerciseId: id('Box Jump'), strengthA: id('Romanian Deadlift'), strengthB: id('Front Squat'),
    stations: defaultRoles.map((role, index) => ({ role, exerciseId: index === 3 ? id('Burpees') : id('Goblet Squat') })) };
}
async function setup(t: TestContext) {
  const c = connect(); t.after(() => c.sqlite.close()); await initializeDatabase(c.db);
  return { ...c, services: createApplicationServices(createRepositories(c.db, c.store.now)) };
}

test('Home loads real cycle position and expected workout without creating sessions', async t => {
  const c = await setup(t); await c.cycle.save(2);
  const home = await c.services.home.load();
  assert.equal(home.cycle.current_position, 2); assert.equal(home.nextLabel, 'OK Brust');
  assert.deepEqual(home.item, { position: 2, type: 'WORKOUT', workoutType: 'OK_BRUST' });
  assert.equal(home.active, null); assert.deepEqual(await c.workouts.list(), []);
});

test('Home recognizes Rest and its confirmation advances once without creating a workout', async t => {
  const c = await setup(t); await c.cycle.save(3);
  assert.equal((await c.services.home.load()).nextLabel, 'Rest');
  await c.services.home.completeRest(3);
  assert.equal((await c.cycle.get()).current_position, 4);
  await assert.rejects(c.services.home.completeRest(3));
  assert.equal((await c.cycle.get()).current_position, 4);
  assert.deepEqual(await c.workouts.list(), []);
});

const mapping = {
  UK_HAMS: ['LOWER_POSTERIOR','LOWER_ANTERIOR'], OK_BRUST: ['UPPER_PUSH','UPPER_PULL'],
  UK_QUADS: ['LOWER_ANTERIOR','LOWER_POSTERIOR'], OK_RUECKEN: ['UPPER_PULL','UPPER_PUSH'],
} as const;
for (const type of Object.keys(mapping) as WorkoutType[]) {
  test(`${type}: Strength and Circuit recommendations match the documented training system`, () => {
    assert.deepEqual(strengthEffects(type), mapping[type]);
    assert.equal(circuitEffect(type, 'FOCUS'), mapping[type][0]);
    assert.equal(circuitEffect(type, 'NON_FOCUS'), mapping[type][1]);
    assert.equal(circuitEffect(type, 'CORE'), 'CORE');
    assert.equal(circuitEffect(type, 'CONDITIONING'), 'CONDITIONING');
  });
}

test('fresh builder has six default roles, five rounds, fixed 60-second stations and no implicit exercise selections', () => {
  const draft = defaultBuilder('OK_BRUST');
  assert.equal(draft.rounds, 5); assert.equal(draft.stations.length, 6);
  assert.deepEqual(draft.stations.map(s => s.role), ['FOCUS','CORE','FOCUS','CONDITIONING','FOCUS','NON_FOCUS']);
  assert.equal(builderDuration(draft), 1800); assert.equal(draft.powerExerciseId, null);
});

test('opening or switching builder types does not persist a workout', async t => {
  const c = await setup(t);
  assert.equal((await c.services.workout.builder('OK_BRUST')).draft.workoutType, 'OK_BRUST');
  assert.equal((await c.services.workout.builder('UK_QUADS')).draft.workoutType, 'UK_QUADS');
  assert.deepEqual(await c.workouts.list(), []);
});

for (const key of ['powerExerciseId','strengthA','strengthB'] as const) {
  test(`missing ${key} blocks builder confirmation`, async t => {
    const c = await setup(t); const draft = { ...valid(), [key]: null };
    assert.ok(validateBuilder(draft, await c.exercises.list()).length);
    await assert.rejects(c.services.workout.start(draft), FeatureError);
    assert.deepEqual(await c.workouts.list(), []);
  });
}

for (const rounds of [0, -1, 1.5, NaN, Infinity]) {
  test(`round count ${rounds} blocks builder confirmation`, async t => {
    const c = await setup(t); const draft = { ...valid(), rounds };
    assert.equal(builderDuration(draft), null);
    await assert.rejects(c.services.workout.start(draft), FeatureError);
  });
}

test('empty Circuit, missing exercise and invalid role are reported clearly', async t => {
  const c = await setup(t); const exercises = await c.exercises.list();
  assert.ok(validateBuilder({ ...valid(), stations: [] }, exercises).some(s => s.includes('Mindestens eine')));
  assert.ok(validateBuilder({ ...valid(), stations: [{ role: 'FOCUS', exerciseId: null }] }, exercises).some(s => s.includes('Station 1')));
  const draft = valid(); Object.assign(draft.stations[0], { role: '' });
  assert.ok(validateBuilder(draft, exercises).some(s => s.includes('Rolle')));
  await assert.rejects(c.services.workout.start(draft), FeatureError);
});

test('valid builder is accepted and station reordering is immutable', async t => {
  const c = await setup(t); const draft = valid();
  assert.deepEqual(validateBuilder(draft, await c.exercises.list()), []);
  const moved = moveStation(draft, 0, 1);
  assert.equal(moved.stations[0].role, 'CORE'); assert.equal(draft.stations[0].role, 'FOCUS');
  assert.equal(moveStation(draft, 0, -1), draft);
});

test('exercise selection filters active exercises, searches case-insensitively and prioritizes recommendations in Show all', async t => {
  const c = await setup(t); const exercises = await c.exercises.list();
  const filtered = exerciseOptions(exercises, 'STRENGTH', 'UPPER_PUSH', '', false);
  assert.ok(filtered.length); assert.ok(filtered.every(e => e.areas.includes('STRENGTH') && e.effects.includes('UPPER_PUSH')));
  const searched = exerciseOptions(exercises, 'STRENGTH', 'UPPER_PUSH', 'BENCH', true);
  assert.deepEqual(searched.map(e => e.name), ['Bench Press','Incline Bench Press']);
  const all = exerciseOptions(exercises, 'STRENGTH', 'UPPER_PUSH', '', true);
  assert.equal(all.length, exercises.length); assert.equal(all[0].effects.includes('UPPER_PUSH'), true);
  await c.exercises.setActive(id('Bench Press'), false);
  assert.equal(exerciseOptions(await c.exercises.list(true), 'STRENGTH', 'UPPER_PUSH', 'Bench Press', true).some(e => e.id === id('Bench Press')), false);
});

test('builder loads Last Workout config and never carries prior performance or completion fields', async t => {
  const c = await setup(t); const draft = { ...valid(), rounds: 3, stations: valid().stations.slice(0, 2) };
  const session = await c.services.workout.start(draft); const strength = await c.workouts.strength(session);
  await c.workouts.saveSet(strength[0].id, 1, 100, 8, 2);
  await c.services.workout.endIncomplete(session);
  const loaded = await c.services.workout.builder('UK_HAMS');
  assert.equal(loaded.fromPrevious, true); assert.deepEqual(loaded.draft, draft);
  assert.equal(JSON.stringify(loaded.draft).includes('reps'), false);
  assert.equal(JSON.stringify(loaded.draft).includes('is_complete'), false);
  assert.equal(JSON.stringify(loaded.draft).includes('current_round'), false);
  const fresh = await c.services.workout.start(loaded.draft);
  assert.deepEqual(await c.workouts.sets((await c.workouts.strength(fresh))[0].id), []);
});

test('workout types load their own configuration or fall back to unselected standard defaults', async t => {
  const c = await setup(t);
  const a = await c.services.workout.start({ ...valid('UK_HAMS'), rounds: 2 }); await c.services.workout.endIncomplete(a);
  const b = await c.services.workout.start({ ...valid('OK_BRUST'), rounds: 4 }); await c.services.workout.endIncomplete(b);
  assert.equal((await c.services.workout.builder('UK_HAMS')).draft.rounds, 2);
  assert.equal((await c.services.workout.builder('OK_BRUST')).draft.rounds, 4);
  const missing = await c.services.workout.builder('OK_RUECKEN');
  assert.equal(missing.fromPrevious, false); assert.equal(missing.draft.rounds, 5);
});

test('inactive last-workout selections are cleared with a warning instead of silently replaced', async t => {
  const c = await setup(t); const session = await c.services.workout.start(valid()); await c.services.workout.endIncomplete(session);
  await c.exercises.setActive(id('Box Jump'), false);
  const loaded = await c.services.workout.builder('UK_HAMS');
  assert.equal(loaded.draft.powerExerciseId, null); assert.equal(loaded.draft.strengthA, id('Romanian Deadlift'));
  assert.ok(loaded.warnings.some(w => w.includes('nicht mehr aktive')));
  await assert.rejects(c.services.workout.start(loaded.draft), FeatureError);
});

test('empty exercise library is reported and cannot start a workout', async t => {
  const c = await setup(t); for (const exercise of await c.exercises.list()) await c.exercises.setActive(exercise.id, false);
  const loaded = await c.services.workout.builder('UK_HAMS');
  assert.equal(loaded.exercises.length, 0); assert.ok(loaded.warnings.some(w => w.includes('Keine aktiven')));
  await assert.rejects(c.services.workout.start(valid()), FeatureError);
});

test('atomic start writes snapshots, both Strength slots and IN_PROGRESS with expected cycle and override', async t => {
  const c = await setup(t); await c.cycle.save(2); await c.bodyweight.update(80);
  const session = await c.services.workout.start(valid('UK_QUADS'));
  const row = await c.workouts.get(session);
  assert.equal(row.workout_type, 'UK_QUADS'); assert.equal(row.expected_cycle_position, 2);
  assert.equal(row.expected_workout_type, 'OK_BRUST'); assert.equal(row.was_manual_override, 1);
  assert.equal(row.status, 'IN_PROGRESS'); assert.equal(row.bodyweight_snapshot_kg, 80);
  assert.equal((await c.workouts.power(session))?.exercise_name_snapshot, 'Box Jump');
  assert.deepEqual((await c.workouts.strength(session)).map(s => s.slot), ['A','B']);
  assert.equal((await c.workouts.circuit(session))?.stations.length, 6);
  assert.equal((await c.cycle.get()).current_position, 2);
});

test('matching start is not marked as manual override and Rest-day manual start is', async t => {
  const c = await setup(t); const session = await c.services.workout.start(valid());
  assert.equal((await c.workouts.get(session)).was_manual_override, 0);
  await c.services.workout.endIncomplete(session); await c.cycle.save(3);
  const override = await c.services.workout.start(valid('OK_BRUST'));
  assert.equal((await c.workouts.get(override)).was_manual_override, 1);
  assert.equal((await c.workouts.get(override)).expected_workout_type, null);
});

test('failure in a late Circuit persistence step leaves no session or section rows', async t => {
  const c = await setup(t);
  c.sqlite.exec("CREATE TRIGGER fail_start BEFORE INSERT ON workout_circuit_stations WHEN NEW.position=2 BEGIN SELECT RAISE(ABORT,'injected start failure'); END;");
  await assert.rejects(c.services.workout.start(valid()), /injected start failure/);
  for (const table of ['workout_sessions','workout_power_sections','workout_strength_exercises','workout_circuit_sections','workout_circuit_stations']) {
    assert.equal(c.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n, 0);
  }
  assert.equal((await c.cycle.get()).current_position, 1);
});

test('concurrent confirmations permit exactly one active workout and no partial second session', async t => {
  const c = await setup(t);
  const results = await Promise.allSettled([c.services.workout.start(valid()), c.services.workout.start(valid())]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await c.workouts.list()).length, 1);
  assert.equal((await c.services.home.load()).active?.status, 'IN_PROGRESS');
  await assert.rejects(c.services.workout.builder('UK_HAMS'), FeatureError);
});

test('Home resume and overview read the same existing session without creating a second one', async t => {
  const c = await setup(t); const session = await c.services.workout.start(valid());
  const active = (await c.services.home.load()).active;
  assert.equal(active?.id, session);
  const overview = await c.services.workout.overview(active!.id);
  assert.equal(overview.durationSeconds, 1800); assert.equal(overview.power.completed_set_count, 0);
  assert.equal(overview.circuit.section.current_round, null);
  assert.equal((await c.workouts.list()).length, 1);
});

test('ending incomplete retains configuration and never advances the cycle', async t => {
  const c = await setup(t); const session = await c.services.workout.start(valid());
  await c.services.workout.endIncomplete(session);
  assert.equal((await c.workouts.get(session)).status, 'INCOMPLETE');
  assert.equal((await c.services.home.load()).active, null);
  assert.equal((await c.cycle.get()).current_position, 1);
  assert.equal((await c.workouts.circuit(session))?.stations.length, 6);
});

test('Rest cannot be completed while a workout is active', async t => {
  const c = await setup(t); await c.cycle.save(3); await c.services.workout.start(valid());
  await assert.rejects(c.services.home.completeRest(3));
  assert.equal((await c.cycle.get()).current_position, 3);
});

test('resume survives actual database close/reopen without resetting progress or creating a session', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'workout-resume-')); const file = join(dir, 'app.db');
  let c = connect(file); t.after(() => { c.sqlite.close(); rmSync(dir, { recursive: true }); });
  await initializeDatabase(c.db); let service = createApplicationServices(createRepositories(c.db));
  const session = await service.workout.start(valid());
  const before = await service.workout.overview(session);
  c.sqlite.close(); c = connect(file); await initializeDatabase(c.db);
  service = createApplicationServices(createRepositories(c.db));
  assert.equal((await service.home.load()).active?.id, session);
  assert.deepEqual(await service.workout.overview(session), before);
  assert.equal((await c.workouts.list()).length, 1);
});

test('technical failures are mapped to a generic UI message, not raw SQL', () => {
  const original = console.error; console.error = () => {};
  try {
    assert.equal(userMessage(new Error('SQLITE_CONSTRAINT: secret SQL')), 'Die Daten konnten nicht geladen oder gespeichert werden. Bitte erneut versuchen.');
    assert.equal(userMessage(new FeatureError('Bitte eine Übung wählen.')), 'Bitte eine Übung wählen.');
  } finally { console.error = original; }
});
