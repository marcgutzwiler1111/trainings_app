import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from './support/sqlite.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices,FeatureError,userMessage } from '../src/features/application/services.ts';
import { seedExercises } from '../src/data/seed.ts';
import { powerProtocol,bestPowerAttempt,circuitBenchmarkCursor,powerConditions } from '../src/domain/benchmarks/protocol.ts';
import { benchmarkSchedule } from '../src/domain/benchmarks/due.ts';
import { repetitions,decimal } from '../src/features/benchmarks/services.ts';
import { startCircuitTimer,pauseCircuitTimer,resumeCircuitTimer,tickCircuitTimer,resetCircuitTimer } from '../src/features/workout/circuitTimer.ts';
import { completeSections } from './support/completion.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';

const DAY=86400000;const NOW=Date.parse('2026-10-26T12:00:00Z');
const app=(c:ReturnType<typeof connect>,now=NOW)=>createApplicationServices(createRepositories(c.db,c.store.now),()=>now);
async function setup(t:TestContext){const c=connect();t.after(()=>c.sqlite.close());await initializeDatabase(c.db);return {...c,app:app(c)};}
const powerDraft={rotation:'4',chest:'5',shotPut:'3'};
const circuitDraft={bodyweight:'80',goblet:'20',swing:'24',pullup:'10'};
const seed=(name:string)=>seedExercises.find(e=>e.name===name)!.id;
const normalDraft={workoutType:'UK_HAMS' as const,powerExerciseId:seed('Box Jump'),strengthA:seed('Bench Press'),strengthB:seed('Pull-Up'),rounds:1,stations:[{role:'FOCUS' as const,exerciseId:seed('Goblet Squat')}]};
async function fillPower(c:ReturnType<typeof connect>,id:string,value=200){const service=app(c).benchmarks;for(const group of (await service.power(id)).groups)for(let n=1;n<=3;n++)await service.saveAttempt(id,group.test!.id,n,String(value+n));}
async function fillCircuit(c:ReturnType<typeof connect>,id:string,reps='10'){const service=app(c).benchmarks;let data=await service.circuit(id);while(data.cursor)data=await service.advanceCircuit(id,data.cursor,reps);return data;}

test('Power start atomically captures three distinct ball weights and exactly six groups in fixed test order',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower({rotation:'4,5',chest:'5',shotPut:'3'});const data=await c.app.benchmarks.power(id);
 assert.equal(data.session.status,'IN_PROGRESS');assert.equal(data.groups.length,6);assert.deepEqual(data.groups.map(g=>g.testIndex),[0,1,1,2,3,3]);
 assert.deepEqual(data.groups.map(g=>g.test?.medicine_ball_weight_kg),[null,4.5,4.5,5,3,3]);assert.ok(data.tests.every(test=>test.unit==='cm'));assert.equal(data.currentTest,0);assert.equal(data.ready,false);
 assert.equal((await c.cycle.get()).current_position,1);assert.equal((await c.workouts.list()).length,0);
});

for(const field of ['rotation','chest','shotPut'] as const)for(const bad of ['', '0','-1','NaN','Infinity']){
 test(`Power setup rejects ${field}=${JSON.stringify(bad)} without a partial session`,async t=>{
  const c=await setup(t);await assert.rejects(c.app.benchmarks.startPower({...powerDraft,[field]:bad}),FeatureError);assert.equal((await c.benchmarks.history('power')).length,0);
 });
}

test('late Power setup failure rolls back session and previously inserted conditions',async t=>{
 const c=await setup(t);c.sqlite.exec("CREATE TRIGGER fail_power_setup BEFORE INSERT ON power_benchmark_tests WHEN NEW.test_type='SHOT_PUT_THROW' BEGIN SELECT RAISE(ABORT,'injected setup failure'); END;");
 await assert.rejects(c.app.benchmarks.startPower(powerDraft),/injected/);assert.equal((await c.benchmarks.history('power')).length,0);assert.equal(c.sqlite.prepare('SELECT count(*) AS n FROM power_benchmark_tests').get()?.n,0);
});

