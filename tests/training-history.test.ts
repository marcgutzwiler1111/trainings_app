import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from './support/sqlite.ts';
import { completeSections } from './support/completion.ts';
import { completePowerData, completeCircuitData } from './support/benchmarks.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices, FeatureError, userMessage } from '../src/features/application/services.ts';
import { seedExercises } from '../src/data/seed.ts';
import { historyEntry, sortHistory, filterHistory, formatHistoryDate, historyRouteKind, parseHistoryRouteKind, type HistoryFilter } from '../src/features/history/services.ts';
import type { HistoricalKind, HistorySessionRow } from '../src/data/repositories/history.ts';
import type { BindValue } from '../src/data/database.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';

const seed=(name:string)=>seedExercises.find(exercise=>exercise.name===name)!.id;
const app=(c:ReturnType<typeof connect>)=>createApplicationServices(createRepositories(c.db,c.store.now));
async function setup(t:TestContext){const c=connect();t.after(()=>c.sqlite.close());await initializeDatabase(c.db);return {...c,app:app(c)};}
async function workout(c:ReturnType<typeof connect>,status:'COMPLETE'|'INCOMPLETE'='COMPLETE',type:'UK_HAMS'|'OK_RUECKEN'='UK_HAMS'){
 const id=await app(c).workout.start({workoutType:type,powerExerciseId:seed('Box Jump'),strengthA:seed('Bench Press'),strengthB:seed('Pull-Up'),rounds:3,stations:[{role:'FOCUS',exerciseId:seed('Goblet Squat')},{role:'CORE',exerciseId:seed('Hanging Leg Raise')}]});
 if(status==='COMPLETE'){await completeSections(c,id);await app(c).completion.finish(id,'CONTINUE_CYCLE_NORMALLY');}
 else {
  await c.workouts.savePowerProgress(id,2,'IN_PROGRESS');const rows=await c.workouts.strength(id);
  await c.workouts.saveSet(rows[0].id,1,80,8,2);await c.workouts.saveSet(rows[0].id,3,80,6,1);await c.workouts.saveSet(rows[1].id,2,10,7,1);
  await c.workouts.saveCircuitProgress(id,2,2,'IN_PROGRESS');await app(c).workout.endIncomplete(id);
 }
 return id;
}
async function power(c:ReturnType<typeof connect>,status:'COMPLETE'|'INCOMPLETE'='COMPLETE'){
 const id=await c.benchmarks.startPower({rotation:4,chest:5,shotPut:3});
 if(status==='COMPLETE')await completePowerData(c,id);
 else {const data=await c.benchmarks.power(id);const broad=data.tests.find(test=>test.test_type==='STANDING_BROAD_JUMP')!;await c.benchmarks.savePowerAttempt(broad.id,1,218);const left=data.tests.find(test=>test.test_type==='ROTATIONAL_THROW'&&test.side==='LEFT')!;await c.benchmarks.savePowerAttempt(left.id,2,305);}
 await c.benchmarks.finish('power',id,status);return id;
}
async function circuit(c:ReturnType<typeof connect>,status:'COMPLETE'|'INCOMPLETE'='COMPLETE'){
 const id=await c.benchmarks.startCircuit({bodyweight_kg_snapshot:80,goblet_squat_load_kg:20,kettlebell_swing_load_kg:24,pullup_added_load_kg:10});
 if(status==='COMPLETE')await completeCircuitData(c,id);
 else {await c.benchmarks.advanceCircuit(id,{round:1,station:1},0);await c.benchmarks.advanceCircuit(id,{round:1,station:2},10);}
 await c.benchmarks.finish('circuit',id,status);return id;
}
async function mixed(c:ReturnType<typeof connect>){return [await workout(c),await workout(c,'INCOMPLETE','OK_RUECKEN'),await power(c),await power(c,'INCOMPLETE'),await circuit(c),await circuit(c,'INCOMPLETE')];}
function metadata(change:Partial<HistorySessionRow>={}):HistorySessionRow{return {kind:'WORKOUT',id:'session',status:'COMPLETE',workout_type:'UK_HAMS',started_at:'2026-10-20T08:00:00Z',completed_at:'2026-10-20T09:00:00Z',created_at:'2026-10-20T08:00:00Z',...change};}

async function databaseState(c:ReturnType<typeof connect>){
 const names=c.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row=>row.name as string);
 return names.map(name=>({name,rows:c.sqlite.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()}));
}

