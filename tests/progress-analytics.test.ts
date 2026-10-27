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
import { historicalVolumePrs } from '../src/domain/strength/history.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';
import { chronological } from '../src/features/progress/services.ts';
import { seedExercises } from '../src/data/seed.ts';
import type { BindValue } from '../src/data/database.ts';

const seed=(name:string)=>seedExercises.find(row=>row.name===name)!.id;
const app=(c:ReturnType<typeof connect>)=>createApplicationServices(createRepositories(c.db,c.store.now));
async function setup(t:TestContext){const c=connect();t.after(()=>c.sqlite.close());await initializeDatabase(c.db);return {...c,app:app(c)};}
async function strength(c:ReturnType<typeof connect>,weight=100,options:{complete?:boolean;overall?:'COMPLETE'|'INCOMPLETE';bodyweight?:number|null;exercise?:string;at?:string;sets?:number;rir?:number}={}){
 const id=await c.workouts.create('UK_HAMS',options.bodyweight===undefined?80:options.bodyweight);
 const selection=await c.workouts.selectStrength(id,'A',options.exercise??seed('Bench Press'));
 const count=options.sets??(options.complete===false?2:4);
 for(let n=1;n<=count;n++)await c.workouts.saveSet(selection,n,weight,8,options.rir??2);
 if(options.complete!==false)await c.workouts.setStrengthComplete(selection,true);
 if(options.overall==='COMPLETE'){await completeSections(c,id);await c.workouts.finish(id,'CONTINUE_CYCLE_NORMALLY');}
 else await c.workouts.setStatus(id,'INCOMPLETE');
 if(options.at)c.sqlite.prepare('UPDATE workout_sessions SET completed_at=? WHERE id=?').run(options.at,id);
 return id;
}
async function power(c:ReturnType<typeof connect>,value=220,ball=5,status:'COMPLETE'|'INCOMPLETE'='COMPLETE'){
 const id=await c.benchmarks.startPower({rotation:4,chest:ball,shotPut:3});const data=await c.benchmarks.power(id);
 for(const group of data.tests){for(let n=1;n<=3;n++)await c.benchmarks.savePowerAttempt(group.id,n,value+n+(group.side==='RIGHT'?10:0));if(status==='INCOMPLETE')break;}
 await c.benchmarks.finish('power',id,status);return id;
}
async function circuit(c:ReturnType<typeof connect>,bw=80,goblet=20,pullup=10,status:'COMPLETE'|'INCOMPLETE'='COMPLETE'){
 const id=await c.benchmarks.startCircuit({bodyweight_kg_snapshot:bw,goblet_squat_load_kg:goblet,kettlebell_swing_load_kg:24,pullup_added_load_kg:pullup});
 for(let r=1;r<=(status==='COMPLETE'?5:1);r++)for(let s=1;s<=6;s++)await c.benchmarks.saveCircuitResult(id,r,s,16-r);
 await c.benchmarks.finish('circuit',id,status);return id;
}
function state(c:ReturnType<typeof connect>){return c.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>({name:row.name,rows:c.sqlite.prepare(`SELECT * FROM ${row.name} ORDER BY rowid`).all()}));}
const domain=(id:string,weight:number,isComplete=true)=>({exerciseId:id,isComplete,sets:[{weight,reps:8}]});

