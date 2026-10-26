import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from './support/sqlite.ts';
import { completeSections } from './support/completion.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { migrateDatabase, migrations } from '../src/data/migrations.ts';
import { seedDatabase, seedExercises } from '../src/data/seed.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices, FeatureError, userMessage } from '../src/features/application/services.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';
import type { WorkoutType } from '../src/domain/shared/types.ts';
import type { CyclePosition, ManualOverrideResult } from '../src/domain/cycle/cycle.ts';

const seed = (name: string) => seedExercises.find(e => e.name === name)!.id;
const app = (c: ReturnType<typeof connect>) => createApplicationServices(createRepositories(c.db, c.store.now));
async function setup(t: TestContext, position: CyclePosition = 2, type: WorkoutType = 'OK_BRUST') {
  const c = connect(); t.after(() => c.sqlite.close()); await initializeDatabase(c.db);
  await c.cycle.save(position);
  const id = await c.workouts.startConfigured({ workoutType: type, powerExerciseId: seed('Box Jump'),
    strengthA: { exerciseId: seed('Bench Press'), effect: 'UPPER_PUSH' },
    strengthB: { exerciseId: seed('Pull-Up'), effect: 'UPPER_PULL' },
    rounds: 2, stations: [{ exerciseId: seed('Goblet Squat'), role: 'FOCUS', effect: 'LOWER_ANTERIOR' }] });
  await completeSections(c, id);
  return { ...c, id, app: app(c) };
}
async function assertPending(c: Awaited<ReturnType<typeof setup>>, position: CyclePosition = 2) {
  const session = await c.workouts.get(c.id);
  assert.equal(session.status, 'IN_PROGRESS'); assert.equal(session.completed_at, null);
  assert.equal(session.cycle_override_decision, null); assert.equal((await c.cycle.get()).current_position, position);
}

test('matching OK Brust completes atomically, advances to Rest and Home shows the latest terminal workout', async t => {
  const c = await setup(t); const before = await c.workouts.trainingSnapshot(c.id);
  const summary = await c.app.completion.load(c.id);
  assert.equal(summary.ready, true); assert.equal(summary.requiresDecision, false);
  assert.equal(summary.label, 'OK Brust'); assert.equal(summary.expectedLabel, 'OK Brust');
  assert.equal(summary.power?.completed_set_count, 4);
  assert.deepEqual(summary.strength.map(e => [e.exercise.exercise_name_snapshot, e.setCount, e.volume]), [['Bench Press',4,3200],['Pull-Up',4,3200]]);
  assert.equal(summary.circuit?.section.round_count, 2); assert.equal(summary.circuit?.stations.length, 1);
  assert.equal((await c.app.workout.overview(c.id)).canComplete, true);
  const result = await c.app.completion.finish(c.id); assert.equal(result.nextLabel, 'Rest'); assert.equal(result.position, 3);
  const home = await c.app.home.load(); assert.equal(home.active, null); assert.equal(home.nextLabel, 'Rest');
  assert.equal(home.latest?.id, c.id); assert.equal(home.latest?.status, 'COMPLETE');
  assert.equal(home.latest?.completed_at, home.latest?.updated_at); assert.ok(home.latest?.completed_at);
  assert.equal(home.latest?.cycle_override_decision, null);
  const after = await c.workouts.trainingSnapshot(c.id);
  assert.deepEqual(after?.strength, before?.strength); assert.deepEqual(after?.power, before?.power);
});

test('matching UK Quads requires no override and advances exactly to OK Rücken', async t => {
  const c = await setup(t,4,'UK_QUADS'); assert.equal((await c.app.completion.load(c.id)).requiresDecision, false);
  assert.equal((await c.app.completion.finish(c.id)).position,5);
});

