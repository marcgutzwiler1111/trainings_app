import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from './support/sqlite.ts';
import { completeSections } from './support/completion.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices, FeatureError, userMessage } from '../src/features/application/services.ts';
import { parseBodyweight, formatBodyweight, formatSettingDuration, stepRestDuration } from '../src/features/settings/services.ts';
import { resetRestTimer, extendRestTimer, skipRestTimer } from '../src/features/workout/restTimer.ts';
import { calculateE1RM, calculateRelativeE1RM, calculateRelativeStrength, calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';
import { seedExercises } from '../src/data/seed.ts';
import type { RestKind } from '../src/data/profileValidation.ts';

const app = (c: ReturnType<typeof connect>) => createApplicationServices(createRepositories(c.db,c.store.now));
const seed = (name: string) => seedExercises.find(e=>e.name===name)!.id;
async function setup(t: TestContext) {
  const c=connect();t.after(()=>c.sqlite.close());await initializeDatabase(c.db);return {...c,app:app(c)};
}
async function start(c: ReturnType<typeof connect>) {
  return app(c).workout.start({workoutType:'UK_HAMS',powerExerciseId:seed('Box Jump'),strengthA:seed('Bench Press'),strengthB:seed('Pull-Up'),rounds:1,stations:[{role:'FOCUS',exerciseId:seed('Goblet Squat')}]});
}

test('new profile has no invented bodyweight, an empty history and independent 150/120-second defaults',async t=>{
  const c=await setup(t);const profile=await c.app.settings.load();assert.equal(profile.current_bodyweight_kg,null);
  assert.equal(profile.power_rest_seconds,150);assert.equal(profile.strength_rest_seconds,120);assert.deepEqual(await c.app.settings.history(),[]);
});

for(const [text,value] of [['82',82],['82.5',82.5],['82,5',82.5],[' 82,75 ',82.75],['20',20],['400',400]] as const) {
  test(`bodyweight accepts decimal input ${JSON.stringify(text)} and persists a number`,async t=>{
    const c=await setup(t);assert.equal(parseBodyweight(text),value);await c.app.settings.updateBodyweight(text);
    assert.equal((await c.profile.get()).current_bodyweight_kg,value);assert.equal(typeof(await c.profile.get()).current_bodyweight_kg,'number');
    assert.equal((await c.app.settings.history())[0].bodyweight_kg,value);
  });
}

for(const text of ['', '   ', '0', '-10', '19.99', '400.01', 'NaN', 'Infinity', 'text', '82,5.5', '0x50', '1e2']) {
  test(`invalid bodyweight ${JSON.stringify(text)} leaves profile and history untouched`,async t=>{
    const c=await setup(t);const before=await c.profile.get();await assert.rejects(c.app.settings.updateBodyweight(text),FeatureError);
    assert.deepEqual(await c.profile.get(),before);assert.deepEqual(await c.bodyweight.list(),[]);
  });
}

test('repository separately rejects invalid numeric bodyweight including overflow',async t=>{
  const c=await setup(t);for(const value of [0,-10,19,401,NaN,Infinity])await assert.rejects(c.bodyweight.update(value),RangeError);
  assert.equal((await c.profile.get()).current_bodyweight_kg,null);assert.deepEqual(await c.bodyweight.list(),[]);
});

test('every actual change appends one immutable history row, newest first with a deterministic tie order',async t=>{
  const c=await setup(t);await c.app.settings.updateBodyweight('82.5');const first=(await c.app.settings.history())[0];
  await c.app.settings.updateBodyweight('80');let rows=await c.app.settings.history();assert.deepEqual(rows.map(row=>row.bodyweight_kg),[80,82.5]);assert.deepEqual(rows[1],first);
  assert.equal(rows[0].source,'PROFILE_UPDATE');assert.ok(Number.isFinite(Date.parse(rows[0].measured_at)));
  await c.bodyweight.update(81,'2026-10-27T12:00:00Z');await c.bodyweight.update(82,'2026-10-27T12:00:00Z');
  rows=await c.app.settings.history();assert.deepEqual(rows.map(row=>row.bodyweight_kg),[82,81,80,82.5]);
});

test('same numeric bodyweight is a complete no-op even when input formatting changes',async t=>{
  const c=await setup(t);assert.equal((await c.app.settings.updateBodyweight('82.5')).changed,true);
  const before=await c.profile.get();const history=await c.app.settings.history();assert.equal((await c.app.settings.updateBodyweight('82,500')).changed,false);
  assert.deepEqual(await c.profile.get(),before);assert.deepEqual(await c.app.settings.history(),history);
});

test('parallel repeated submissions across service instances create exactly one history row',async t=>{
  const c=await setup(t);const results=await Promise.all([c.app.settings.updateBodyweight('82.5'),app(c).settings.updateBodyweight('82,50'),c.bodyweight.update(82.5)]);
  assert.equal(results[0].changed,true);assert.equal(results[1].changed,false);assert.equal(results[2],null);assert.equal((await c.bodyweight.list()).length,1);
});

test('changing away from and back to an earlier value records both actual changes',async t=>{
  const c=await setup(t);await c.app.settings.updateBodyweight('82.5');await c.app.settings.updateBodyweight('80');await c.app.settings.updateBodyweight('82.5');
  assert.deepEqual((await c.app.settings.history()).map(row=>row.bodyweight_kg),[82.5,80,82.5]);
});

test('history insert failure rolls back the current profile and a retry creates one row',async t=>{
  const c=await setup(t);await c.app.settings.updateBodyweight('82.5');const before=await c.profile.get();const history=await c.bodyweight.list();
  c.sqlite.exec("CREATE TRIGGER reject_setting_weight BEFORE INSERT ON bodyweight_entries BEGIN SELECT RAISE(ABORT,'injected history failure'); END;");
  await assert.rejects(c.app.settings.updateBodyweight('80'),/injected/);assert.deepEqual(await c.profile.get(),before);assert.deepEqual(await c.bodyweight.list(),history);
  c.sqlite.exec('DROP TRIGGER reject_setting_weight');await c.app.settings.updateBodyweight('80');assert.equal((await c.bodyweight.list()).length,2);
});

for(const kind of ['POWER','STRENGTH'] as const) {
  for(const seconds of [30,600]) {
    test(`${kind} accepts the ${seconds}-second boundary without changing the other timer or weight`,async t=>{
      const c=await setup(t);await c.app.settings.updateBodyweight('82.5');const before=await c.profile.get();await c.app.settings.updateRestTimer(kind,seconds);
      const after=await c.profile.get();assert.equal(after[kind==='POWER'?'power_rest_seconds':'strength_rest_seconds'],seconds);
      assert.equal(after[kind==='POWER'?'strength_rest_seconds':'power_rest_seconds'],before[kind==='POWER'?'strength_rest_seconds':'power_rest_seconds']);
      assert.equal(after.current_bodyweight_kg,82.5);assert.equal((await c.bodyweight.list()).length,1);
    });
  }
  test(`${kind} rejects invalid durations before any write`,async t=>{
    const c=await setup(t);const before=await c.profile.get();for(const seconds of [0,-1,29,601,60.5,NaN,Infinity]) {
      await assert.rejects(c.app.settings.updateRestTimer(kind,seconds),FeatureError);await assert.rejects(c.profile.updateRestTimer(kind,seconds),RangeError);
    }
    assert.deepEqual(await c.profile.get(),before);
  });
}

test('unknown runtime timer kinds cannot choose an arbitrary profile field',async t=>{
  const c=await setup(t);const before=await c.profile.get();await assert.rejects(c.app.settings.updateRestTimer('CIRCUIT' as RestKind,60),FeatureError);
  await assert.rejects(c.profile.updateRestTimer('bodyweight' as RestKind,60),RangeError);assert.deepEqual(await c.profile.get(),before);
});

test('concurrent Power Strength and bodyweight updates preserve all values without stale-profile overwrites',async t=>{
  const c=await setup(t);await Promise.all([c.app.settings.updateRestTimer('POWER',180),app(c).settings.updateRestTimer('STRENGTH',90),c.app.settings.updateBodyweight('82.75')]);
  const profile=await c.profile.get();assert.equal(profile.power_rest_seconds,180);assert.equal(profile.strength_rest_seconds,90);assert.equal(profile.current_bodyweight_kg,82.75);
  assert.equal((await c.bodyweight.list()).length,1);
});

test('an independent timer failure rolls back itself without swallowing a queued update to the other timer',async t=>{
  const c=await setup(t);c.sqlite.exec("CREATE TRIGGER reject_power_setting BEFORE UPDATE OF power_rest_seconds ON profile BEGIN SELECT RAISE(ABORT,'injected Power setting failure'); END;");
  const results=await Promise.allSettled([c.app.settings.updateRestTimer('POWER',180),c.app.settings.updateRestTimer('STRENGTH',90)]);
  assert.deepEqual(results.map(result=>result.status),['rejected','fulfilled']);const profile=await c.profile.get();assert.equal(profile.power_rest_seconds,150);assert.equal(profile.strength_rest_seconds,90);
});

test('unchanged rest setting leaves profile timestamps untouched',async t=>{
  const c=await setup(t);const before=await c.profile.get();await c.app.settings.updateRestTimer('POWER',150);assert.deepEqual(await c.profile.get(),before);
});

test('bodyweight profile history and both timers survive real file-backed close/reopen and initialization',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'settings-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'app.db');let c=connect(filename);
  try {
    await initializeDatabase(c.db);await app(c).settings.updateBodyweight('82,5');await app(c).settings.updateBodyweight('82.75');
    await Promise.all([app(c).settings.updateRestTimer('POWER',180),app(c).settings.updateRestTimer('STRENGTH',150)]);
    const before=await c.profile.get();const history=await app(c).settings.history();c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);
    assert.deepEqual(await c.profile.get(),before);assert.deepEqual(await app(c).settings.history(),history);assert.equal((await app(c).settings.updateBodyweight('82,75')).changed,false);
    assert.equal((await c.bodyweight.list()).length,2);
  } finally {c.sqlite.close();}
});