test('historical Strength PRs use chronological per-ID eligible baselines, strict greater and ignore high partials',()=>{
 const values=historicalVolumePrs([domain('a',100),domain('a',105),domain('a',400,false),domain('a',103),domain('a',110),domain('a',110),domain('b',50)]);
 assert.deepEqual(values.map(row=>row.isNewPr),[true,true,false,false,true,false,true]);assert.deepEqual(values.map(row=>row.previousBenchmark),[0,800,840,840,840,880,0]);
});
test('historical Strength PR evaluation is immutable and zero does not beat baseline zero',()=>{
 const input=Object.freeze([Object.freeze(domain('a',0)),Object.freeze(domain('a',10,false))]);assert.deepEqual(historicalVolumePrs(input).map(row=>row.isNewPr),[false,false]);assert.equal(input[0].sets[0].weight,0);
});
test('central chronology uses full absolute timestamps, stable IDs and null last without mutating input',()=>{
 const rows=[{id:'b',date:'2026-10-20T12:00:00+02:00'},{id:'a',date:'2026-10-20T10:00:00Z'},{id:'c',date:null},{id:'d',date:'2026-10-20T08:00:00Z'}];
 assert.deepEqual(chronological(rows).map(row=>row.id),['d','a','b','c']);assert.equal(rows[0].id,'b');assert.deepEqual(chronological([...rows].reverse()),chronological(rows));
});
for(const area of ['strength','power','circuit'] as const)test(`empty ${area} Progress is explicit and creates no performance`,async t=>{
 const c=await setup(t);const data=await c.app.progress[area]();assert.deepEqual(data,area==='circuit'?{total:[],relative:[],exercises:[],sessions:[]}:[]);
});
test('empty Bodyweight Progress keeps missing profile and empty historical series distinct',async t=>{const c=await setup(t);assert.deepEqual(await c.app.progress.bodyweight(),{current:null,points:[],entries:[]});});