test('fixed Power ordering blocks future tests while previous tests remain correctable',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower(powerDraft);let data=await c.app.benchmarks.power(id);const chest=data.groups[3].test!.id;
 await assert.rejects(c.app.benchmarks.saveAttempt(id,chest,1,'300'),/zuerst/);const broad=data.groups[0].test!.id;
 for(let n=1;n<=3;n++)await c.app.benchmarks.saveAttempt(id,broad,n,String(200+n));data=await c.app.benchmarks.power(id);assert.equal(data.currentTest,1);
 await c.app.benchmarks.saveAttempt(id,broad,2,'250');assert.equal((await c.app.benchmarks.power(id)).groups[0].best,250);
});

test('Power attempt correction preserves ID number timestamp and side separation, with derived best results',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower(powerDraft);await fillPower(c,id);let data=await c.app.benchmarks.power(id);const left=data.groups[1].test!.id;const right=data.groups[2].test!.id;
 const before=data.attempts.find(a=>a.power_benchmark_test_id===left&&a.attempt_number===2)!;await c.app.benchmarks.saveAttempt(id,left,2,'345,5');data=await c.app.benchmarks.power(id);
 const after=data.attempts.find(a=>a.id===before.id)!;assert.equal(after.attempt_number,2);assert.equal(after.created_at,before.created_at);assert.equal(after.value,345.5);assert.equal(data.attempts.length,18);
 assert.equal(data.groups[1].best,345.5);assert.equal(data.groups[2].test!.id,right);assert.equal(data.groups[2].best,203);
 assert.equal(data.tests.find(test=>test.id===left)?.best_value,null);
});

for(const bad of ['', '0','-1','NaN','1,2.3'])test(`invalid Power distance ${JSON.stringify(bad)} cannot create an attempt`,async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower(powerDraft);const testId=(await c.benchmarks.power(id)).tests.find(test=>test.test_type==='STANDING_BROAD_JUMP')!.id;
 await assert.rejects(c.app.benchmarks.saveAttempt(id,testId,1,bad),FeatureError);assert.equal((await c.benchmarks.power(id)).attempts.length,0);
});

test('Power rejects attempts belonging to another session and out-of-range attempt numbers',async t=>{
 const c=await setup(t);const old=await c.app.benchmarks.startPower(powerDraft);const oldTest=(await c.app.benchmarks.power(old)).groups[0].test!.id;await c.app.benchmarks.finish('power',old,'INCOMPLETE');
 const id=await c.app.benchmarks.startPower(powerDraft);await assert.rejects(c.app.benchmarks.saveAttempt(id,oldTest,1,'200'),/gehört nicht/);
 const testId=(await c.app.benchmarks.power(id)).groups[0].test!.id;for(const n of [0,4,1.5])await assert.rejects(c.app.benchmarks.saveAttempt(id,testId,n,'200'),FeatureError);
});

test('Power completion requires every test side and all 18 attempts, and commits timestamp without cycle movement',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower(powerDraft);await assert.rejects(c.app.benchmarks.finish('power',id,'COMPLETE'),/18/);await fillPower(c,id);
 const data=await c.app.benchmarks.power(id);const missing=data.attempts.at(-1)!;c.sqlite.prepare('DELETE FROM power_benchmark_attempts WHERE id=?').run(missing.id);
 await assert.rejects(c.benchmarks.finish('power',id,'COMPLETE'),/18/);await c.app.benchmarks.saveAttempt(id,missing.power_benchmark_test_id,missing.attempt_number,'203');
 await c.app.benchmarks.finish('power',id,'COMPLETE');const after=await c.app.benchmarks.power(id);assert.equal(after.session.status,'COMPLETE');assert.ok(after.session.completed_at);assert.equal(after.session.completed_at,after.session.updated_at);
 assert.equal((await c.cycle.get()).current_position,1);assert.equal((await c.app.benchmarks.dashboard()).cards[0].state.status,'NOT_DUE');
});