test('empty History returns empty data, with no synthetic bodyweight or Rest events',async t=>{
 const c=await setup(t);await c.app.settings.updateBodyweight('80');await c.cycle.save(3);await c.app.home.completeRest(3);assert.deepEqual(await c.app.history.list(),[]);
});

test('all six terminal session variants share one newest-first timeline with actual workout types',async t=>{
 const c=await setup(t);const ids=await mixed(c);const history=await c.app.history.list();assert.deepEqual(history.map(entry=>entry.id),[...ids].reverse());
 assert.deepEqual(history.map(entry=>entry.kind),['CIRCUIT_BENCHMARK','CIRCUIT_BENCHMARK','POWER_BENCHMARK','POWER_BENCHMARK','WORKOUT','WORKOUT']);
 assert.deepEqual(history.map(entry=>entry.status),['INCOMPLETE','COMPLETE','INCOMPLETE','COMPLETE','INCOMPLETE','COMPLETE']);assert.equal(history[4].title,'OK Rücken');
});

test('timeline sorts globally by end time, not by kind or original start order',async t=>{
 const c=await setup(t);const ids=await mixed(c);const dates=['2026-10-25T14:00:00Z','2026-10-25T18:00:00Z','2026-10-25T16:00:00Z','2026-10-25T12:00:00Z','2026-10-25T17:00:00Z','2026-10-25T15:00:00Z'];
 ids.forEach((id,index)=>c.sqlite.prepare(`UPDATE ${index<2?'workout':index<4?'power_benchmark':'circuit_benchmark'}_sessions SET completed_at=? WHERE id=?`).run(dates[index],id));
 assert.deepEqual((await c.app.history.list()).map(entry=>entry.id),[ids[1],ids[4],ids[2],ids[5],ids[0],ids[3]]);
});

for(const filter of ['ALL','WORKOUT','POWER_BENCHMARK','CIRCUIT_BENCHMARK'] as const)test(`History filter ${filter} preserves chronological order and explicit kinds`,async t=>{
 const c=await setup(t);await mixed(c);const all=await c.app.history.list();const selected=await c.app.history.list(filter);
 assert.equal(selected.length,filter==='ALL'?6:2);assert.deepEqual(selected,filterHistory(all,filter));assert.ok(selected.every(entry=>filter==='ALL'||entry.kind===filter));
});

for(const kind of ['WORKOUT','POWER_BENCHMARK','CIRCUIT_BENCHMARK'] as const)test(`${kind} unfinished rows are excluded and cannot be opened through a historical route`,async t=>{
 const c=await setup(t);let id:string;
 if(kind==='WORKOUT')id=await c.workouts.create('UK_HAMS');else if(kind==='POWER_BENCHMARK')id=await c.benchmarks.startPower({rotation:4,chest:5,shotPut:3});else id=await c.benchmarks.startCircuit({bodyweight_kg_snapshot:80,goblet_squat_load_kg:20,kettlebell_swing_load_kg:24,pullup_added_load_kg:0});
 assert.deepEqual(await c.app.history.list(),[]);await assert.rejects(c.app.history.detail(kind,id),error=>error instanceof FeatureError&&/noch nicht beendet/.test(error.message));
});

test('date policy prefers end, falls back to start/creation, handles timezone offsets and never fabricates an unknown date',()=>{
 const ended=historyEntry(metadata());assert.equal(ended.date,'2026-10-20T09:00:00Z');
 assert.equal(historyEntry(metadata({completed_at:null})).date,'2026-10-20T08:00:00Z');
 assert.equal(historyEntry(metadata({completed_at:'invalid',started_at:''})).date,'2026-10-20T08:00:00Z');
 const missing=historyEntry(metadata({completed_at:null,started_at:'',created_at:''}));assert.equal(missing.date,null);assert.equal(formatHistoryDate(missing.date),'Datum nicht verfügbar');
 const zone=historyEntry(metadata({id:'zone',completed_at:'2026-10-20T12:00:00+02:00'}));assert.equal(sortHistory([ended,zone])[0].id,'zone');
 assert.equal(sortHistory([missing,ended])[1].date,null);assert.doesNotMatch(formatHistoryDate(ended.date),/T09:00|2026-10-20T/);
});