test('Strength grouping uses exact Exercise ID even when two names match',async t=>{
 const c=await setup(t);const other=await c.exercises.create({name:'Bench Press',load_mode:'EXTERNAL_ONLY',areas:['STRENGTH'],effects:['UPPER_PUSH']});
 await strength(c,100);await strength(c,20,{exercise:other});const data=await c.app.progress.strength();assert.equal(data.length,2);assert.deepEqual(new Set(data.map(row=>row.benchmark)),new Set([3200,640]));
});
test('Strength navigation uses current active name; inactive falls back to the latest immutable snapshot',async t=>{
 const c=await setup(t);await strength(c);const e=await c.exercises.get(seed('Bench Press'));await c.exercises.update(e.id,{...e,name:'Renamed Press',thumbnail_uri:'file:///new-image.png',load_mode:'BODYWEIGHT_ONLY'});
 let data=await c.app.progress.strengthDetail(e.id);assert.equal(data.name,'Renamed Press');assert.equal(data.points[0].exercise.exercise_name_snapshot,'Bench Press');assert.equal(data.points[0].exercise.thumbnail_uri_snapshot,null);
 await c.exercises.setActive(e.id,false);data=await c.app.progress.strengthDetail(e.id);assert.equal(data.name,'Bench Press');assert.equal(data.inactive,true);assert.equal(data.benchmark,3200);
});
for(const overall of ['COMPLETE','INCOMPLETE'] as const)test(`complete Strength Exercise in ${overall} workout is PR eligible`,async t=>{
 const c=await setup(t);await strength(c,100,{overall});const data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.equal(data.benchmark,3200);assert.equal(data.points[0].isNewPr,true);assert.equal(data.points[0].isComplete,true);
 assert.equal(calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press'))),data.benchmark);
});
test('partial higher Strength volume cannot suppress a later eligible PR, equal eligible volume is not another PR',async t=>{
 const c=await setup(t);for(const [weight,complete]of [[100,true],[105,true],[400,false],[110,true],[110,true]] as const)await strength(c,weight,{complete});
 const data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.deepEqual(data.points.map(row=>row.value),[3200,3360,6400,3520,3520]);assert.deepEqual(data.points.map(row=>row.isNewPr),[true,true,false,true,false]);assert.equal(data.benchmark,3520);assert.equal(data.points[2].sets.length,2);
});
test('Strength is ordered by actual completion time before historical PR detection, list is newest first',async t=>{
 const c=await setup(t);await strength(c,110,{at:'2026-10-22T10:00:00Z'});await strength(c,100,{at:'2026-10-20T09:00:00Z'});await strength(c,105,{at:'2026-10-20T10:00:00Z'});
 const data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.deepEqual(data.points.map(row=>row.value),[3200,3360,3520]);assert.deepEqual(data.points.map(row=>row.isNewPr),[true,true,true]);assert.deepEqual(data.sessions,[...data.points].reverse());
});
test('Strength best set e1RM includes fractional RIR and relative e1RM uses the performance BW only',async t=>{
 const c=await setup(t);const id=await c.workouts.create('UK_HAMS',82.5);const e=await c.workouts.selectStrength(id,'A',seed('Bench Press'));
 await c.workouts.saveSet(e,1,100,5,1.5);await c.workouts.saveSet(e,3,90,8,3);await c.workouts.setStatus(id,'INCOMPLETE');await c.bodyweight.update(70);
 const row=(await c.app.progress.strengthDetail(seed('Bench Press'))).latest;assert.equal(row.e1rm,90*(1+11/30));assert.equal(row.relativeE1rm,row.e1rm/82.5);assert.equal(row.value,1220);assert.deepEqual(row.sets.map(set=>set.set_number),[1,3]);assert.equal(row.isNewPr,false);
});
test('missing historical BW remains unavailable after Profile update; Relative Strength is not inferred from current load mode',async t=>{
 const c=await setup(t);await strength(c,100,{bodyweight:null});await c.bodyweight.update(80);const data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.equal(data.latest.relativeE1rm,null);assert.equal('relativeStrength' in data.latest,false);
});
test('untrained Strength selections are not invented as zero-valued trend points',async t=>{
 const c=await setup(t);const id=await c.workouts.create('UK_HAMS');await c.workouts.selectStrength(id,'A',seed('Bench Press'));await c.workouts.setStatus(id,'INCOMPLETE');assert.deepEqual(await c.app.progress.strength(),[]);
});
for(const status of ['PLANNED','IN_PROGRESS'] as const)test(`${status} normal workouts do not enter Progress`,async t=>{
 const c=await setup(t);const id=await c.workouts.create('UK_HAMS');const e=await c.workouts.selectStrength(id,'A',seed('Bench Press'));await c.workouts.saveSet(e,1,100,8,2);if(status==='IN_PROGRESS')await c.workouts.setStatus(id,status);assert.deepEqual(await c.app.progress.strength(),[]);
});
test('historical time fallback is shared with History; unknown date never receives a historical PR label',async t=>{
 const c=await setup(t);const id=await strength(c);c.sqlite.prepare('UPDATE workout_sessions SET completed_at=NULL WHERE id=?').run(id);
 let data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.equal(data.latest.date,(await c.workouts.get(id)).started_at);
 c.sqlite.prepare("UPDATE workout_sessions SET started_at='',created_at='' WHERE id=?").run(id);data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.equal(data.latest.date,null);assert.equal(data.latest.isNewPr,false);assert.equal(data.benchmark,3200);
});
test('Strength detail binds the exact requested ID and missing ID has a recoverable empty message',async t=>{
 const c=await setup(t);await strength(c);await assert.rejects(c.app.progress.strengthDetail("' OR 1=1 --"),FeatureError);await assert.rejects(c.app.progress.strengthDetail('missing'),/Noch keine Daten/);
});

test('Power official trends exclude Incomplete even if its captured values are higher',async t=>{
 const c=await setup(t);const complete=await power(c,220);await power(c,1000,5,'INCOMPLETE');const data=await c.app.progress.power();assert.equal(data.length,6);assert.ok(data.every(group=>group.points.length===1&&group.points[0].sourceSessionId===complete));assert.equal(data[0].best,223);
});
test('active Power session has no official trend point',async t=>{const c=await setup(t);await c.benchmarks.startPower({rotation:4,chest:5,shotPut:3});assert.deepEqual(await c.app.progress.power(),[]);});
test('Power Broad Jump best trend/strict PR/delta remain in cm',async t=>{
 const c=await setup(t);await power(c,218);await power(c,225);await power(c,225);const row=(await c.app.progress.power()).find(row=>row.testType==='STANDING_BROAD_JUMP')!;
 assert.equal(row.unit,'cm');assert.equal(row.best,228);assert.deepEqual(row.points.map(point=>point.value),[221,228,228]);assert.deepEqual(row.points.map(point=>point.isNewPr),[true,true,false]);assert.deepEqual(row.points.map(point=>point.delta),[null,7,0]);
});
for(const type of ['ROTATIONAL_THROW','SHOT_PUT_THROW'] as const)test(`${type} preserves separate Left and Right trends and PRs`,async t=>{
 const c=await setup(t);await power(c);const groups=(await c.app.progress.power()).filter(row=>row.testType===type);assert.deepEqual(groups.map(row=>row.side).sort(),['LEFT','RIGHT']);assert.equal(groups.find(row=>row.side==='RIGHT')!.best-groups.find(row=>row.side==='LEFT')!.best,10);
});
test('medicine ball conditions stay separate; a return to an older condition compares to that compatible series only',async t=>{
 const c=await setup(t);await power(c,220,5);await power(c,210,6);await power(c,230,5);const groups=(await c.app.progress.power()).filter(row=>row.testType==='CHEST_PASS');assert.equal(groups.length,2);
 const five=groups.find(row=>row.ballWeight===5)!;const six=groups.find(row=>row.ballWeight===6)!;assert.deepEqual(five.points.map(row=>row.delta),[null,10]);assert.equal(six.points[0].delta,null);assert.equal(six.points[0].isNewPr,true);assert.equal(five.best,233);assert.equal(six.best,213);
});
test('Power condition separation applies independently to rotation and shot-put weights',async t=>{
 const c=await setup(t);await power(c);const id=await c.benchmarks.startPower({rotation:6,chest:5,shotPut:7});const data=await c.benchmarks.power(id);for(const group of data.tests)for(let n=1;n<=3;n++)await c.benchmarks.savePowerAttempt(group.id,n,100+n);await c.benchmarks.finish('power',id,'COMPLETE');
 const groups=await c.app.progress.power();assert.equal(groups.filter(row=>row.testType==='ROTATIONAL_THROW').length,4);assert.equal(groups.filter(row=>row.testType==='SHOT_PUT_THROW').length,4);assert.equal(groups.filter(row=>row.testType==='CHEST_PASS').length,1);
});
test('Power persisted units form separate comparable series without silent conversion',async t=>{
 const c=await setup(t);await power(c);const id=await power(c,7);c.sqlite.prepare("UPDATE power_benchmark_tests SET unit='m' WHERE power_benchmark_session_id=? AND test_type='CHEST_PASS'").run(id);
 const groups=(await c.app.progress.power()).filter(row=>row.testType==='CHEST_PASS');assert.deepEqual(groups.map(row=>row.unit).sort(),['cm','m']);assert.ok(groups.every(row=>row.points[0].delta===null));assert.equal(groups.find(row=>row.unit==='m')!.best,10);
});
test('legacy COMPLETE Power with missing attempts does not fabricate official points',async t=>{
 const c=await setup(t);const id=await power(c);c.sqlite.prepare('DELETE FROM power_benchmark_attempts WHERE power_benchmark_test_id IN (SELECT id FROM power_benchmark_tests WHERE power_benchmark_session_id=?)').run(id);assert.deepEqual(await c.app.progress.power(),[]);
});

test('Circuit official trends exclude high Incomplete results and default to latest complete',async t=>{
 const c=await setup(t);const old=await circuit(c);const latest=await circuit(c,82.5,30,0);await circuit(c,100,100,100,'INCOMPLETE');const data=await c.app.progress.circuit();assert.deepEqual(data.total.map(row=>row.id),[old,latest]);assert.equal(data.sessions[0].id,latest);assert.equal(data.sessions.length,2);assert.equal(data.exercises.length,6);
});
test('active Circuit session is not an official trend point',async t=>{const c=await setup(t);await c.benchmarks.startCircuit({bodyweight_kg_snapshot:80,goblet_squat_load_kg:20,kettlebell_swing_load_kg:24,pullup_added_load_kg:0});assert.equal((await c.app.progress.circuit()).sessions.length,0);});
test('Circuit analytics preserve all five rounds, total reps, effective weights and per-exercise volume',async t=>{
 const c=await setup(t);await circuit(c);const data=await c.app.progress.circuit();const row=data.sessions[0];assert.deepEqual(row.stations.map(s=>s.effective_weight_kg),[20,80,24,90,80,80]);
 assert.deepEqual(row.breakdown[0].rounds.map(r=>r?.reps),[15,14,13,12,11]);assert.ok(data.exercises.every(e=>e.reps[0].value===65));assert.deepEqual(data.exercises.map(e=>e.volume[0].value),[1300,5200,1560,5850,5200,5200]);assert.equal(row.totalVolume,24310);assert.equal(data.relative[0].value,24310/80);assert.equal('fatigueScore' in data,false);
});
test('Circuit selected older sessions retain original conditions after newer loads and Profile/Library edits',async t=>{
 const c=await setup(t);const old=await circuit(c);await circuit(c,90,32,20);const before=(await c.app.progress.circuit()).sessions.find(row=>row.id===old)!;await c.bodyweight.update(70);const e=await c.exercises.get(seed('Goblet Squat'));await c.exercises.update(e.id,{...e,name:'Changed Squat'});await c.exercises.setActive(e.id,false);
 const after=(await c.app.progress.circuit()).sessions.find(row=>row.id===old)!;assert.deepEqual(after,before);assert.equal(after.session.bodyweight_kg_snapshot,80);assert.equal(after.stations[0].exercise_name_snapshot,'Goblet Squat');assert.equal(after.stations[3].effective_weight_kg,90);
});
test('Circuit zero reps remain real zero values, not absent or synthetic fatigue scores',async t=>{
 const c=await setup(t);const id=await c.benchmarks.startCircuit({bodyweight_kg_snapshot:80,goblet_squat_load_kg:0,kettlebell_swing_load_kg:0,pullup_added_load_kg:0});for(let r=1;r<=5;r++)for(let s=1;s<=6;s++)await c.benchmarks.saveCircuitResult(id,r,s,0);await c.benchmarks.finish('circuit',id,'COMPLETE');const data=await c.app.progress.circuit();assert.equal(data.total[0].value,0);assert.equal(data.relative[0].value,0);assert.ok(data.exercises.every(e=>e.reps[0].value===0));
});
test('legacy COMPLETE Circuit with missing round data does not enter official trends',async t=>{
 const c=await setup(t);const id=await circuit(c);c.sqlite.prepare('DELETE FROM circuit_benchmark_round_results WHERE circuit_benchmark_session_id=? AND round_number=5').run(id);assert.equal((await c.app.progress.circuit()).sessions.length,0);
});

test('one Bodyweight entry is one exact point with a separate current Profile value',async t=>{const c=await setup(t);await c.bodyweight.update(82.5);const data=await c.app.progress.bodyweight();assert.equal(data.current,82.5);assert.equal(data.points.length,1);assert.equal(data.points[0].value,82.5);assert.equal(data.points[0].id,data.entries[0].id);});
test('Bodyweight uses true entries in absolute chronological order and newest-first list without extra deduplication',async t=>{
 const c=await setup(t);await c.bodyweight.update(82.5,'2026-10-20T12:00:00+02:00');await c.bodyweight.update(80.25,'2026-10-19T09:00:00Z');await c.bodyweight.update(82.5,'2026-10-20T11:00:00Z');const data=await c.app.progress.bodyweight();assert.deepEqual(data.points.map(row=>row.value),[80.25,82.5,82.5]);assert.equal(data.current,82.5);assert.deepEqual(data.entries,[...data.points].reverse());
});
test('Bodyweight Progress never promotes benchmark-specific BW snapshots into global entries',async t=>{
 const c=await setup(t);await circuit(c,90);const data=await c.app.progress.bodyweight();assert.deepEqual(data.points,[]);assert.equal(data.current,null);
});
test('later Profile updates append genuine history without rewriting past Bodyweight or Strength metrics',async t=>{
 const c=await setup(t);await c.bodyweight.update(80);await strength(c);const before=await c.app.progress.strengthDetail(seed('Bench Press'));const points=(await c.app.progress.bodyweight()).points;await c.bodyweight.update(75);assert.deepEqual((await c.app.progress.bodyweight()).points.slice(0,1),points);assert.deepEqual(await c.app.progress.strengthDetail(seed('Bench Press')),before);
});

test('every Progress read leaves all tables, total_changes, due states, cycle, PRs and History unchanged',async t=>{
 const c=await setup(t);await strength(c);await power(c);await circuit(c);await c.bodyweight.update(80);const before=state(c);const changes=c.sqlite.prepare('SELECT total_changes() AS n').get()?.n;const due=await c.app.benchmarks.dashboard();const history=await c.app.history.list();const benchmark=calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press')));
 c.db.runAsync=async()=>{throw new Error('Progress must not write');};c.db.withTransactionAsync=async()=>{throw new Error('Progress must not transact');};c.db.execAsync=async()=>{throw new Error('Progress must not execute DDL');};
 await c.app.progress.strength();await c.app.progress.strengthDetail(seed('Bench Press'));await c.app.progress.power();await c.app.progress.circuit();await c.app.progress.bodyweight();assert.deepEqual(state(c),before);assert.equal(c.sqlite.prepare('SELECT total_changes() AS n').get()?.n,changes);assert.deepEqual(await c.app.benchmarks.dashboard(),due);assert.deepEqual(await c.app.history.list(),history);assert.equal(calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press'))),benchmark);
});
test('Rest completion remains a cycle action, not an analytics sample',async t=>{
 const c=await setup(t);await c.cycle.save(3);await c.app.home.completeRest(3);assert.equal((await c.cycle.get()).current_position,4);assert.deepEqual(await c.app.progress.strength(),[]);assert.deepEqual(await c.app.progress.power(),[]);assert.deepEqual((await c.app.progress.circuit()).sessions,[]);
});
test('new actual workout/benchmark completion is immediately reflected without stale analytics caches',async t=>{
 const c=await setup(t);await c.app.progress.strength();await strength(c,100,{overall:'COMPLETE'});assert.equal((await c.cycle.get()).current_position,2);assert.equal((await c.app.home.load()).latest?.status,'COMPLETE');assert.equal((await c.app.progress.strengthDetail(seed('Bench Press'))).benchmark,3200);
 await c.app.progress.power();const p=await power(c);assert.equal((await c.app.progress.power())[0].points[0].id,p);await c.app.progress.circuit();const cb=await circuit(c);assert.equal((await c.app.progress.circuit()).sessions[0].id,cb);assert.equal((await c.cycle.get()).current_position,2);assert.equal((await c.app.history.list()).length,3);
});
test('all analytics survive a real file-backed close/reopen and initialization without navigation state',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'progress-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'app.db');let c=connect(filename);
 try{await initializeDatabase(c.db);await strength(c);await power(c);await circuit(c);await c.bodyweight.update(82.5);const before=[await app(c).progress.strength(),await app(c).progress.power(),await app(c).progress.circuit(),await app(c).progress.bodyweight()];c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);assert.deepEqual([await app(c).progress.strength(),await app(c).progress.power(),await app(c).progress.circuit(),await app(c).progress.bodyweight()],before);}finally{c.sqlite.close();}
});
for(const area of ['strength','power','circuit','bodyweight'] as const)test(`${area} SQL failure remains recoverable with generic error and successful retry`,async t=>{
 const c=await setup(t);const original=c.db.getAllAsync;let fail=true;c.db.getAllAsync=async<T>(sql:string,...params:BindValue[])=>{if(fail)throw new Error('SQLITE private');return original<T>(sql,...params);};
 const log=console.error;console.error=()=>{};try{await assert.rejects(c.app.progress[area](),error=>!userMessage(error).includes('SQLITE'));fail=false;await c.app.progress[area]();}finally{console.error=log;}
});

