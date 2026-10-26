import { completeSections } from './support/completion.ts';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { connect } from './support/sqlite.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices, FeatureError } from '../src/features/application/services.ts';
import { seedExercises } from '../src/data/seed.ts';
import { nextCircuitPosition, validateCircuitPosition } from '../src/domain/circuit/progression.ts';
import { resetCircuitTimer, resumeCircuitTimer, startCircuitTimer, pauseCircuitTimer, tickCircuitTimer, finishCircuitTimer } from '../src/features/workout/circuitTimer.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';

const seed = (name: string) => seedExercises.find(e => e.name === name)!.id;
function app(c: ReturnType<typeof connect>) { return createApplicationServices(createRepositories(c.db, c.store.now)); }
async function create(c: ReturnType<typeof connect>, rounds = 2, count = 3) {
  return app(c).workout.start({ workoutType: 'UK_HAMS', powerExerciseId: seed('Box Jump'), strengthA: seed('Bench Press'), strengthB: seed('Pull-Up'), rounds,
    stations: Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'CONDITIONING' : 'FOCUS', exerciseId: seed(i % 2 ? 'Burpees' : 'Goblet Squat') })) });
}
async function ready(c: ReturnType<typeof connect>, id: string) {
  const s = app(c); for (let i=0;i<4;i++) await s.training.completePowerSet(id,i); await s.training.completePower(id);
  for (const exercise of await c.workouts.strength(id)) {
    for (let set=1;set<=4;set++) await s.training.saveSet(id,exercise.id,set,{ weight:'100', reps:'8', rir:'2' });
    await s.training.completeExercise(id,exercise.id);
  }
}
async function setup(t: TestContext, rounds=2, count=3) {
  const c=connect(); t.after(()=>c.sqlite.close()); await initializeDatabase(c.db);
  const id=await create(c,rounds,count); await ready(c,id); return { ...c,id,app:app(c) };
}
async function start(c: Awaited<ReturnType<typeof setup>>) {
  const preview=await c.app.circuit.load(c.id); return c.app.circuit.start(c.id,preview.section.id);
}

test('Circuit first start persists 1/1 and never reconstructs the previously captured exercise snapshot',async t=>{
  const c=await setup(t); const exercise=await c.exercises.get(seed('Goblet Squat'));
  await c.exercises.update(exercise.id,{...exercise,name:'Changed in library',thumbnail_uri:'local://changed'});
  const state=await start(c);
  assert.equal(state.section.status,'IN_PROGRESS'); assert.deepEqual(state.cursor,{sectionId:state.section.id,round:1,station:1});
  assert.equal(state.current?.exercise_name_snapshot,'Goblet Squat'); assert.equal(state.current?.thumbnail_uri_snapshot,null);
  assert.equal(state.stationSeconds,60); assert.ok(state.section.started_at);
  assert.equal((await c.workouts.get(c.id)).status,'IN_PROGRESS'); assert.equal((await c.cycle.get()).current_position,1);
});

test('Circuit cannot start or advance before Power and both Strength exercises complete',async t=>{
  const c=connect(); t.after(()=>c.sqlite.close()); await initializeDatabase(c.db); const id=await create(c);
  const section=(await c.workouts.circuit(id))!.section;
  await assert.rejects(app(c).circuit.start(id,section.id),/Power/);
  for(let i=0;i<4;i++)await app(c).training.completePowerSet(id,i); await app(c).training.completePower(id);
  const a=(await c.workouts.strength(id))[0];
  for(let set=1;set<=4;set++)await app(c).training.saveSet(id,a.id,set,{weight:'80',reps:'8',rir:'2'});
  await app(c).training.completeExercise(id,a.id);
  await assert.rejects(app(c).circuit.start(id,section.id),/Strength/);
  await assert.rejects(app(c).circuit.advance(id,{sectionId:section.id,round:1,station:1}),FeatureError);
  assert.equal((await c.workouts.circuit(id))?.section.status,'PLANNED');
});

