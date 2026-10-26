import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connect } from './support/sqlite.ts';
import { completeSections } from './support/completion.ts';
import { initializeDatabase } from '../src/data/initialize.ts';
import { seedExercises } from '../src/data/seed.ts';
import { createRepositories } from '../src/data/repositories/index.ts';
import { createApplicationServices, FeatureError, userMessage } from '../src/features/application/services.ts';
import { emptyExercise, exerciseDraft, exerciseOrigin, filterExercises, type ExerciseDraft } from '../src/features/exercises/services.ts';
import { chooseExerciseImage } from '../src/features/exercises/images.ts';
import { exerciseOptions } from '../src/features/workout/builder.ts';
import { calculateStrengthBenchmark } from '../src/domain/strength/calculations.ts';
import type { ExerciseInput } from '../src/data/types.ts';

const seed = (name: string) => seedExercises.find(e => e.name === name)!.id;
const app = (c: ReturnType<typeof connect>) => createApplicationServices(createRepositories(c.db,c.store.now));
const draft = (change: Partial<ExerciseDraft> = {}): ExerciseDraft => ({ ...emptyExercise(), name: 'Custom Push', areas: ['STRENGTH'], effects: ['UPPER_PUSH'], ...change });
async function setup(t: TestContext) {
  const c=connect(); t.after(()=>c.sqlite.close()); await initializeDatabase(c.db); return {...c,app:app(c)};
}
async function create(c: Awaited<ReturnType<typeof setup>>, change: Partial<ExerciseDraft> = {}) { return c.app.exercises.createCommand().submit(draft(change)); }
async function start(c: ReturnType<typeof connect>, exerciseId=seed('Bench Press')) {
  return app(c).workout.start({workoutType:'OK_BRUST',powerExerciseId:seed('Box Jump'),strengthA:exerciseId,strengthB:seed('Pull-Up'),rounds:1,stations:[{role:'FOCUS',exerciseId}]});
}

test('Library includes all seeds and inactive rows while regular selection excludes inactive exercises',async t=>{
  const c=await setup(t); await c.app.exercises.setActive(seed('Bench Press'),false);
  const library=await c.app.exercises.library();assert.equal(library.length,29);assert.equal(library.find(e=>e.id===seed('Bench Press'))?.is_active,false);
  assert.equal((await c.exercises.list()).some(e=>e.id===seed('Bench Press')),false);
});

for(const query of ['bench','BENCH','press','  Bench  ']) {
  test(`Library name search handles ${JSON.stringify(query)} case and whitespace`,async t=>{
    const c=await setup(t);const rows=filterExercises(await c.app.exercises.library(),query,null,null);
    assert.ok(rows.some(e=>e.id===seed('Bench Press')));assert.ok(rows.every(e=>e.name.toLowerCase().includes(query.trim().toLowerCase())));
  });
}

test('Library supports combined name, Area and Effect filters without duplicating multi-taxonomy exercises',async t=>{
  const c=await setup(t);const rows=await c.app.exercises.library();
  for(const area of ['POWER','CIRCUIT',null] as const) assert.ok(filterExercises(rows,'swing',area,'CONDITIONING').some(e=>e.id===seed('Kettlebell Swing')));
  assert.equal(filterExercises(rows,'swing','STRENGTH',null).length,0);
  assert.equal(filterExercises(rows,'swing','POWER','UPPER_PULL').length,0);
  assert.equal(filterExercises(rows,'swing',null,null).length,1);
});

test('unmatched filters return an empty list without changing the source library',async t=>{
  const c=await setup(t);const library=await c.app.exercises.library();const before=structuredClone(library);
  assert.deepEqual(filterExercises(library,'nothing matches','STRENGTH','CORE'),[]);assert.deepEqual(library,before);
});

test('custom create trims name, starts active and retains multiple Areas and Effects',async t=>{
  const c=await setup(t);const id=await create(c,{name:'  Custom Swing  ',areas:['POWER','CIRCUIT'],effects:['LOWER_POSTERIOR','CONDITIONING']});
  const exercise=await c.app.exercises.get(id);assert.equal(exercise.name,'Custom Swing');assert.equal(exercise.is_active,true);
  assert.deepEqual(new Set(exercise.areas),new Set(['POWER','CIRCUIT']));assert.deepEqual(new Set(exercise.effects),new Set(['LOWER_POSTERIOR','CONDITIONING']));
  assert.equal(exercise.thumbnail_uri,null);assert.equal(exerciseOrigin(id),'Eigene Übung');assert.equal((await c.app.exercises.library()).length,30);
});