test('600+ Strength sessions use two batched queries, exact-ID detail filtering and do not read other areas',async t=>{
 const c=await setup(t);const id=await strength(c);const source=(await c.workouts.strength(id))[0];const at='2026-10-26T12:00:00Z';
 for(let n=0;n<600;n++){
  c.sqlite.prepare("INSERT INTO workout_sessions (id,workout_type,expected_cycle_position,expected_workout_type,was_manual_override,status,started_at,completed_at,created_at,updated_at,bodyweight_snapshot_kg) VALUES (?,'UK_HAMS',1,'UK_HAMS',0,'INCOMPLETE',?,?,?,?,80)").run(`s${n}`,at,at,at,at);
  c.sqlite.prepare("INSERT INTO workout_strength_exercises (id,workout_session_id,slot,exercise_id,exercise_name_snapshot,is_complete,created_at) VALUES (?,?,'A',?,'Bench Press',1,?)").run(`e${n}`,`s${n}`,source.exercise_id,at);
  for(let set=1;set<=4;set++)c.sqlite.prepare('INSERT INTO strength_sets (id,workout_strength_exercise_id,set_number,weight_kg,reps,rir,saved_at,updated_at) VALUES (?,?,?,100,8,2,?,?)').run(`t${n}/${set}`,`e${n}`,set,at,at);
 }
 const all=c.db.getAllAsync;let queries=0;c.db.getAllAsync=async<T>(sql:string,...params:BindValue[])=>{queries++;assert.doesNotMatch(sql,/benchmark|bodyweight_entries|FROM profile/);return all<T>(sql,...params);};
 const data=await c.app.progress.strength();assert.equal(data[0].points.length,601);assert.equal(queries,2);queries=0;await c.app.progress.strengthDetail(seed('Bench Press'));assert.equal(queries,2);
});
for(const area of ['power','circuit'] as const)test(`600+ ${area} complete sessions need exactly three batch queries, never a query per point`,async t=>{
 const c=await setup(t);const source=area==='power'?await power(c):await circuit(c);const prefix=area==='power'?'power_benchmark':'circuit_benchmark';const at='2026-10-26T12:00:00Z';
 for(let n=0;n<600;n++){
  if(area==='power'){
   c.sqlite.prepare("INSERT INTO power_benchmark_sessions SELECT ?,status,?,?,?,? FROM power_benchmark_sessions WHERE id=?").run(`p${n}`,at,at,at,at,source);
   c.sqlite.prepare('INSERT INTO power_benchmark_tests SELECT id||?, ?,test_type,side,medicine_ball_weight_kg,unit,best_value FROM power_benchmark_tests WHERE power_benchmark_session_id=?').run(`/${n}`,`p${n}`,source);
   c.sqlite.prepare('INSERT INTO power_benchmark_attempts SELECT a.id||?,a.power_benchmark_test_id||?,a.attempt_number,a.value,a.created_at FROM power_benchmark_attempts a JOIN power_benchmark_tests t ON t.id=a.power_benchmark_test_id WHERE t.power_benchmark_session_id=?').run(`/${n}`,`/${n}`,source);
  }else{
   c.sqlite.prepare('INSERT INTO circuit_benchmark_sessions SELECT ?,status,bodyweight_kg_snapshot,goblet_squat_load_kg,kettlebell_swing_load_kg,pullup_added_load_kg,?,?,?,? FROM circuit_benchmark_sessions WHERE id=?').run(`c${n}`,at,at,at,at,source);
   c.sqlite.prepare('INSERT INTO circuit_benchmark_stations SELECT id||?, ?,position,exercise_key,exercise_name_snapshot,thumbnail_uri_snapshot,effective_weight_kg FROM circuit_benchmark_stations WHERE circuit_benchmark_session_id=?').run(`/${n}`,`c${n}`,source);
   c.sqlite.prepare('INSERT INTO circuit_benchmark_round_results SELECT id||?, ?,round_number,station_position,reps,saved_at FROM circuit_benchmark_round_results WHERE circuit_benchmark_session_id=?').run(`/${n}`,`c${n}`,source);
  }
 }
 const all=c.db.getAllAsync;let queries=0;c.db.getAllAsync=async<T>(sql:string,...params:BindValue[])=>{queries++;assert.ok(sql.includes(prefix));return all<T>(sql,...params);};
 const data=await c.app.progress[area]();assert.equal(queries,3);assert.equal(Array.isArray(data)?data[0].points.length:data.sessions.length,601);
});