for (const [section, sql] of [
  ['Power', "UPDATE workout_power_sections SET status='IN_PROGRESS', completed_at=NULL WHERE workout_session_id= ?"],
  ['Strength A', "UPDATE workout_strength_exercises SET is_complete=0 WHERE slot='A' AND workout_session_id= ?"],
  ['Strength B', "UPDATE workout_strength_exercises SET is_complete=0 WHERE slot='B' AND workout_session_id= ?"],
  ['Circuit', "UPDATE workout_circuit_sections SET status='IN_PROGRESS', completed_at=NULL WHERE workout_session_id= ?"],
] as const) {
  test(`completion is guarded in repository and application when ${section} is unfinished`, async t => {
    const c = await setup(t); c.sqlite.prepare(sql).run(c.id);
    assert.equal((await c.app.completion.load(c.id)).ready, false);
    assert.equal((await c.app.workout.overview(c.id)).canComplete, false);
    await assert.rejects(c.workouts.finish(c.id), new RegExp(section));
    await assert.rejects(c.app.completion.finish(c.id), FeatureError); await assertPending(c);
  });
}

for (const section of ['POWER','STRENGTH','CIRCUIT'] as const) {
  test(`a missing ${section} section cannot be bypassed by direct finish`, async t => {
    const c = await setup(t); await c.workouts.restart(c.id,section);
    await assert.rejects(c.app.completion.finish(c.id),FeatureError); await assertPending(c);
  });
}

test('completion flags alone cannot bypass missing Power or Strength working sets', async t => {
  const c = await setup(t); c.sqlite.prepare('UPDATE workout_power_sections SET completed_set_count=2 WHERE workout_session_id=?').run(c.id);
  await assert.rejects(c.app.completion.finish(c.id),/Power/);
  c.sqlite.prepare('UPDATE workout_power_sections SET completed_set_count=4 WHERE workout_session_id=?').run(c.id);
  c.sqlite.prepare('DELETE FROM strength_sets WHERE set_number=4').run();
  await assert.rejects(c.app.completion.finish(c.id),/Strength/); await assertPending(c);
});

test('a Circuit COMPLETE flag with a nonfinal stored cursor cannot complete the workout',async t=>{
  const c=await setup(t); c.sqlite.prepare('UPDATE workout_circuit_sections SET current_round=1 WHERE workout_session_id=?').run(c.id);
  await assert.rejects(c.app.completion.finish(c.id),/Circuit/); await assertPending(c);
});

for (const decision of ['CONTINUE_CYCLE_NORMALLY','COUNT_AS_CURRENT_CYCLE_WORKOUT'] as const) {
  test(`mismatched workout persists explicit ${decision} and keeps or advances the expected item`, async t => {
    const c=await setup(t,1,'OK_RUECKEN'); const summary=await c.app.completion.load(c.id);
    assert.equal(summary.requiresDecision,true); assert.equal(summary.label,'OK Rücken'); assert.equal(summary.expectedLabel,'UK Hams');
    assert.equal(summary.countedNextLabel,'OK Brust');
    await assertPending(c,1);
    const result=await c.app.completion.finish(c.id,decision);
    assert.equal(result.position,decision==='CONTINUE_CYCLE_NORMALLY'?1:2);
    const session=await c.workouts.get(c.id); assert.equal(session.status,'COMPLETE');
    assert.equal(session.expected_cycle_position,1); assert.equal(session.expected_workout_type,'UK_HAMS');
    assert.equal(session.workout_type,'OK_RUECKEN'); assert.equal(session.cycle_override_decision,decision);
    assert.equal((await c.app.home.load()).active,null);
  });
}

test('missing override returns no repository writes and application rejects completion',async t=>{
  const c=await setup(t,1,'OK_RUECKEN');
  assert.equal((await c.workouts.finish(c.id)).outcome,'OVERRIDE_REQUIRED');
  await assert.rejects(c.app.completion.finish(c.id),/ausdrücklich/); await assertPending(c,1);
});