for(const status of ['COMPLETE','INCOMPLETE'] as const)test(`${status} Power data is immutable, preserves conditions, and retains history`,async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower(powerDraft);if(status==='COMPLETE')await fillPower(c,id);
 else await c.app.benchmarks.saveAttempt(id,(await c.app.benchmarks.power(id)).groups[0].test!.id,1,'222');
 await c.app.benchmarks.finish('power',id,status);const before=await c.benchmarks.power(id);await assert.rejects(c.benchmarks.addPowerTest(id,{testType:'CHEST_PASS',side:'NONE',medicineBallWeight:9}));
 await assert.rejects(c.app.benchmarks.saveAttempt(id,before.tests[0].id,1,'300'),FeatureError);await assert.rejects(c.app.benchmarks.finish('power',id,'COMPLETE'),FeatureError);
 assert.deepEqual(await c.benchmarks.power(id),before);assert.equal((await c.benchmarks.history('power'))[0].status,status);
});

test('started Power setup is sealed against additional conditions and repeated start cannot replace ball weights',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower(powerDraft);const before=await c.benchmarks.power(id);
 await assert.rejects(c.benchmarks.addPowerTest(id,{testType:'CHEST_PASS',side:'NONE',medicineBallWeight:9}),/gesperrt/);
 assert.equal(await c.app.benchmarks.startPower({rotation:'8',chest:'9',shotPut:'10'}),id);assert.deepEqual(await c.benchmarks.power(id),before);
});

test('Power comparison uses complete previous sessions, matching sides and weights; Broad Jump remains comparable',async t=>{
 const c=await setup(t);const first=await c.app.benchmarks.startPower(powerDraft);await fillPower(c,first);await c.app.benchmarks.finish('power',first,'COMPLETE');
 const incomplete=await c.app.benchmarks.startPower(powerDraft);await fillPower(c,incomplete,900);await c.app.benchmarks.finish('power',incomplete,'INCOMPLETE');
 const current=await c.app.benchmarks.startPower({...powerDraft,chest:'6'});await fillPower(c,current,300);const view=await c.app.benchmarks.power(current);
 assert.equal(view.groups[0].comparison,'COMPARABLE');assert.equal(view.groups[0].delta,100);assert.equal(view.groups[1].delta,100);assert.equal(view.groups[2].delta,100);
 assert.equal(view.groups[3].comparison,'NOT_COMPARABLE');assert.equal(view.groups[3].delta,null);assert.equal(view.groups[3].previousBallWeight,5);assert.equal(view.groups[3].test!.medicine_ball_weight_kg,6);
 assert.equal((await c.app.benchmarks.power(first)).groups[0].comparison,'NO_PREVIOUS');
});

test('Circuit setup prefills only a real profile value and benchmark override never changes Profile or Bodyweight History',async t=>{
 const c=await setup(t);assert.equal((await c.app.benchmarks.setup('circuit')).bodyweight,null);await c.app.settings.updateBodyweight('82.5');assert.equal((await c.app.benchmarks.setup('circuit')).bodyweight,82.5);
 const profile=await c.profile.get();const history=await c.bodyweight.list();const id=await c.app.benchmarks.startCircuit(circuitDraft);const view=await c.app.benchmarks.circuit(id);
 assert.equal(view.session.bodyweight_kg_snapshot,80);assert.deepEqual(await c.profile.get(),profile);assert.deepEqual(await c.bodyweight.list(),history);
 assert.deepEqual(view.stations.map(s=>s.exercise_key),['GOBLET_SQUAT','PUSH_UPS','KETTLEBELL_SWING','PULL_UPS_CHIN_UPS','HANGING_LEG_RAISES','BURPEES']);
 assert.deepEqual(view.stations.map(s=>s.effective_weight_kg),[20,80,24,90,80,80]);assert.deepEqual(view.format,{rounds:5,stations:6,stationSeconds:60});
});