test('Bodyweight points identify entries, never invented training sessions; Profile alone creates no points',async t=>{
 const c=await setup(t);c.sqlite.prepare('UPDATE profile SET current_bodyweight_kg=80').run();let data=await c.app.progress.bodyweight();assert.equal(data.current,80);assert.deepEqual(data.points,[]);
 const id=await c.bodyweight.update(81);data=await c.app.progress.bodyweight();assert.equal(data.points[0].sourceSessionId,null);assert.equal(data.points[0].sourceEntryId,id);
});
test('equal-time eligible Strength performances have deterministic identity order and only one first PR',async t=>{
 const c=await setup(t);await strength(c,100,{at:'2026-10-25T12:00:00Z'});await strength(c,100,{at:'2026-10-25T12:00:00Z'});const a=await c.app.progress.strengthDetail(seed('Bench Press'));const b=await c.app.progress.strengthDetail(seed('Bench Press'));assert.deepEqual(a,b);assert.deepEqual(a.points.map(row=>row.isNewPr),[true,false]);assert.ok(a.points[0].id.localeCompare(a.points[1].id)<0);
});
test('legacy exercise completion flag without four recorded working sets cannot manufacture an eligible PR',async t=>{
 const c=await setup(t);const id=await strength(c,200);c.sqlite.prepare('DELETE FROM strength_sets WHERE workout_strength_exercise_id IN (SELECT id FROM workout_strength_exercises WHERE workout_session_id=?) AND set_number>2').run(id);
 const data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.equal(data.latest.value,3200);assert.equal(data.latest.isComplete,false);assert.equal(data.latest.isNewPr,false);assert.equal(data.benchmark,0);
});
test('overflowed historical metrics fail safely rather than plotting nonfinite numbers',async t=>{
 const c=await setup(t);const id=await strength(c);c.sqlite.prepare('UPDATE strength_sets SET weight_kg=1e308 WHERE workout_strength_exercise_id IN (SELECT id FROM workout_strength_exercises WHERE workout_session_id=?)').run(id);
 await assert.rejects(c.app.progress.strength(),error=>error instanceof FeatureError&&!error.message.includes('Infinity'));
});

test('partial-only Strength history exposes no achieved PR instead of treating the zero baseline as a record',async t=>{
 const c=await setup(t);await strength(c,100,{complete:false});const data=await c.app.progress.strengthDetail(seed('Bench Press'));assert.equal(data.hasEligible,false);assert.equal(data.benchmark,0);assert.equal(data.points[0].isNewPr,false);
});