for (const position of [1,2] as const) {
  test(`invalid runtime override is rejected even at matching cycle position ${position}`,async t=>{
    const c=await setup(t,position);
    for (const invalid of ['',null,'DEFAULT',1]) await assert.rejects(c.app.completion.finish(c.id,invalid as ManualOverrideResult),/gültige/);
    await assertPending(c,position);
  });
}

test('a supplied valid choice on a matching workout is not stored as an override',async t=>{
  const c=await setup(t); await c.app.completion.finish(c.id,'CONTINUE_CYCLE_NORMALLY');
  assert.equal((await c.workouts.get(c.id)).cycle_override_decision,null); assert.equal((await c.cycle.get()).current_position,3);
});

for (const position of [3,6] as const) {
  test(`workout performed on Rest ${position} explicitly counts against that item only`,async t=>{
    const c=await setup(t,position,'OK_RUECKEN'); const summary=await c.app.completion.load(c.id);
    assert.equal(summary.expectedLabel,'Rest'); assert.equal(summary.requiresDecision,true);
    await assert.rejects(c.app.completion.finish(c.id),/ausdrücklich/);
    await c.app.completion.finish(c.id,'COUNT_AS_CURRENT_CYCLE_WORKOUT');
    assert.equal((await c.cycle.get()).current_position,position===6?1:4);
  });
}