for(const [field,value] of [['bodyweight',''],['bodyweight','0'],['goblet',''],['goblet','-1'],['swing',''],['pullup','-1']] as const)test(`Circuit setup rejects ${field}=${JSON.stringify(value)} atomically`,async t=>{
 const c=await setup(t);await assert.rejects(c.app.benchmarks.startCircuit({...circuitDraft,[field]:value}),FeatureError);assert.equal((await c.benchmarks.history('circuit')).length,0);
});

test('zero external/added loads are valid and weighted pullups retain the bodyweight snapshot',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit({...circuitDraft,goblet:'0',swing:'0',pullup:'0'});assert.deepEqual((await c.app.benchmarks.circuit(id)).stations.map(s=>s.effective_weight_kg),[0,80,0,80,80,80]);
});

test('Circuit setup rollback leaves no session or station rows after late snapshot failure',async t=>{
 const c=await setup(t);c.sqlite.exec("CREATE TRIGGER fail_circuit_setup BEFORE INSERT ON circuit_benchmark_stations WHEN NEW.position=6 BEGIN SELECT RAISE(ABORT,'injected Circuit setup failure'); END;");
 await assert.rejects(c.app.benchmarks.startCircuit(circuitDraft),/injected/);assert.equal((await c.benchmarks.history('circuit')).length,0);assert.equal(c.sqlite.prepare('SELECT count(*) AS n FROM circuit_benchmark_stations').get()?.n,0);
});

for(const bad of ['', '-1','2.5','NaN','Infinity','9007199254740992'])test(`invalid reps ${JSON.stringify(bad)} cannot advance the Circuit cursor`,async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);const before=await c.app.benchmarks.circuit(id);await assert.rejects(c.app.benchmarks.advanceCircuit(id,before.cursor!,bad),FeatureError);
 assert.deepEqual(await c.app.benchmarks.circuit(id),before);
});

test('Circuit zero reps persist immediately and advance exactly one cell',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);const after=await c.app.benchmarks.advanceCircuit(id,{round:1,station:1},'0');assert.equal(after.results[0].reps,0);assert.deepEqual(after.cursor,{round:1,station:2});assert.equal(after.totalVolume,0);
});

test('simultaneous stale Next requests consume a Circuit cursor once without duplicate results',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);const cursor={round:1,station:1};const results=await Promise.allSettled([c.app.benchmarks.advanceCircuit(id,cursor,'10'),c.app.benchmarks.advanceCircuit(id,cursor,'10')]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const after=await c.app.benchmarks.circuit(id);assert.equal(after.results.length,1);assert.deepEqual(after.cursor,{round:1,station:2});
});

test('failed result insertion leaves no advanced cursor and retry succeeds',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);c.sqlite.exec("CREATE TRIGGER fail_reps BEFORE INSERT ON circuit_benchmark_round_results BEGIN SELECT RAISE(ABORT,'injected reps failure'); END;");
 await assert.rejects(c.app.benchmarks.advanceCircuit(id,{round:1,station:1},'10'),/injected/);assert.deepEqual((await c.app.benchmarks.circuit(id)).cursor,{round:1,station:1});
 c.sqlite.exec('DROP TRIGGER fail_reps');assert.equal((await c.app.benchmarks.advanceCircuit(id,{round:1,station:1},'10')).results.length,1);
});

test('Circuit corrections preserve row identity and do not move the cursor; unsaved cells cannot be added through correction',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);const first=await c.app.benchmarks.advanceCircuit(id,{round:1,station:1},'10');await c.app.benchmarks.correctCircuit(id,1,1,'12');const after=await c.app.benchmarks.circuit(id);
 assert.equal(after.results[0].id,first.results[0].id);assert.equal(after.results[0].reps,12);assert.deepEqual(after.cursor,first.cursor);await assert.rejects(c.app.benchmarks.correctCircuit(id,5,6,'10'),/gespeicherte/);
});