test('identical session IDs in different tables remain distinct and ties sort deterministically',()=>{
 const entries=(['WORKOUT','POWER_BENCHMARK','CIRCUIT_BENCHMARK'] as const).map(kind=>historyEntry(metadata({kind})));
 assert.equal(new Set(entries.map(entry=>entry.key)).size,3);assert.deepEqual(sortHistory(entries),sortHistory([...entries].reverse()));
 assert.deepEqual(entries.map(entry=>parseHistoryRouteKind(historyRouteKind(entry.kind))),entries.map(entry=>entry.kind));
});

test('fallback dates handle old Incomplete benchmark data with no end timestamp',async t=>{
 const c=await setup(t);const id=await power(c,'INCOMPLETE');c.sqlite.prepare('UPDATE power_benchmark_sessions SET completed_at=NULL WHERE id=?').run(id);
 const entry=(await c.app.history.list())[0];assert.equal(entry.date,(await c.benchmarks.power(id)).session.started_at);assert.equal(entry.endedAt,null);
});

test('compact overview uses one metadata query for 600 sessions and never loads child records',async t=>{
 const c=await setup(t);const insert=c.sqlite.prepare("INSERT INTO workout_sessions (id,workout_type,expected_cycle_position,expected_workout_type,was_manual_override,status,started_at,created_at,updated_at) VALUES (?,'UK_HAMS',1,'UK_HAMS',0,'INCOMPLETE',?,?,?)");
 for(let i=0;i<600;i++){const at=new Date(Date.parse('2026-01-01T12:00:00Z')+i*60000).toISOString();insert.run(`history-${i}`,at,at,at);}
 const all=c.db.getAllAsync;const first=c.db.getFirstAsync;let queries=0;
 c.db.getAllAsync=async<T>(sql:string,...params:BindValue[])=>{queries++;assert.doesNotMatch(sql,/strength_sets|workout_power_sections|workout_circuit_stations|power_benchmark_attempts|circuit_benchmark_round_results/);return all<T>(sql,...params);};
 c.db.getFirstAsync=async<T>(sql:string,...params:BindValue[])=>{queries++;return first<T>(sql,...params);};
 const rows=await c.app.history.list();assert.equal(rows.length,600);assert.equal(rows[0].id,'history-599');assert.equal(queries,1);
});

test('complete workout detail exposes both saved exercises, all sets and domain-derived metrics from historical bodyweight',async t=>{
 const c=await setup(t);await c.app.settings.updateBodyweight('80');const id=await workout(c);const detail=await c.app.history.detail('WORKOUT',id);assert.equal(detail.kind,'WORKOUT');if(detail.kind!=='WORKOUT')return;
 assert.equal(detail.entry.status,'COMPLETE');assert.equal(detail.data.power?.completed_set_count,4);assert.equal(detail.data.strength.length,2);
 for(const row of detail.data.strength){assert.equal(row.sets.length,4);assert.deepEqual(row.sets.map(set=>[set.set_number,set.weight_kg,set.reps,set.rir]),[[1,100,8,2],[2,100,8,2],[3,100,8,2],[4,100,8,2]]);assert.equal(row.volume,3200);assert.equal(row.e1rm,100*(1+10/30));assert.equal(row.relativeE1rm,row.e1rm!/80);}
 assert.equal(detail.data.circuit?.section.status,'COMPLETE');assert.equal(detail.data.session.bodyweight_snapshot_kg,80);
});

test('incomplete workout detail includes only its actual set numbers and partial section progress',async t=>{
 const c=await setup(t);const id=await workout(c,'INCOMPLETE','OK_RUECKEN');const detail=await c.app.history.detail('WORKOUT',id);if(detail.kind!=='WORKOUT')throw new Error('Expected workout');
 assert.equal(detail.entry.title,'OK Rücken');assert.equal(detail.entry.status,'INCOMPLETE');assert.equal(detail.data.power?.completed_set_count,2);
 assert.deepEqual(detail.data.strength[0].sets.map(set=>set.set_number),[1,3]);assert.equal(detail.data.strength[0].exercise.is_complete,0);assert.equal(detail.data.strength[0].volume,1120);assert.equal(detail.data.strength[0].e1rm,80*(1+10/30));
 assert.deepEqual(detail.data.strength[1].sets.map(set=>set.set_number),[2]);assert.equal(detail.data.circuit?.section.current_round,2);assert.equal(detail.data.circuit?.section.current_station_position,2);
 assert.deepEqual(detail.data.circuit?.stations.map(station=>[station.position,station.role,station.exercise_name_snapshot]),[[1,'FOCUS','Goblet Squat'],[2,'CORE','Hanging Leg Raise']]);
 assert.equal(detail.data.circuit?.section.round_count,3);assert.equal(detail.data.circuit?.section.station_duration_seconds,60);
});