test('concurrent completion requests consume the workout once, never advance twice',async t=>{
  const c=await setup(t); const results=await Promise.allSettled([c.app.completion.finish(c.id),c.app.completion.finish(c.id)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1); assert.equal(results.filter(r=>r.status==='rejected').length,1);
  const completed=await c.workouts.get(c.id); await assert.rejects(c.app.completion.finish(c.id),/nicht mehr aktiv/);
  assert.deepEqual(await c.workouts.get(c.id),completed); assert.equal((await c.cycle.get()).current_position,3);
});

test('injected cycle update failure rolls back status, timestamps and override decision; retry succeeds',async t=>{
  const c=await setup(t,1,'OK_RUECKEN'); const before=await c.workouts.get(c.id);
  c.sqlite.exec("CREATE TRIGGER fail_completion BEFORE UPDATE ON cycle_state BEGIN SELECT RAISE(ABORT,'injected SQL failure'); END;");
  await assert.rejects(c.app.completion.finish(c.id,'COUNT_AS_CURRENT_CYCLE_WORKOUT'),/injected SQL/);
  assert.deepEqual(await c.workouts.get(c.id),before); await assertPending(c,1);
  c.sqlite.exec('DROP TRIGGER fail_completion'); await c.app.completion.finish(c.id,'COUNT_AS_CURRENT_CYCLE_WORKOUT');
  assert.equal((await c.cycle.get()).current_position,2);
});

test('stale cycle is a safe feature error without any completion write or automatic repair',async t=>{
  const c=await setup(t); await c.cycle.save(4);
  await assert.rejects(c.app.completion.finish(c.id),error=>error instanceof FeatureError && /Cycle.*Workout-Start/.test(error.message));
  await assertPending(c,4);
});

test('inconsistent start snapshot type is rejected even when the global position matches',async t=>{
  const c=await setup(t); c.sqlite.prepare("UPDATE workout_sessions SET expected_workout_type='UK_HAMS' WHERE id=?").run(c.id);
  await assert.rejects(c.app.completion.finish(c.id),/Workout-Start/); await assertPending(c);
});

for (const status of ['PLANNED','INCOMPLETE'] as const) {
  test(`${status} workout cannot load an active summary or finish`,async t=>{
    const c=await setup(t); c.sqlite.prepare('UPDATE workout_sessions SET status=? WHERE id=?').run(status,c.id);
    await assert.rejects(c.app.completion.load(c.id),FeatureError); await assert.rejects(c.app.completion.finish(c.id),FeatureError);
    assert.equal((await c.cycle.get()).current_position,2);
  });
}

test('missing workout is a readable feature error',async t=>{
  const c=await setup(t);
  await assert.rejects(c.app.completion.load('absent'),/nicht gefunden/); await assert.rejects(c.app.completion.finish('absent'),FeatureError);
});

for (const complete of [false,true]) {
  test(`mismatched workout ended INCOMPLETE with all sections complete=${complete} never needs a choice or moves cycle`,async t=>{
    const c=await setup(t,1,'OK_RUECKEN'); if(!complete) await c.workouts.restart(c.id,'CIRCUIT');
    await c.app.workout.endIncomplete(c.id);
    assert.equal((await c.workouts.get(c.id)).status,'INCOMPLETE'); assert.equal((await c.cycle.get()).current_position,1);
    assert.equal((await c.workouts.get(c.id)).cycle_override_decision,null);
    for(const row of await c.workouts.strength(c.id)) assert.equal(calculateStrengthBenchmark(row.exercise_id,await c.workouts.performances(row.exercise_id)),3200);
  });
}

test('Rest completion after workout completion advances once without creating another workout',async t=>{
  const c=await setup(t); await c.app.completion.finish(c.id); await c.app.home.completeRest(3);
  assert.equal((await c.cycle.get()).current_position,4); assert.equal((await c.workouts.list()).length,1);
  await assert.rejects(c.app.home.completeRest(3)); assert.equal((await c.cycle.get()).current_position,4);
});

test('completed workout rejects every mutation path while retaining all historical snapshots',async t=>{
  const c=await setup(t); await c.app.completion.finish(c.id);
  const before=await c.workouts.completionSnapshot(c.id); const a=before.strength[0].exercise.id; const section=before.circuit!.section.id;
  for(const mutate of [
    ()=>c.workouts.saveSet(a,1,1,1,1), ()=>c.workouts.setStrengthComplete(a,false),
    ()=>c.workouts.selectPower(c.id,seed('Box Jump')), ()=>c.workouts.selectStrength(c.id,'A',seed('Bench Press')),
    ()=>c.workouts.savePowerProgress(c.id,0,'IN_PROGRESS'), ()=>c.workouts.saveCircuitProgress(c.id,1,1,'IN_PROGRESS'),
    ()=>c.workouts.restart(c.id,'POWER'), ()=>c.workouts.restart(c.id,'STRENGTH'), ()=>c.workouts.restart(c.id,'CIRCUIT'),
    ()=>c.app.training.restart(c.id,'POWER'), ()=>c.app.training.restart(c.id,'STRENGTH'), ()=>c.app.circuit.restart(c.id,section),
    ()=>c.workouts.saveCircuit(c.id,1,[{exerciseId:seed('Burpees'),role:'FOCUS'}]),
    ()=>c.app.circuit.saveEditor(c.id,section,{rounds:1,stations:[{exerciseId:seed('Burpees'),role:'FOCUS'}]}),
    ()=>c.workouts.finish(c.id), ()=>c.workouts.setStatus(c.id,'INCOMPLETE'),
  ]) await assert.rejects(mutate());
  assert.deepEqual(await c.workouts.completionSnapshot(c.id),before);
  await c.exercises.update(seed('Bench Press'),{name:'Edited later',load_mode:'EXTERNAL_ONLY',areas:['STRENGTH'],effects:['UPPER_PUSH']});
  await c.exercises.setActive(seed('Goblet Squat'),false);
  assert.deepEqual(await c.workouts.completionSnapshot(c.id),before);
});

test('summary reads and abandoning a choice never mutate workout or cycle',async t=>{
  const c=await setup(t,1,'OK_RUECKEN'); const before=await c.workouts.completionSnapshot(c.id);
  await c.app.completion.load(c.id); await c.app.home.load(); await c.app.workout.overview(c.id); await c.app.completion.load(c.id);
  assert.deepEqual(await c.workouts.completionSnapshot(c.id),before);
});

test('complete sections survive file-backed reopen before completion; decision remains available after another reopen',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'completion-')); t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const filename=join(directory,'workout.db'); let c=connect(filename);
  try {
    await initializeDatabase(c.db); const id=await c.workouts.create('OK_RUECKEN',80); await completeSections(c,id);
    const before=await c.workouts.completionSnapshot(id); c.sqlite.close(); c=connect(filename); await initializeDatabase(c.db);
    assert.deepEqual(await c.workouts.completionSnapshot(id),before); assert.equal((await app(c).completion.load(id)).ready,true);
    await app(c).completion.finish(id,'CONTINUE_CYCLE_NORMALLY'); c.sqlite.close(); c=connect(filename); await initializeDatabase(c.db);
    const session=await c.workouts.get(id); assert.equal(session.status,'COMPLETE'); assert.equal(session.cycle_override_decision,'CONTINUE_CYCLE_NORMALLY');
    assert.equal((await c.cycle.get()).current_position,1); assert.equal((await app(c).home.load()).active,null);
    const history=await c.workouts.completionSnapshot(id); assert.deepEqual(history.strength,before.strength); assert.deepEqual(history.circuit,before.circuit);
  } finally { c.sqlite.close(); }
});