test('Circuit arithmetic overflow cannot persist an unloadable result',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit({...circuitDraft,goblet:'1'+ '0'.repeat(307)});await assert.rejects(c.app.benchmarks.advanceCircuit(id,{round:1,station:1},'100'),FeatureError);assert.equal((await c.benchmarks.circuit(id)).results.length,0);
});

test('aggregate rep counts remain safe integers even with zero-load stations',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit({...circuitDraft,goblet:'0'});
 await c.benchmarks.saveCircuitResult(id,1,1,Number.MAX_SAFE_INTEGER);
 await assert.rejects(c.benchmarks.saveCircuitResult(id,2,1,Number.MAX_SAFE_INTEGER),RangeError);
 assert.equal((await c.benchmarks.circuit(id)).results.length,1);
});

test('all 30 results follow exact linear positions; the last station never wraps or implicitly completes',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);let data=await c.app.benchmarks.circuit(id);const visited=[];
 while(data.cursor){visited.push({...data.cursor});data=await c.app.benchmarks.advanceCircuit(id,data.cursor,'10');}
 assert.equal(visited.length,30);assert.deepEqual(visited[5],{round:1,station:6});assert.deepEqual(visited[6],{round:2,station:1});assert.deepEqual(visited.at(-1),{round:5,station:6});
 assert.equal(data.ready,true);assert.equal(data.session.status,'IN_PROGRESS');assert.equal(data.cursor,null);await assert.rejects(c.app.benchmarks.advanceCircuit(id,{round:5,station:6},'10'),/geändert/);
});

test('Circuit Complete requires 30 results, then calculates total/exercise/round volumes and Relative Performance from snapshots',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);await assert.rejects(c.app.benchmarks.finish('circuit',id,'COMPLETE'),/30/);const ready=await fillCircuit(c,id);
 assert.equal(ready.totalVolume,18700);assert.equal(ready.relativePerformance,233.75);assert.deepEqual(ready.breakdown.map(row=>row.volume),[1000,4000,1200,4500,4000,4000]);
 assert.ok(ready.breakdown.every(row=>row.totalReps===50&&row.rounds.length===5&&row.rounds.every(result=>result?.reps===10)));assert.equal(ready.breakdown[0].rows[0].volume,200);
 await c.app.benchmarks.finish('circuit',id,'COMPLETE');assert.equal((await c.app.benchmarks.circuit(id)).session.status,'COMPLETE');assert.equal((await c.cycle.get()).current_position,1);
});

for(const kind of ['power','circuit'] as const)test(`${kind} completion failure rolls back status/timestamp and a double completion cannot run twice`,async t=>{
 const c=await setup(t);const id=kind==='power'?await c.app.benchmarks.startPower(powerDraft):await c.app.benchmarks.startCircuit(circuitDraft);if(kind==='power')await fillPower(c,id);else await fillCircuit(c,id);
 const before=kind==='power'?await c.benchmarks.power(id):await c.benchmarks.circuit(id);c.sqlite.exec(`CREATE TRIGGER fail_finish BEFORE UPDATE ON ${kind}_benchmark_sessions BEGIN SELECT RAISE(ABORT,'injected finish failure'); END;`);
 await assert.rejects(c.app.benchmarks.finish(kind,id,'COMPLETE'),/injected/);assert.deepEqual(kind==='power'?await c.benchmarks.power(id):await c.benchmarks.circuit(id),before);c.sqlite.exec('DROP TRIGGER fail_finish');
 const results=await Promise.allSettled([c.app.benchmarks.finish(kind,id,'COMPLETE'),c.app.benchmarks.finish(kind,id,'COMPLETE')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await c.cycle.get()).current_position,1);
});