test('a terminal workout with missing legacy sections renders empty data without invented sets or defaults',async t=>{
 const c=await setup(t);const id=await c.workouts.create('UK_HAMS');await c.workouts.setStatus(id,'INCOMPLETE');const detail=await c.app.history.detail('WORKOUT',id);if(detail.kind!=='WORKOUT')throw new Error('Expected workout');
 assert.equal(detail.data.power,null);assert.equal(detail.data.circuit,null);assert.deepEqual(detail.data.strength,[]);
});

test('a saved Strength selection with no sets has zero volume and no invented e1RM',async t=>{
 const c=await setup(t);const id=await c.workouts.create('UK_HAMS');await c.workouts.selectStrength(id,'A',seed('Bench Press'));await c.workouts.setStatus(id,'INCOMPLETE');
 const detail=await c.app.history.detail('WORKOUT',id);if(detail.kind!=='WORKOUT')throw new Error('Expected workout');assert.equal(detail.data.strength[0].volume,0);assert.equal(detail.data.strength[0].e1rm,null);assert.equal(detail.data.strength[0].relativeE1rm,null);
});

test('history never substitutes current Profile or Library load mode for missing historical strength information',async t=>{
 const c=await setup(t);const id=await workout(c);const first=await c.app.history.detail('WORKOUT',id);await c.app.settings.updateBodyweight('75');
 const exercise=await c.exercises.get(seed('Bench Press'));await c.exercises.update(exercise.id,{...exercise,load_mode:'BODYWEIGHT_PLUS_EXTERNAL'});
 const after=await c.app.history.detail('WORKOUT',id);assert.deepEqual(after,first);if(after.kind!=='WORKOUT')throw new Error('Expected workout');assert.equal(after.data.strength[0].relativeE1rm,null);assert.equal('relativeStrength' in after.data.strength[0],false);
});

test('later Profile changes cannot alter historical Relative e1RM or Bodyweight snapshots',async t=>{
 const c=await setup(t);await c.app.settings.updateBodyweight('82.5');const id=await workout(c);const before=await c.app.history.detail('WORKOUT',id);await c.app.settings.updateBodyweight('70');
 assert.deepEqual(await c.app.history.detail('WORKOUT',id),before);
});

for(const decision of ['CONTINUE_CYCLE_NORMALLY','COUNT_AS_CURRENT_CYCLE_WORKOUT'] as const)test(`history preserves actual workout type and stored ${decision} without consulting today's cycle`,async t=>{
 const c=await setup(t);const id=await c.app.workout.start({workoutType:'OK_RUECKEN',powerExerciseId:seed('Box Jump'),strengthA:seed('Bench Press'),strengthB:seed('Pull-Up'),rounds:1,stations:[{role:'FOCUS',exerciseId:seed('Goblet Squat')}]});await completeSections(c,id);await c.app.completion.finish(id,decision);await c.cycle.save(4);
 const detail=await c.app.history.detail('WORKOUT',id);if(detail.kind!=='WORKOUT')throw new Error('Expected workout');assert.equal(detail.entry.title,'OK Rücken');assert.equal(detail.data.session.cycle_override_decision,decision);assert.equal(detail.data.session.expected_cycle_position,1);assert.equal((await c.cycle.get()).current_position,4);
});

test('matching workout detail does not invent a cycle override',async t=>{
 const c=await setup(t);const id=await workout(c);const detail=await c.app.history.detail('WORKOUT',id);if(detail.kind!=='WORKOUT')throw new Error('Expected workout');assert.equal(detail.data.session.cycle_override_decision,null);
});

test('renaming/deactivating Library exercises and replacing thumbnails never changes workout snapshots',async t=>{
 const c=await setup(t);const source=await c.exercises.get(seed('Bench Press'));await c.exercises.update(source.id,{...source,thumbnail_uri:'file:///historic-image.png'});const id=await workout(c);const before=await c.app.history.detail('WORKOUT',id);
 for(const name of ['Box Jump','Bench Press','Pull-Up','Goblet Squat']){const exercise=await c.exercises.get(seed(name));await c.exercises.update(exercise.id,{...exercise,name:`Changed ${name}`,thumbnail_uri:'file:///replacement.png',areas:['CIRCUIT'],effects:['CONDITIONING']});await c.exercises.setActive(exercise.id,false);}
 assert.deepEqual(await c.app.history.detail('WORKOUT',id),before);if(before.kind!=='WORKOUT')throw new Error('Expected workout');assert.equal(before.data.strength[0].exercise.thumbnail_uri_snapshot,'file:///historic-image.png');
});