for (const status of ['PLANNED','COMPLETE','INCOMPLETE'] as const) {
  test(`Circuit commands cannot mutate a ${status} workout`,async t=>{
    const c=await setup(t); const section=(await c.workouts.circuit(c.id))!.section.id;
    if(status==='COMPLETE') { await completeSections(c, c.id); await c.workouts.finish(c.id); }
    else if(status==='INCOMPLETE')await c.app.workout.endIncomplete(c.id);
    else c.sqlite.prepare("UPDATE workout_sessions SET status='PLANNED' WHERE id=?").run(c.id);
    const before=await c.workouts.circuit(c.id);
    await assert.rejects(c.app.circuit.start(c.id,section),FeatureError);
    await assert.rejects(c.app.circuit.advance(c.id,{sectionId:section,round:1,station:1}),FeatureError);
    await assert.rejects(c.app.circuit.restart(c.id,section),FeatureError);
    await assert.rejects(c.app.circuit.saveEditor(c.id,section,{rounds:1,stations:[{role:'FOCUS',exerciseId:seed('Goblet Squat')}]}),FeatureError);
    assert.deepEqual(await c.workouts.circuit(c.id),before);
  });
}

test('two simultaneous starts are idempotent and a subsequent start never resets progress',async t=>{
  const c=await setup(t); const section=(await c.app.circuit.load(c.id)).section.id;
  const [a,b]=await Promise.all([c.app.circuit.start(c.id,section),c.app.circuit.start(c.id,section)]);
  assert.deepEqual(a.cursor,b.cursor);
  const progressed=await c.app.circuit.advance(c.id,a.cursor!);
  assert.deepEqual((await c.app.circuit.start(c.id,section)).cursor,progressed.cursor);
});

test('saved configuration is locked after start through both editor and low-level selection API',async t=>{
  const c=await setup(t); const state=await start(c);
  await assert.rejects(c.app.circuit.editor(c.id),/neu starten/);
  await assert.rejects(c.workouts.saveCircuit(c.id,1,[{role:'FOCUS',exerciseId:seed('Burpees')}]),/Restart/);
  await assert.rejects(c.app.circuit.saveEditor(c.id,state.section.id,{rounds:1,stations:[{role:'FOCUS',exerciseId:seed('Burpees')}]}),/gesperrt/);
  assert.equal((await c.workouts.circuit(c.id))?.stations.length,3);
});

test('2 rounds × 3 stations follows the exact linear sequence and never wraps after the last station',async t=>{
  const c=await setup(t); let state=await start(c); const positions=[];
  for(let i=0;i<6;i++) { positions.push([state.cursor!.round,state.cursor!.station]); state=await c.app.circuit.advance(c.id,state.cursor!); }
  assert.deepEqual(positions,[[1,1],[1,2],[1,3],[2,1],[2,2],[2,3]]);
  assert.equal(state.complete,true); assert.equal(state.next,null); assert.equal(state.section.current_round,2); assert.equal(state.section.current_station_position,3);
  assert.ok(state.section.completed_at); assert.equal((await c.workouts.get(c.id)).status,'IN_PROGRESS');
  assert.equal((await c.cycle.get()).current_position,1);
  await assert.rejects(c.app.circuit.advance(c.id,state.cursor!),/abgeschlossen/);
  await assert.rejects(c.app.circuit.start(c.id,state.section.id),/abgeschlossen/);
});

for(const [rounds,stations] of [[1,1],[2,3],[5,6]]) {
  test(`runtime completes variable snapshot ${rounds} rounds × ${stations} stations`,async t=>{
    const c=await setup(t,rounds,stations); let state=await start(c);
    for(let n=0;n<rounds*stations;n++)state=await c.app.circuit.advance(c.id,state.cursor!);
    assert.equal(state.section.status,'COMPLETE'); assert.equal(state.totalStations,rounds*stations);
    assert.equal(state.durationSeconds,rounds*stations*60); assert.equal(state.next,null);
  });
}