for(const status of ['COMPLETE','INCOMPLETE'] as const)test(`${status} Circuit is read-only after terminal save and retains partial/complete data`,async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);if(status==='COMPLETE')await fillCircuit(c,id);else await c.app.benchmarks.advanceCircuit(id,{round:1,station:1},'10');await c.app.benchmarks.finish('circuit',id,status);
 const before=await c.benchmarks.circuit(id);await assert.rejects(c.benchmarks.saveCircuitResult(id,1,1,20));await assert.rejects(c.app.benchmarks.correctCircuit(id,1,1,'20'),FeatureError);await assert.rejects(c.app.benchmarks.finish('circuit',id,'COMPLETE'),FeatureError);
 assert.deepEqual(await c.benchmarks.circuit(id),before);assert.equal((await c.benchmarks.history('circuit'))[0].status,status);
});

test('Circuit conditions and station snapshots cannot be edited through SQL, and library/profile changes never rewrite them',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);await fillCircuit(c,id);const before=await c.app.benchmarks.circuit(id);
 assert.throws(()=>c.sqlite.prepare('UPDATE circuit_benchmark_sessions SET goblet_squat_load_kg=30 WHERE id=?').run(id),/immutable/);assert.throws(()=>c.sqlite.prepare("UPDATE circuit_benchmark_stations SET exercise_name_snapshot='Changed' WHERE circuit_benchmark_session_id=?").run(id),/immutable/);
 await c.app.settings.updateBodyweight('82.5');const exercise=await c.exercises.get(seed('Goblet Squat'));await c.exercises.update(exercise.id,{...exercise,name:'Changed Library',thumbnail_uri:'file:///new.png'});await c.exercises.setActive(exercise.id,false);
 assert.deepEqual(await c.app.benchmarks.circuit(id),before);await c.app.benchmarks.finish('circuit',id,'COMPLETE');assert.equal((await c.app.benchmarks.circuit(id)).relativePerformance,233.75);
});

for(const kind of ['power','circuit'] as const)test(`repeated ${kind} starts resume the same active identity; other benchmark and normal workout starts are blocked`,async t=>{
 const c=await setup(t);const start=()=>kind==='power'?c.app.benchmarks.startPower(powerDraft):c.app.benchmarks.startCircuit(circuitDraft);const [a,b]=await Promise.all([start(),start()]);assert.equal(a,b);
 await assert.rejects(kind==='power'?c.app.benchmarks.startCircuit(circuitDraft):c.app.benchmarks.startPower(powerDraft),FeatureError);
 await assert.rejects(c.app.workout.builder('UK_HAMS'),FeatureError);await assert.rejects(c.app.workout.start(normalDraft),FeatureError);
 const planned=await c.workouts.create('UK_HAMS');await assert.rejects(c.workouts.setStatus(planned,'IN_PROGRESS'));
 assert.equal((await c.benchmarks.history(kind)).length,1);assert.equal((await c.cycle.get()).current_position,1);
});

test('a normal active workout blocks both benchmark starts and setup',async t=>{
 const c=await setup(t);await c.app.workout.start(normalDraft);await assert.rejects(c.app.benchmarks.startPower(powerDraft),FeatureError);await assert.rejects(c.app.benchmarks.startCircuit(circuitDraft),FeatureError);await assert.rejects(c.app.benchmarks.setup('power'),FeatureError);
});