for(const status of ['COMPLETE','INCOMPLETE'] as const)test(`${status} Power detail uses captured weights, actual attempts and independent side bests`,async t=>{
 const c=await setup(t);const id=await power(c,status);const detail=await c.app.history.detail('POWER_BENCHMARK',id);if(detail.kind!=='POWER_BENCHMARK')throw new Error('Expected Power');
 assert.equal(detail.entry.status,status);assert.deepEqual(detail.data.groups.map(group=>group.test?.medicine_ball_weight_kg),[null,4,4,5,3,3]);assert.deepEqual(detail.data.groups.map(group=>group.side),['NONE','LEFT','RIGHT','NONE','LEFT','RIGHT']);
 assert.equal(detail.data.attempts.length,status==='COMPLETE'?18:2);assert.equal(detail.data.groups.reduce((sum,group)=>sum+group.attempts.length,0),detail.data.attempts.length);
 if(status==='COMPLETE'){assert.equal(detail.data.groups[0].best,203);assert.ok(detail.data.groups.every(group=>group.attempts.length===3));}
 else {assert.equal(detail.data.groups[0].best,218);assert.equal(detail.data.groups[1].best,305);assert.equal(detail.data.groups[2].best,null);assert.deepEqual(detail.data.groups[1].attempts.map(attempt=>attempt.attempt_number),[2]);}
});

for(const status of ['COMPLETE','INCOMPLETE'] as const)test(`${status} Circuit detail reuses snapshot-based volumes and distinguishes zero reps from missing rounds`,async t=>{
 const c=await setup(t);const id=await circuit(c,status);const detail=await c.app.history.detail('CIRCUIT_BENCHMARK',id);if(detail.kind!=='CIRCUIT_BENCHMARK')throw new Error('Expected Circuit');
 assert.equal(detail.entry.status,status);assert.equal(detail.data.session.bodyweight_kg_snapshot,80);assert.deepEqual(detail.data.stations.map(station=>station.effective_weight_kg),[20,80,24,90,80,80]);assert.equal(detail.data.breakdown.length,6);assert.ok(detail.data.breakdown.every(row=>row.rounds.length===5));
 if(status==='COMPLETE'){assert.equal(detail.data.results.length,30);assert.equal(detail.data.totalVolume,18700);assert.equal(detail.data.relativePerformance,233.75);assert.deepEqual(detail.data.breakdown.map(row=>row.volume),[1000,4000,1200,4500,4000,4000]);}
 else {assert.equal(detail.data.results.length,2);assert.equal(detail.data.breakdown[0].rounds[0]?.reps,0);assert.equal(detail.data.breakdown[0].rounds[1],null);assert.equal(detail.data.totalVolume,800);assert.equal(detail.data.relativePerformance,10);}
});

test('later Bodyweight, Library names/images and inactivity cannot change historical Circuit Benchmark metrics',async t=>{
 const c=await setup(t);const id=await circuit(c);const before=await c.app.history.detail('CIRCUIT_BENCHMARK',id);await c.app.settings.updateBodyweight('70');const exercise=await c.exercises.get(seed('Goblet Squat'));await c.exercises.update(exercise.id,{...exercise,name:'Renamed Goblet',thumbnail_uri:'file:///new.png'});await c.exercises.setActive(exercise.id,false);
 assert.deepEqual(await c.app.history.detail('CIRCUIT_BENCHMARK',id),before);
});

test('history detail lookups never read current Profile Cycle or Exercise Library rows',async t=>{
 const c=await setup(t);const ids=await mixed(c);const first=c.db.getFirstAsync;const all=c.db.getAllAsync;
 c.db.getFirstAsync=async<T>(sql:string,...params:BindValue[])=>{assert.doesNotMatch(sql,/FROM (profile|cycle_state|exercises)\b/i);return first<T>(sql,...params);};
 c.db.getAllAsync=async<T>(sql:string,...params:BindValue[])=>{assert.doesNotMatch(sql,/FROM (profile|cycle_state|exercises)\b/i);return all<T>(sql,...params);};
 for(const [index,id] of ids.entries())await c.app.history.detail(index<2?'WORKOUT':index<4?'POWER_BENCHMARK':'CIRCUIT_BENCHMARK',id);
});