test('origin recognition uses stable seed identity even after renaming a predefined exercise',async t=>{
  const c=await setup(t);const row=await c.exercises.get(seed('Bench Press'));await c.app.exercises.update(row.id,draft({name:'Renamed Seed'}));
  assert.equal(exerciseOrigin(row.id),'Vordefiniert');const custom=await create(c,{name:'Bench Press'});assert.equal(exerciseOrigin(custom),'Eigene Übung');
});

test('identical names are legal for intentional independent Create forms',async t=>{
  const c=await setup(t);const a=await create(c);const b=await create(c);assert.notEqual(a,b);assert.equal((await c.app.exercises.library()).length,31);
});

for(const [label,change] of [
  ['empty name',{name:''}],['whitespace name',{name:'   '}],['no Area',{areas:[]}],['no Effect',{effects:[]}],
  ['unknown Area',{areas:['MUSCLE']}],['unknown Effect',{effects:['EQUIPMENT']}],
  ['invalid status',{active:'yes'}],['embedded image bytes',{thumbnailUri:'data:image/png;base64,AAAA'}],['temporary blob URI',{thumbnailUri:'blob:temporary'}],
] as const) {
  test(`invalid form rejects ${label} before creating or changing any row`,async t=>{
    const c=await setup(t);const before=await c.app.exercises.library();const invalid={...draft(),...change} as ExerciseDraft;
    await assert.rejects(c.app.exercises.createCommand().submit(invalid),FeatureError);
    await assert.rejects(c.app.exercises.update(seed('Bench Press'),invalid),FeatureError);
    assert.deepEqual(await c.app.exercises.library(),before);
  });
}

test('repository independently rejects invalid taxonomy and status for bypass callers',async t=>{
  const c=await setup(t);const input:ExerciseInput={name:' Invalid ',areas:['STRENGTH'],effects:['UPPER_PUSH'],load_mode:'EXTERNAL_ONLY'};
  for(const bad of [{...input,name:' '},{...input,areas:['UNKNOWN']},{...input,effects:['UNKNOWN']},{...input,load_mode:'UNKNOWN'}]) {
    await assert.rejects(c.exercises.create(bad as ExerciseInput),RangeError);
    await assert.rejects(c.exercises.update(seed('Bench Press'),bad as ExerciseInput),RangeError);
  }
  await assert.rejects(c.exercises.setActive(seed('Bench Press'),'true' as unknown as boolean),RangeError);
  assert.equal((await c.app.exercises.library()).length,29);
});

test('edit keeps ID, creation timestamp and technical load semantics, while updating all editable fields atomically',async t=>{
  const c=await setup(t);const before=await c.exercises.get(seed('Pull-Up'));
  await c.app.exercises.update(before.id,draft({name:'  New Pull  ',areas:['POWER','CIRCUIT'],effects:['UPPER_PULL','CONDITIONING'],thumbnailUri:'file:///app/new.png',active:false}));
  const after=await c.exercises.get(before.id);assert.equal(after.id,before.id);assert.equal(after.created_at,before.created_at);assert.equal(after.load_mode,'BODYWEIGHT_PLUS_EXTERNAL');
  assert.equal(after.name,'New Pull');assert.equal(after.thumbnail_uri,'file:///app/new.png');assert.equal(after.is_active,false);assert.equal(after.areas.length,2);assert.equal(after.effects.length,2);
  assert.equal((await c.exercises.list(true)).length,29);
});

test('failed taxonomy update rolls back name image status and taxonomy together',async t=>{
  const c=await setup(t);const before=await c.exercises.get(seed('Bench Press'));
  c.sqlite.exec("CREATE TRIGGER reject_taxonomy BEFORE INSERT ON exercise_effects BEGIN SELECT RAISE(ABORT,'injected taxonomy failure'); END;");
  await assert.rejects(c.app.exercises.update(before.id,draft({name:'Changed',thumbnailUri:'file:///app/change.png',active:false})),/injected/);
  assert.deepEqual(await c.exercises.get(before.id),before);
});

test('double submission shares one in-flight creation and replays the successful ID without a second insert',async t=>{
  const c=await setup(t);const command=c.app.exercises.createCommand();
  const first=command.submit(draft());const second=command.submit(draft());assert.equal(first,second);
  const [a,b]=await Promise.all([first,second]);assert.equal(a,b);assert.equal(await command.submit(draft()),a);
  assert.equal((await c.exercises.list(true)).length,30);
});