test('racing Power Circuit and normal workout starts permit exactly one active training unit',async t=>{
 const c=await setup(t);const result=await Promise.allSettled([c.app.benchmarks.startPower(powerDraft),app(c).benchmarks.startCircuit(circuitDraft),c.app.workout.start(normalDraft)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 const active=c.sqlite.prepare("SELECT id FROM power_benchmark_sessions WHERE status='IN_PROGRESS' UNION ALL SELECT id FROM circuit_benchmark_sessions WHERE status='IN_PROGRESS' UNION ALL SELECT id FROM workout_sessions WHERE status='IN_PROGRESS'").all();assert.equal(active.length,1);
});

for(const kind of ['POWER','CIRCUIT'] as const)for(const days of [29,30,31])test(`${kind} due state at ${days} days ignores later INCOMPLETE sessions`,()=>{
 const completed=Date.parse('2026-09-01T12:00:00Z');const schedule=benchmarkSchedule(kind,[{benchmarkType:kind,status:'COMPLETE',completedAtMs:completed},{benchmarkType:kind,status:'INCOMPLETE',completedAtMs:completed+20*DAY}],completed+days*DAY);
 assert.equal(schedule.dueAtMs,completed+30*DAY);assert.equal(schedule.state.status,days<30?'NOT_DUE':'DUE');if(schedule.state.status==='DUE')assert.equal(schedule.state.daysOverdue,days-30);
});

test('independent dashboard due dates use latest Complete, never start/incomplete or the other benchmark type',async t=>{
 const c=await setup(t);let id=await c.app.benchmarks.startPower(powerDraft);await c.app.benchmarks.finish('power',id,'INCOMPLETE');assert.ok((await c.app.home.load()).benchmarkStatus.cards.every(card=>card.state.status==='NOT_TESTED_YET'));
 id=await c.app.benchmarks.startPower(powerDraft);await fillPower(c,id);await c.app.benchmarks.finish('power',id,'COMPLETE');const date=(await c.benchmarks.power(id)).session.completed_at!;
 const summary=await app(c,Date.parse(date)+29*DAY).benchmarks.dashboard();assert.equal(summary.cards[0].state.status,'NOT_DUE');assert.equal(summary.cards[1].state.status,'NOT_TESTED_YET');
 const incomplete=await c.app.benchmarks.startPower(powerDraft);await c.app.benchmarks.finish('power',incomplete,'INCOMPLETE');const due=await app(c,Date.parse(date)+31*DAY).benchmarks.dashboard();assert.equal(due.cards[0].lastCompletedAtMs,Date.parse(date));assert.equal(due.cards[0].state.status,'DUE');
});

test('schedule dates select the latest Complete among unordered sessions and ignore the other benchmark type',()=>{
 const first=Date.parse('2026-08-01T00:00:00Z');const latest=first+10*DAY;
 const schedule=benchmarkSchedule('POWER',[{benchmarkType:'POWER',status:'COMPLETE',completedAtMs:latest},{benchmarkType:'CIRCUIT',status:'COMPLETE',completedAtMs:latest+DAY},{benchmarkType:'POWER',status:'COMPLETE',completedAtMs:first},{benchmarkType:'POWER',status:'INCOMPLETE',completedAtMs:latest+2*DAY}],latest+29*DAY);
 assert.equal(schedule.lastCompletedAtMs,latest);assert.equal(schedule.dueAtMs,latest+30*DAY);assert.equal(schedule.state.status,'NOT_DUE');
});

test('an overdue benchmark never blocks a new normal workout when no training unit is active',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startPower(powerDraft);await fillPower(c,id);await c.app.benchmarks.finish('power',id,'COMPLETE');
 const when=Date.parse((await c.benchmarks.power(id)).session.completed_at!)+31*DAY;const service=app(c,when);
 assert.equal((await service.benchmarks.dashboard()).cards[0].state.status,'DUE');const normal=await service.workout.start(normalDraft);assert.equal((await c.workouts.get(normal)).status,'IN_PROGRESS');
});

test('benchmark resume survives file-backed close/reopen for Power attempts and Circuit round 3 station 4',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'benchmarks-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'app.db');let c=connect(filename);
 try {
  await initializeDatabase(c.db);const power=await app(c).benchmarks.startPower(powerDraft);const group=(await app(c).benchmarks.power(power)).groups[0].test!.id;await app(c).benchmarks.saveAttempt(power,group,1,'222');const before=await c.benchmarks.power(power);
  c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);assert.deepEqual(await c.benchmarks.power(power),before);await app(c).benchmarks.finish('power',power,'INCOMPLETE');
  const circuit=await app(c).benchmarks.startCircuit(circuitDraft);for(let i=0;i<15;i++){const data=await app(c).benchmarks.circuit(circuit);await app(c).benchmarks.advanceCircuit(circuit,data.cursor!,'10');}
  const snapshot=await app(c).benchmarks.circuit(circuit);assert.deepEqual(snapshot.cursor,{round:3,station:4});c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);assert.deepEqual(await app(c).benchmarks.circuit(circuit),snapshot);
  await fillCircuit(c,circuit);await app(c).benchmarks.finish('circuit',circuit,'COMPLETE');c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);assert.equal((await app(c).benchmarks.circuit(circuit)).session.status,'COMPLETE');assert.equal((await c.cycle.get()).current_position,1);
 } finally {c.sqlite.close();}
});