for(const kind of ['POWER','STRENGTH'] as const) {
  test(`${kind} runtime loads its configured start duration for real persisted training`,async t=>{
    const c=await setup(t);await c.app.settings.updateRestTimer('POWER',180);await c.app.settings.updateRestTimer('STRENGTH',150);const id=await start(c);
    let seconds:number;
    if(kind==='POWER') {const state=await c.app.training.power(id);await c.app.training.completePowerSet(id,0);seconds=state.restSeconds;}
    else {for(let i=0;i<4;i++)await c.app.training.completePowerSet(id,i);await c.app.training.completePower(id);const state=await c.app.training.strength(id);
      await c.app.training.saveSet(id,state.rows[0].exercise.id,1,{weight:'100',reps:'8',rir:'2'});seconds=state.restSeconds;}
    assert.equal(resetRestTimer(seconds).remaining,kind==='POWER'?180:150);
  });
}

test('a refocused training load sees updated defaults during an active workout, without changing saved progress',async t=>{
  const c=await setup(t);const id=await start(c);await c.app.training.completePowerSet(id,0);const before=await c.workouts.trainingSnapshot(id);
  await c.app.settings.updateRestTimer('POWER',210);assert.equal((await c.app.training.power(id)).restSeconds,210);assert.deepEqual(await c.workouts.trainingSnapshot(id),before);
});