test('Current/Next cross a round boundary and the final station has no next exercise',async t=>{
  const c=await setup(t); let state=await start(c);
  assert.equal(state.next?.position.station,2); assert.equal(state.next?.station.exercise_name_snapshot,'Burpees');
  state=await c.app.circuit.advance(c.id,state.cursor!); state=await c.app.circuit.advance(c.id,state.cursor!);
  assert.deepEqual(state.next?.position,{round:2,station:1});
  for(let n=0;n<3;n++)state=await c.app.circuit.advance(c.id,state.cursor!);
  assert.deepEqual([state.cursor?.round,state.cursor?.station],[2,3]); assert.equal(state.next,null);
});

test('timer-expiry and manual-next requests with the same cursor advance exactly once',async t=>{
  const c=await setup(t); const state=await start(c);
  const outcomes=await Promise.allSettled([c.app.circuit.advance(c.id,state.cursor!),c.app.circuit.advance(c.id,state.cursor!)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const current=await c.app.circuit.load(c.id); assert.deepEqual([current.cursor!.round,current.cursor!.station],[1,2]);
});

test('a failed station transition rolls back position and can be explicitly retried',async t=>{
  const c=await setup(t); const state=await start(c);
  c.sqlite.exec("CREATE TRIGGER fail_advance BEFORE UPDATE ON workout_circuit_sections WHEN NEW.current_station_position=2 BEGIN SELECT RAISE(ABORT,'injected transition failure'); END;");
  await assert.rejects(c.app.circuit.advance(c.id,state.cursor!),/injected transition failure/);
  assert.deepEqual((await c.app.circuit.load(c.id)).cursor,state.cursor);
  c.sqlite.exec('DROP TRIGGER fail_advance');
  assert.equal((await c.app.circuit.advance(c.id,state.cursor!)).cursor?.station,2);
});

test('failed final completion remains at the final running station until retry',async t=>{
  const c=await setup(t,1,1); const state=await start(c);
  c.sqlite.exec("CREATE TRIGGER fail_completion BEFORE UPDATE ON workout_circuit_sections WHEN NEW.status='COMPLETE' BEGIN SELECT RAISE(ABORT,'injected completion failure'); END;");
  await assert.rejects(c.app.circuit.advance(c.id,state.cursor!),/injected completion failure/);
  const after=await c.app.circuit.load(c.id); assert.equal(after.complete,false); assert.equal(after.section.completed_at,null);
  c.sqlite.exec('DROP TRIGGER fail_completion'); assert.equal((await c.app.circuit.advance(c.id,state.cursor!)).complete,true);
});

test('restart at R3/S2 resets only Circuit and makes it editable without changing captured exercise snapshots',async t=>{
  const c=await setup(t,3,3); let state=await start(c);
  for(let n=0;n<7;n++)state=await c.app.circuit.advance(c.id,state.cursor!);
  assert.deepEqual([state.cursor!.round,state.cursor!.station],[3,2]);
  const training=await c.workouts.trainingSnapshot(c.id); const cycle=await c.cycle.get();
  const exercise=await c.exercises.get(seed('Goblet Squat')); await c.exercises.update(exercise.id,{...exercise,name:'Library rename'});
  const reset=await c.app.circuit.restart(c.id,state.section.id);
  assert.notEqual(reset.section.id,state.section.id); assert.equal(reset.section.status,'PLANNED');
  assert.equal(reset.section.current_round,null); assert.equal(reset.section.current_station_position,null); assert.equal(reset.section.started_at,null);
  assert.equal(reset.stations[0].exercise_name_snapshot,'Goblet Squat');
  assert.deepEqual(await c.workouts.trainingSnapshot(c.id),training); assert.deepEqual(await c.cycle.get(),cycle);
  assert.equal((await c.app.circuit.editor(c.id)).draft.rounds,3);
});

test('a stale expiry from a previous run cannot advance the replacement run at identical 1/1 coordinates',async t=>{
  const c=await setup(t); const old=await start(c);
  const reset=await c.app.circuit.restart(c.id,old.section.id); const current=await c.app.circuit.start(c.id,reset.section.id);
  await assert.rejects(c.app.circuit.advance(c.id,old.cursor!),/geändert/);
  assert.deepEqual((await c.app.circuit.load(c.id)).cursor,current.cursor);
});

test('restart failure restores the original section and station snapshots transactionally',async t=>{
  const c=await setup(t); const state=await start(c);
  c.sqlite.exec("CREATE TRIGGER fail_restart BEFORE INSERT ON workout_circuit_sections BEGIN SELECT RAISE(ABORT,'injected restart failure'); END;");
  await assert.rejects(c.app.circuit.restart(c.id,state.section.id),/injected restart failure/);
  assert.deepEqual(await c.app.circuit.load(c.id),state);
});

test('confirmed restart also works if Power was subsequently restarted, preserving its current state',async t=>{
  const c=await setup(t); const state=await start(c); await c.app.training.restart(c.id,'POWER');
  const before=await c.workouts.trainingSnapshot(c.id); await c.app.circuit.restart(c.id,state.section.id);
  assert.deepEqual(await c.workouts.trainingSnapshot(c.id),before);
  assert.equal((await c.app.circuit.editor(c.id)).draft.stations.length,3);
});

test('Circuit editor reuses configuration rules, saves new order/roles/rounds and never touches Power or Strength',async t=>{
  const c=await setup(t); const state=await start(c); await c.app.circuit.restart(c.id,state.section.id);
  const editor=await c.app.circuit.editor(c.id); const before=await c.workouts.trainingSnapshot(c.id);
  await c.app.circuit.saveEditor(c.id,editor.sectionId,{rounds:1,stations:[{role:'CORE',exerciseId:seed('Hanging Leg Raise')},{role:'CONDITIONING',exerciseId:seed('Burpees')}]});
  const saved=await c.app.circuit.load(c.id);
  assert.equal(saved.section.round_count,1); assert.deepEqual(saved.stations.map(s=>s.role),['CORE','CONDITIONING']);
  assert.deepEqual(saved.stations.map(s=>s.position),[1,2]); assert.equal(saved.section.status,'PLANNED');
  assert.deepEqual(await c.workouts.trainingSnapshot(c.id),before);
  await assert.rejects(c.app.circuit.start(c.id,editor.sectionId),/geändert/);
});

test('invalid/now-inactive editor selections are reported without replacing the saved configuration',async t=>{
  const c=await setup(t); const editor=await c.app.circuit.editor(c.id); const before=await c.workouts.circuit(c.id);
  await c.exercises.setActive(seed('Goblet Squat'),false);
  assert.equal((await c.app.circuit.editor(c.id)).draft.stations[0].exerciseId,null);
  await assert.rejects(c.app.circuit.saveEditor(c.id,editor.sectionId,editor.draft),FeatureError);
  assert.deepEqual(await c.workouts.circuit(c.id),before);
});

test('an INCOMPLETE workout retains Circuit progress and Strength eligibility, then all Circuit writes are refused',async t=>{
  const c=await setup(t); let state=await start(c);
  for(let n=0;n<4;n++)state=await c.app.circuit.advance(c.id,state.cursor!);
  await c.app.workout.endIncomplete(c.id); const before=await c.workouts.circuit(c.id);
  assert.equal(before?.section.current_round,2); assert.equal(before?.section.current_station_position,2);
  assert.equal((await c.cycle.get()).current_position,1);
  assert.equal(calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press'))),3200);
  await assert.rejects(c.app.circuit.advance(c.id,state.cursor!),FeatureError); await assert.rejects(c.app.circuit.restart(c.id,state.section.id),FeatureError);
  assert.deepEqual(await c.workouts.circuit(c.id),before);
});

for(const corruption of ['empty','gap','position','null-position'] as const) {
  test(`corrupt stored Circuit ${corruption} is rejected with a safe feature error`,async t=>{
    const c=await setup(t); await start(c);
    if(corruption==='empty')c.sqlite.exec('DELETE FROM workout_circuit_stations');
    if(corruption==='gap')c.sqlite.exec('DELETE FROM workout_circuit_stations WHERE position=1');
    if(corruption==='position')c.sqlite.exec('UPDATE workout_circuit_sections SET current_station_position=99');
    if(corruption==='null-position')c.sqlite.exec('UPDATE workout_circuit_sections SET current_station_position=NULL');
    await assert.rejects(c.app.circuit.load(c.id),/ungültig/);
  });
}

test('missing Circuit/workout are handled explicitly instead of throwing raw SQL messages',async t=>{
  const c=await setup(t); await assert.rejects(c.app.circuit.load('missing'),/nicht gefunden/);
  c.sqlite.exec('DELETE FROM workout_circuit_sections'); await assert.rejects(c.app.circuit.load(c.id),/Snapshot fehlt/);
});

test('file-backed reopen restores R3/S4 paused, with full station duration ready for explicit resume',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'circuit-resume-')); const file=join(dir,'app.db'); let c=connect(file);
  t.after(()=>{c.sqlite.close();rmSync(dir,{recursive:true});});
  await initializeDatabase(c.db); const id=await create(c,5,6); await ready(c,id); let service=app(c);
  let state=await service.circuit.start(id,(await service.circuit.load(id)).section.id);
  for(let n=0;n<15;n++)state=await service.circuit.advance(id,state.cursor!);
  const before=state; c.sqlite.close(); c=connect(file); await initializeDatabase(c.db); service=app(c);
  state=await service.circuit.load(id);
  assert.deepEqual(state,before); assert.deepEqual([state.cursor!.round,state.cursor!.station],[3,4]);
  assert.equal(state.initiallyPaused,true); assert.equal(resetCircuitTimer(state.stationSeconds).phase,'paused');
  assert.equal(resumeCircuitTimer(resetCircuitTimer(state.stationSeconds)).remaining,60);
  assert.equal((await c.workouts.get(id)).status,'IN_PROGRESS'); assert.equal((await c.cycle.get()).current_position,1);
});