test('migration 3 upgrades a populated v2 database without guessing past override decisions',async t=>{
  const c=connect();t.after(()=>c.sqlite.close());await migrateDatabase(c.db,migrations.slice(0,2));await seedDatabase(c.db);
  const id=await c.workouts.create('OK_RUECKEN'); await completeSections(c,id);
  c.sqlite.prepare("UPDATE workout_sessions SET status='COMPLETE',completed_at='2026-10-25T12:00:00.000Z' WHERE id=?").run(id);
  const before=await c.workouts.trainingSnapshot(id); const circuit=await c.workouts.circuit(id);
  await initializeDatabase(c.db); await initializeDatabase(c.db);
  assert.equal(c.sqlite.prepare('PRAGMA user_version').get()?.user_version,3);
  const after=await c.workouts.trainingSnapshot(id); assert.equal(after?.session.cycle_override_decision,null);
  const {cycle_override_decision: _decision,...session}=after!.session; assert.deepEqual(session,{...before!.session});
  assert.deepEqual(after?.strength,before?.strength); assert.deepEqual(await c.workouts.circuit(id),circuit);
});

test('failed migration 3 rolls back column and version and can be retried',async t=>{
  const c=connect();t.after(()=>c.sqlite.close());await migrateDatabase(c.db,migrations.slice(0,2));
  await assert.rejects(migrateDatabase(c.db,[...migrations.slice(0,2),{version:3,async up(db){await migrations[2].up(db);await db.execAsync('INVALID SQL');}}]));
  assert.equal(c.sqlite.prepare('PRAGMA user_version').get()?.user_version,2);
  assert.equal(c.sqlite.prepare('PRAGMA table_info(workout_sessions)').all().some(r=>r.name==='cycle_override_decision'),false);
  await initializeDatabase(c.db);assert.equal(c.sqlite.prepare('PRAGMA user_version').get()?.user_version,3);
});

test('SQLite rejects invalid or premature persisted decisions',async t=>{
  const c=await setup(t,1,'OK_RUECKEN');
  assert.throws(()=>c.sqlite.prepare("UPDATE workout_sessions SET cycle_override_decision='CONTINUE_CYCLE_NORMALLY' WHERE id=?").run(c.id));
  await c.app.completion.finish(c.id,'CONTINUE_CYCLE_NORMALLY');
  assert.throws(()=>c.sqlite.prepare("UPDATE workout_sessions SET cycle_override_decision='GUESS' WHERE id=?").run(c.id));
});

test('technical completion failures keep raw SQL out of user feedback',()=>{
  const original=console.error;console.error=()=>{};
  try { assert.doesNotMatch(userMessage(new Error('SQLITE constraint private_sql')),/SQLITE|private_sql/);
    assert.equal(userMessage(new FeatureError('Bitte neu laden.')),'Bitte neu laden.');
  } finally { console.error=original; }
});