test('a failed Create command can retry validation and SQL failures without creating duplicate or partial rows',async t=>{
  const c=await setup(t);const command=c.app.exercises.createCommand();await assert.rejects(command.submit(draft({name:' '})),FeatureError);
  c.sqlite.exec("CREATE TRIGGER reject_create BEFORE INSERT ON exercise_effects WHEN NEW.exercise_id NOT LIKE '10000000%' BEGIN SELECT RAISE(ABORT,'injected create failure'); END;");
  await assert.rejects(command.submit(draft()),/injected/);assert.equal((await c.exercises.list(true)).length,29);
  c.sqlite.exec('DROP TRIGGER reject_create');await command.submit(draft());assert.equal((await c.exercises.list(true)).length,30);
});

test('custom Exercise is immediately recommended and deactivation/reactivation updates new Builder choices',async t=>{
  const c=await setup(t);const id=await create(c);
  let builder=await c.app.workout.builder('OK_BRUST');assert.ok(exerciseOptions(builder.exercises,'STRENGTH','UPPER_PUSH','Custom',false).some(e=>e.id===id));
  await c.app.exercises.setActive(id,false);builder=await c.app.workout.builder('OK_BRUST');assert.equal(builder.exercises.some(e=>e.id===id),false);
  assert.equal((await c.app.exercises.library()).find(e=>e.id===id)?.is_active,false);
  await c.app.exercises.setActive(id,true);builder=await c.app.workout.builder('OK_BRUST');assert.ok(exerciseOptions(builder.exercises,'STRENGTH','UPPER_PUSH','Custom',false).some(e=>e.id===id));
});

test('inactive custom Exercise is excluded even from Show all and a stale Builder cannot start it',async t=>{
  const c=await setup(t);const id=await create(c);const stale=await c.app.workout.builder('OK_BRUST');await c.app.exercises.setActive(id,false);
  assert.equal(exerciseOptions(await c.app.exercises.library(),'POWER',undefined,'Custom',true).length,0);
  await assert.rejects(c.app.workout.start({...stale.draft,powerExerciseId:seed('Box Jump'),strengthA:id,strengthB:seed('Pull-Up'),rounds:1,stations:[{role:'FOCUS',exerciseId:seed('Goblet Squat')}]}),/nicht mehr aktiv/);
  assert.equal(await c.workouts.active(),null);
});

test('last configuration with a deactivated selection is cleared with a warning and never reactivates it',async t=>{
  const c=await setup(t);const id=await create(c);const session=await start(c,id);await c.app.workout.endIncomplete(session);await c.app.exercises.setActive(id,false);
  const builder=await c.app.workout.builder('OK_BRUST');assert.equal(builder.fromPrevious,true);assert.equal(builder.draft.strengthA,null);assert.equal(builder.draft.stations[0].exerciseId,null);
  assert.ok(builder.warnings.length);assert.equal((await c.exercises.get(id)).is_active,false);
});

test('seed restarts preserve user changes to name taxonomy thumbnail and active state with no duplicate seeds',async t=>{
  const c=await setup(t);const id=seed('Bench Press');await c.app.exercises.update(id,draft({name:'Barbell Bench Press',areas:['POWER','CIRCUIT'],effects:['CORE','CONDITIONING'],thumbnailUri:'file:///app/seed.png',active:false}));
  const before=await c.exercises.get(id);await initializeDatabase(c.db);await initializeDatabase(c.db);
  assert.deepEqual(await c.exercises.get(id),before);assert.equal((await c.exercises.list(true)).length,29);
});

test('custom create edit and both activation states survive actual file-backed close/reopen',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'exercise-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));const filename=join(directory,'app.db');let c=connect(filename);
  try {
    await initializeDatabase(c.db);const id=await app(c).exercises.createCommand().submit(draft({areas:['POWER','CIRCUIT'],effects:['CORE','CONDITIONING'],thumbnailUri:'exercise-image://11111111-2222-4333-8444-555555555555'}));
    const created=await c.exercises.get(id);c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);assert.deepEqual(await c.exercises.get(id),created);
    await app(c).exercises.update(id,exerciseDraft({...created,name:'Edited Custom',is_active:false}));const edited=await c.exercises.get(id);
    c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);assert.deepEqual(await c.exercises.get(id),edited);assert.equal(edited.is_active,false);
    await app(c).exercises.setActive(id,true);c.sqlite.close();c=connect(filename);await initializeDatabase(c.db);assert.equal((await c.exercises.get(id)).is_active,true);
    assert.equal((await c.exercises.list(true)).length,30);
  } finally { c.sqlite.close(); }
});