test('overview and every detail are SELECT-only and leave every persisted table, due state and cycle unchanged',async t=>{
 const c=await setup(t);await mixed(c);const before=await databaseState(c);const due=await c.app.benchmarks.dashboard();const changes=c.sqlite.prepare('SELECT total_changes() AS n').get()?.n;
 c.db.runAsync=async()=>{throw new Error('History must not mutate');};c.db.execAsync=async()=>{throw new Error('History must not execute DDL');};c.db.withTransactionAsync=async()=>{throw new Error('History must not begin a write transaction');};
 const rows=await c.app.history.list();for(const row of rows)await c.app.history.detail(row.kind,row.id);assert.deepEqual(await databaseState(c),before);assert.equal(c.sqlite.prepare('SELECT total_changes() AS n').get()?.n,changes);assert.deepEqual(await c.app.benchmarks.dashboard(),due);
});

test('terminal mutation guards still reject changes after reading History',async t=>{
 const c=await setup(t);const id=await workout(c);const data=await c.app.history.detail('WORKOUT',id);if(data.kind!=='WORKOUT')throw new Error('Expected workout');
 await assert.rejects(c.workouts.saveSet(data.data.strength[0].exercise.id,1,1,1,1));await assert.rejects(c.workouts.restart(id,'POWER'));await assert.rejects(c.workouts.restart(id,'STRENGTH'));await assert.rejects(c.workouts.restart(id,'CIRCUIT'));assert.deepEqual(await c.app.history.detail('WORKOUT',id),data);
});

for(const kind of ['WORKOUT','POWER_BENCHMARK','CIRCUIT_BENCHMARK'] as const)test(`missing ${kind} detail is a readable not-found state`,async t=>{
 const c=await setup(t);await assert.rejects(c.app.history.detail(kind,'missing'),error=>error instanceof FeatureError&&error.message==='Training nicht gefunden.');
});

test('explicit kind lookup does not guess another type from an existing session ID or title',async t=>{
 const c=await setup(t);const id=await power(c);await assert.rejects(c.app.history.detail('WORKOUT',id),FeatureError);await assert.rejects(c.app.history.detail('CIRCUIT_BENCHMARK',id),FeatureError);
 assert.throws(()=>parseHistoryRouteKind('Power Benchmark'),FeatureError);await assert.rejects(c.app.history.list('unknown' as HistoryFilter),FeatureError);await assert.rejects(c.app.history.detail('unknown' as HistoricalKind,id),FeatureError);
});

test('overview and all detail types survive actual file-backed close/reopen without navigation state',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'training-history-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=join(dir,'app.db');let c=connect(filename);
 try {await initializeDatabase(c.db);await mixed(c);const list=await app(c).history.list();const details=[];for(const entry of list)details.push(await app(c).history.detail(entry.kind,entry.id));c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);
  assert.deepEqual(await app(c).history.list(),list);for(const [index,entry] of list.entries())assert.deepEqual(await app(c).history.detail(entry.kind,entry.id),details[index]);
 }finally{c.sqlite.close();}
});

test('new completion/incomplete sessions appear immediately while Home latest workout, cycle and Strength PRs remain intact',async t=>{
 const c=await setup(t);const complete=await workout(c);let list=await c.app.history.list();assert.equal(list[0].id,complete);assert.equal((await c.app.home.load()).latest?.id,complete);
 const incomplete=await workout(c,'INCOMPLETE','OK_RUECKEN');list=await c.app.history.list();assert.equal(list[0].id,incomplete);assert.equal((await c.app.home.load()).latest?.id,incomplete);assert.equal((await c.cycle.get()).current_position,2);
 assert.equal(calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press'))),3200);
});

test('technical query failures use the generic error strategy and a retry can load the timeline',async t=>{
 const c=await setup(t);const original=c.db.getAllAsync;let failing=true;c.db.getAllAsync=async<T>(sql:string,...params:BindValue[])=>{if(failing)throw new Error('SQLITE private details');return original<T>(sql,...params);};
 const log=console.error;console.error=()=>{};try{await assert.rejects(c.app.history.list(),error=>!userMessage(error).includes('SQLITE'));failing=false;assert.deepEqual(await c.app.history.list(),[]);}finally{console.error=log;}
});