for(const [rounds,stations] of [[1,1],[2,3],[5,6]]) {
  test(`pure progression visits ${rounds*stations} positions for ${rounds}×${stations} then terminates`,()=>{
    let position: {round:number;station:number}|null={round:1,station:1}; const visited=[];
    while(position){visited.push(position);position=nextCircuitPosition(rounds,stations,position);}
    assert.equal(visited.length,rounds*stations); assert.deepEqual(visited.at(-1),{round:rounds,station:stations});
  });
}

test('invalid pure positions and layout counts are rejected',()=>{
  for(const position of [{round:0,station:1},{round:3,station:1},{round:1,station:4},{round:1,station:NaN}])assert.throws(()=>validateCircuitPosition(2,3,position),RangeError);
  assert.throws(()=>nextCircuitPosition(0,3,{round:1,station:1}),RangeError);
});

test('station timer starts at 60 and a tick reduces it by one without any persistence',()=>{
  assert.deepEqual(startCircuitTimer(60),{duration:60,remaining:60,phase:'running'});
  assert.equal(tickCircuitTimer(startCircuitTimer(60)).remaining,59);
});

test('manual pause preserves seconds and blocks ticks; resume continues the same station time',()=>{
  const paused=pauseCircuitTimer(tickCircuitTimer(startCircuitTimer(60),26));
  assert.equal(paused.remaining,34); assert.equal(paused.phase,'paused'); assert.deepEqual(tickCircuitTimer(paused,100),paused);
  assert.equal(resumeCircuitTimer(paused).remaining,34); assert.equal(tickCircuitTimer(resumeCircuitTimer(paused)).remaining,33);
});

test('timer expiry signals exactly one station end and cannot become negative or loop by further ticking',()=>{
  const expired=tickCircuitTimer(startCircuitTimer(60),500);
  assert.equal(expired.remaining,0); assert.equal(expired.phase,'expired'); assert.deepEqual(tickCircuitTimer(expired,500),expired);
  assert.equal(finishCircuitTimer(expired).phase,'complete'); assert.equal(resetCircuitTimer(60).remaining,60);
});

test('reset after leaving a screen discards partial time and remains paused until an explicit resume',()=>{
  const old=tickCircuitTimer(startCircuitTimer(60),29); assert.equal(old.remaining,31);
  const reopened=resetCircuitTimer(old.duration); assert.equal(reopened.remaining,60); assert.equal(reopened.phase,'paused');
  assert.equal(tickCircuitTimer(reopened,10000).remaining,60);
  assert.equal(resumeCircuitTimer(reopened).phase,'running');
});