test('runtime +30 and Skip change only the transient timer, not either saved setting',async t=>{
  const c=await setup(t);const profile=await c.profile.get();const timer=extendRestTimer(resetRestTimer(profile.strength_rest_seconds));assert.equal(timer.remaining,150);
  assert.equal(skipRestTimer().remaining,0);assert.deepEqual(await c.profile.get(),profile);assert.deepEqual(await c.bodyweight.list(),[]);
});

for(const status of ['IN_PROGRESS','COMPLETE','INCOMPLETE'] as const) {
  test(`${status} workout bodyweight and relative metrics remain based on the start snapshot after profile changes`,async t=>{
    const c=await setup(t);await c.app.settings.updateBodyweight('82.5');const id=await start(c);await completeSections(c,id);
    if(status==='COMPLETE')await c.app.completion.finish(id);if(status==='INCOMPLETE')await c.app.workout.endIncomplete(id);
    const before=await c.workouts.completionSnapshot(id);const e1rm=calculateE1RM(100,8,2);
    const relative=calculateRelativeE1RM(e1rm,before.session.bodyweight_snapshot_kg!);
    const strength=calculateRelativeStrength({mode:'EXTERNAL_ONLY',externalLoad:100},before.session.bodyweight_snapshot_kg!);
    await c.app.settings.updateBodyweight('80');await c.app.settings.updateRestTimer('POWER',180);
    const after=await c.workouts.completionSnapshot(id);assert.deepEqual(after,before);assert.equal(after.session.bodyweight_snapshot_kg,82.5);
    assert.equal(calculateRelativeE1RM(e1rm,after.session.bodyweight_snapshot_kg!),relative);assert.equal(calculateRelativeStrength({mode:'EXTERNAL_ONLY',externalLoad:100},after.session.bodyweight_snapshot_kg!),strength);
    assert.equal(calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press'))),3200);
  });
}

test('a later workout captures the new profile weight while older snapshots remain unchanged',async t=>{
  const c=await setup(t);await c.app.settings.updateBodyweight('82.5');const old=await start(c);await c.app.workout.endIncomplete(old);
  await c.app.settings.updateBodyweight('80');const next=await start(c);assert.equal((await c.workouts.get(old)).bodyweight_snapshot_kg,82.5);assert.equal((await c.workouts.get(next)).bodyweight_snapshot_kg,80);
});

test('setting the initial profile weight never backfills a workout started without a bodyweight snapshot',async t=>{
  const c=await setup(t);const id=await start(c);await c.app.settings.updateBodyweight('82.5');
  assert.equal((await c.workouts.get(id)).bodyweight_snapshot_kg,null);assert.equal((await c.profile.get()).current_bodyweight_kg,82.5);
});

test('existing Circuit Benchmark bodyweight load snapshots remain unchanged without introducing benchmark UI',async t=>{
  const c=await setup(t);await c.app.settings.updateBodyweight('82.5');const id=await c.benchmarks.createCircuit({bodyweight_kg_snapshot:82.5,goblet_squat_load_kg:20,kettlebell_swing_load_kg:24,pullup_added_load_kg:10});
  const before=await c.benchmarks.circuit(id);await c.app.settings.updateBodyweight('80');assert.deepEqual(await c.benchmarks.circuit(id),before);
});

test('settings preserve normal Circuit duration and completion followed by exactly one cycle step and independent Rest completion',async t=>{
  const c=await setup(t);await c.cycle.save(2);await c.app.settings.updateBodyweight('82.5');const id=await start(c);await completeSections(c,id);
  const planned=await c.app.circuit.restart(id);let circuit=await c.app.circuit.start(id,planned.section.id);assert.equal(circuit.stationSeconds,60);
  await c.app.settings.updateRestTimer('POWER',180);assert.deepEqual(await c.app.circuit.load(id),circuit);circuit=await c.app.circuit.advance(id,circuit.cursor!);assert.equal(circuit.complete,true);
  assert.equal((await c.workouts.get(id)).status,'IN_PROGRESS');await c.app.completion.finish(id,'COUNT_AS_CURRENT_CYCLE_WORKOUT');assert.equal((await c.cycle.get()).current_position,3);
  await c.app.home.completeRest(3);assert.equal((await c.cycle.get()).current_position,4);
});

test('settings updates and reads do not change Exercise Library custom edits status or thumbnails',async t=>{
  const c=await setup(t);const id=await c.app.exercises.createCommand().submit({name:'Custom',areas:['POWER','CIRCUIT'],effects:['CORE'],thumbnailUri:'file:///app/kept.png',active:true});
  await c.app.exercises.setActive(id,false);const before=await c.app.exercises.library();await c.app.settings.updateBodyweight('82.5');await c.app.settings.updateRestTimer('STRENGTH',90);
  await c.app.settings.load();await c.app.settings.history();assert.deepEqual(await c.app.exercises.library(),before);
});

test('Settings displays bodyweight and M:SS without unnecessary zeros',()=>{
  assert.equal(formatBodyweight(82),'82 kg');assert.equal(formatBodyweight(82.5),'82.5 kg');assert.equal(formatBodyweight(82.75),'82.75 kg');
  assert.deepEqual([30,90,120,150,600].map(formatSettingDuration),['0:30','1:30','2:00','2:30','10:00']);
});

test('30-second duration controls clamp at boundaries and preserve existing nonmultiple values until explicitly changed',()=>{
  assert.equal(stepRestDuration(30,-1),30);assert.equal(stepRestDuration(600,1),600);assert.equal(stepRestDuration(150,1),180);
  assert.equal(stepRestDuration(120,-1),90);assert.equal(stepRestDuration(45,-1),30);assert.equal(stepRestDuration(75,1),105);
});

test('profile read failure follows generic feedback and succeeds on retry without invented defaults',async t=>{
  const c=await setup(t);const original=c.db.getFirstAsync;let fail=true;
  c.db.getFirstAsync=async(sql,...params)=>{if(fail&&sql==='SELECT * FROM profile')throw new Error('SQLITE private detail');return original(sql,...params);};
  const log=console.error;console.error=()=>{};try {await assert.rejects(c.app.settings.load(),error=>!userMessage(error).includes('SQLITE'));fail=false;assert.equal((await c.app.settings.load()).current_bodyweight_kg,null);}finally{console.error=log;}
});