test('benchmark countdown reuses pause/resume/full reset and expiry does not advance without reps',async t=>{
 const c=await setup(t);const id=await c.app.benchmarks.startCircuit(circuitDraft);let timer=tickCircuitTimer(startCircuitTimer(60),10);timer=pauseCircuitTimer(timer);assert.equal(tickCircuitTimer(timer,100).remaining,50);timer=resumeCircuitTimer(timer);assert.equal(tickCircuitTimer(timer,60).phase,'expired');
 assert.deepEqual((await c.app.benchmarks.circuit(id)).cursor,{round:1,station:1});assert.equal(resetCircuitTimer(60).remaining,60);assert.equal(resetCircuitTimer(60).phase,'paused');
});

test('benchmarks never move normal cycle or affect Strength PRs Settings and Exercise Library',async t=>{
 const c=await setup(t);await c.app.settings.updateBodyweight('82.5');await c.app.settings.updateRestTimer('POWER',180);const normal=await c.app.workout.start(normalDraft);await completeSections(c,normal);await c.app.workout.endIncomplete(normal);
 const profile=await c.profile.get();const history=await c.bodyweight.list();const library=await c.exercises.list(true);const old=await c.workouts.completionSnapshot(normal);
 const power=await c.app.benchmarks.startPower(powerDraft);await fillPower(c,power);await c.app.benchmarks.finish('power',power,'COMPLETE');const circuit=await c.app.benchmarks.startCircuit(circuitDraft);await fillCircuit(c,circuit);await c.app.benchmarks.finish('circuit',circuit,'COMPLETE');
 assert.equal((await c.cycle.get()).current_position,1);assert.deepEqual(await c.profile.get(),profile);assert.deepEqual(await c.bodyweight.list(),history);assert.deepEqual(await c.exercises.list(true),library);assert.deepEqual(await c.workouts.completionSnapshot(normal),old);
 assert.equal(calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press'))),3200);const next=await c.app.workout.start(normalDraft);await completeSections(c,next);await c.app.completion.finish(next);assert.equal((await c.cycle.get()).current_position,2);
});

test('missing session and invalid coordinates are recoverable errors without raw SQLite feedback',async t=>{
 const c=await setup(t);await assert.rejects(c.app.benchmarks.power('missing'),FeatureError);await assert.rejects(c.app.benchmarks.circuit('missing'),FeatureError);
 assert.throws(()=>circuitBenchmarkCursor([{round:6,station:1}]),RangeError);assert.throws(()=>circuitBenchmarkCursor([{round:1,station:1},{round:1,station:1}]),RangeError);
 const original=console.error;console.error=()=>{};try{assert.doesNotMatch(userMessage(new Error('SQLITE private detail')),/SQLITE|private detail/);}finally{console.error=original;}
 assert.equal(bestPowerAttempt([218,225,222]),225);assert.equal(bestPowerAttempt([]),null);assert.equal(decimal('4,5','Ball'),4.5);assert.equal(repetitions('0'),0);assert.equal(powerConditions({rotation:4,chest:5,shotPut:3}).length,6);assert.equal(powerProtocol.length,4);
});