for(const status of ['IN_PROGRESS','COMPLETE','INCOMPLETE'] as const) {
  test(`${status} workout snapshots preserve all section names images IDs and strength sets after Library edits/deactivation`,async t=>{
    const c=await setup(t);await c.app.exercises.update(seed('Bench Press'),draft({name:'Original Bench',thumbnailUri:'file:///app/old.png'}));
    const id=await start(c);await completeSections(c,id);
    if(status==='COMPLETE')await c.app.completion.finish(id,'CONTINUE_CYCLE_NORMALLY');
    if(status==='INCOMPLETE')await c.app.workout.endIncomplete(id);
    const before=await c.workouts.completionSnapshot(id);
    await c.app.exercises.update(seed('Bench Press'),draft({name:'New Bench',thumbnailUri:'file:///app/new.png',areas:['CIRCUIT'],effects:['CONDITIONING'],active:false}));
    await c.app.exercises.update(seed('Box Jump'),draft({name:'Renamed Power',thumbnailUri:'file:///app/power.png',active:false}));
    const after=await c.workouts.completionSnapshot(id);assert.deepEqual(after,before);assert.equal(after.strength[0].exercise.exercise_name_snapshot,'Original Bench');
    assert.equal(after.strength[0].exercise.thumbnail_uri_snapshot,'file:///app/old.png');assert.equal(after.circuit!.stations[0].thumbnail_uri_snapshot,'file:///app/old.png');
    assert.equal(calculateStrengthBenchmark(seed('Bench Press'),await c.workouts.performances(seed('Bench Press'))),3200);
  });
}

test('running Circuit keeps Current/Next snapshots and progression after exercise rename deactivate and image removal',async t=>{
  const c=await setup(t);const id=await start(c);await completeSections(c,id);const current=await c.app.circuit.restart(id);let state=await c.app.circuit.start(id,current.section.id);
  await c.app.exercises.update(seed('Bench Press'),draft({name:'Renamed while running',thumbnailUri:null,active:false}));
  const reloaded=await c.app.circuit.load(id);assert.deepEqual(reloaded,state);state=await c.app.circuit.advance(id,state.cursor!);assert.equal(state.complete,true);
});

test('editing thumbnail to null persists removal without touching prior workout snapshot URI',async t=>{
  const c=await setup(t);const id=await create(c,{thumbnailUri:'file:///app/kept.png'});const session=await start(c,id);
  await c.app.exercises.update(id,draft({thumbnailUri:null}));assert.equal((await c.exercises.get(id)).thumbnail_uri,null);
  assert.equal((await c.workouts.strength(session))[0].thumbnail_uri_snapshot,'file:///app/kept.png');
});

test('missing Exercise is mapped to a readable error for loading editing and activation',async t=>{
  const c=await setup(t);for(const operation of [()=>c.app.exercises.get('missing'),()=>c.app.exercises.update('missing',draft()),()=>c.app.exercises.setActive('missing',true)]) await assert.rejects(operation(),error=>error instanceof FeatureError&&/nicht gefunden/.test(error.message));
});

test('cancelled image picker does not persist anything or replace the existing image',async()=>{
  let writes=0;assert.equal(await chooseExerciseImage({async pick(){return null;},async persist(){writes++;return 'file:///app/unused.png';}}),null);assert.equal(writes,0);
});

test('selected image is copied to durable storage before its URI may be saved',async()=>{
  const order:string[]=[];const uri=await chooseExerciseImage({async pick(){order.push('pick');return {uri:'file:///cache/picked.png'};},async persist(image){assert.equal(image.uri,'file:///cache/picked.png');order.push('copy');return 'file:///documents/exercise-images/stable.png';}});
  assert.deepEqual(order,['pick','copy']);assert.equal(uri,'file:///documents/exercise-images/stable.png');
});

for(const failure of ['picker','unavailable','ephemeral'] as const) {
  test(`image ${failure} failure is recoverable and contains no raw file or permission detail`,async()=>{
    await assert.rejects(chooseExerciseImage({async pick(){if(failure==='picker')throw new Error('private permission trace');return {uri:'file:///cache/no.png'};},async persist(){if(failure==='unavailable')throw new Error('private filesystem trace');return 'blob:temporary';}}),error=>error instanceof FeatureError&&!/private|trace/.test(error.message));
  });
}

test('SQLite errors remain generic through the shared userMessage strategy',()=>{
  const original=console.error;console.error=()=>{};try{assert.doesNotMatch(userMessage(new Error('SQLITE private_sql')),/SQLITE|private_sql/);}finally{console.error=original;}
});
