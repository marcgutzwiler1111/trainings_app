import type { createRepositories } from '../../data/repositories/index.ts';
import type { ProgressRepository } from '../../data/repositories/progress.ts';
import { calculateE1RM, calculateRelativeE1RM } from '../../domain/strength/calculations.ts';
import { historicalVolumePrs } from '../../domain/strength/history.ts';
import { arePowerBenchmarksComparable, type PowerTestConditions } from '../../domain/benchmarks/power.ts';
import { powerView, circuitBenchmarkView } from '../benchmarks/services.ts';
import { historyEntry } from '../history/services.ts';
import { FeatureError } from '../application/errors.ts';

export interface ProgressPoint {
  id: string; date: string | null; value: number; sourceSessionId: string | null;
  isComplete: boolean; isNewPr?: boolean;
}
/** Absolute timestamp order, with stable identity tie-break; missing dates last. */
export function chronological<T extends { date: string | null; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a,b) => {
    const at = a.date === null ? NaN : Date.parse(a.date); const bt = b.date === null ? NaN : Date.parse(b.date);
    if (!Number.isFinite(at) && Number.isFinite(bt)) return 1;
    if (Number.isFinite(at) && !Number.isFinite(bt)) return -1;
    return (Number.isFinite(at) && Number.isFinite(bt) ? at-bt : 0) || a.id.localeCompare(b.id);
  });
}
function dateOf(session: { id:string; status:string; started_at:string; completed_at:string|null; created_at:string }) {
  return historyEntry({...session,status:session.status as 'COMPLETE'|'INCOMPLETE',kind:'WORKOUT',workout_type:null}).date;
}
export function strengthProgress(rows: Awaited<ReturnType<ProgressRepository['strength']>>) {
  const ordered = chronological(rows.filter(row=>row.sets.length>0).map(row => {
    const e=row.exercise;
    return { ...row,id:e.id,date:dateOf({id:e.workout_session_id,status:e.session_status,started_at:e.started_at,completed_at:e.completed_at,created_at:e.session_created_at}) };
  }));
  const records = historicalVolumePrs(ordered.map(row => ({exerciseId:row.exercise.exercise_id,
    isComplete:row.exercise.is_complete===1&&row.sets.length===4,sets:row.sets.map(set=>({weight:set.weight_kg,reps:set.reps}))})));
  const performances = ordered.map((row,index) => {
    const e1rm=Math.max(...row.sets.map(set=>calculateE1RM(set.weight_kg,set.reps,set.rir)));
    const { exercise }=row; const bodyweight=exercise.bodyweight_snapshot_kg;
    return { ...row,sourceSessionId:exercise.workout_session_id,value:records[index].currentVolume,
      isComplete:exercise.is_complete===1&&row.sets.length===4,isNewPr:row.date!==null&&records[index].isNewPr,
      e1rm,relativeE1rm:bodyweight===null?null:calculateRelativeE1RM(e1rm,bodyweight),benchmark:records[index].newBenchmark };
  });
  const grouped = new Map<string, typeof performances>();
  for(const performance of performances){const id=performance.exercise.exercise_id;const group=grouped.get(id)??[];group.push(performance);grouped.set(id,group);}
  return [...grouped.entries()].map(([id,points])=>{
    const latest=points[points.length-1]; const source=latest.exercise;
    return {id,name:source.library_active===1&&source.library_name?source.library_name:source.exercise_name_snapshot,
      inactive:source.library_active===0,thumbnail:source.thumbnail_uri_snapshot,
      benchmark:latest.benchmark,hasEligible:points.some(point=>point.isComplete),latest,points,sessions:[...points].reverse()};
  }).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
}
function condition(group:ReturnType<typeof powerView>['groups'][number]):PowerTestConditions {
  const test=group.test!;
  if(test.test_type==='STANDING_BROAD_JUMP')return {testType:test.test_type,side:'NONE'};
  if(test.test_type==='CHEST_PASS')return {testType:test.test_type,side:'NONE',medicineBallWeight:test.medicine_ball_weight_kg!};
  return {testType:test.test_type,side:test.side as 'LEFT'|'RIGHT',medicineBallWeight:test.medicine_ball_weight_kg!};
}
export function powerProgressData(rows: Awaited<ReturnType<ProgressRepository['power']>>) {
  const ordered=chronological(rows.filter(row=>row.session.status==='COMPLETE').map(data=>({...powerView(data),id:data.session.id,date:dateOf(data.session)}))).filter(row=>row.ready);
  const series=new Map<string,{id:string;label:string;testType:string;side:'LEFT'|'RIGHT'|'NONE';ballWeight:number|null;unit:string;points:(ProgressPoint&{sourceSessionId:string;delta:number|null;previous:number|null})[];conditions:PowerTestConditions;best:number}>();
  for(const session of ordered)for(const group of session.groups){
    if(!group.test||group.best===null)continue;
    const c=condition(group);const test=group.test;
    const key=JSON.stringify([test.test_type,test.side,test.medicine_ball_weight_kg,test.unit]);
    let row=series.get(key);
    if(!row){row={id:key,label:group.label,testType:test.test_type,side:test.side,ballWeight:test.medicine_ball_weight_kg,unit:test.unit,points:[],conditions:c,best:0};series.set(key,row);}
    const previous=row.points[row.points.length-1];
    const comparable=previous!==undefined&&arePowerBenchmarksComparable(row.conditions,c);
    row.points.push({id:session.id,sourceSessionId:session.id,date:session.date,value:group.best,isComplete:true,
      isNewPr:session.date!==null&&group.best>row.best,previous:comparable?previous.value:null,delta:comparable?group.best-previous.value:null});
    row.best=Math.max(row.best,group.best);
  }
  return [...series.values()];
}
export function circuitProgressData(rows: Awaited<ReturnType<ProgressRepository['circuit']>>) {
  const sessions=chronological(rows.filter(row=>row.session.status==='COMPLETE').map(data=>({...circuitBenchmarkView(data),id:data.session.id,date:dateOf(data.session)}))).filter(row=>row.ready&&row.results.length===30);
  const total=sessions.map(row=>({id:row.id,sourceSessionId:row.id,date:row.date,value:row.totalVolume,isComplete:true}));
  const relative=sessions.map(row=>({id:row.id,sourceSessionId:row.id,date:row.date,value:row.relativePerformance,isComplete:true}));
  const exercises=sessions.length?sessions[sessions.length-1].stations.map(station=>({key:station.exercise_key,name:station.exercise_name_snapshot,
    reps:sessions.flatMap(session=>{const row=session.breakdown.find(row=>row.station.exercise_key===station.exercise_key);return row?[{id:session.id,sourceSessionId:session.id,date:session.date,value:row.totalReps,isComplete:true}]:[];}),
    volume:sessions.flatMap(session=>{const row=session.breakdown.find(row=>row.station.exercise_key===station.exercise_key);return row?[{id:session.id,sourceSessionId:session.id,date:session.date,value:row.volume,isComplete:true}]:[];}),
  })):[];
  return {total,relative,exercises,sessions:[...sessions].reverse()};
}
export function createProgressServices(repositories:ReturnType<typeof createRepositories>){
  async function guarded<T>(task:()=>Promise<T>):Promise<T>{try{return await task();}catch(error){
    if(error instanceof RangeError)throw new FeatureError('Die gespeicherten Messwerte konnten nicht ausgewertet werden.');throw error;
  }}
  return {
    strength:()=>guarded(async()=>strengthProgress(await repositories.progress.strength())),
    strengthDetail:(id:string)=>guarded(async()=>{const result=strengthProgress(await repositories.progress.strength(id))[0];if(!result)throw new FeatureError('Noch keine Daten für diese Übung.');return result;}),
    power:()=>guarded(async()=>powerProgressData(await repositories.progress.power())),
    circuit:()=>guarded(async()=>circuitProgressData(await repositories.progress.circuit())),
    bodyweight:()=>guarded(async()=>{
      const [entries,profile]=await Promise.all([repositories.bodyweight.list(),repositories.profile.get()]);
      const points=chronological(entries.map(row=>({id:row.id,date:row.measured_at,value:row.bodyweight_kg,sourceSessionId:null,sourceEntryId:row.id,isComplete:true})));
      return {current:profile.current_bodyweight_kg,points,entries:[...points].reverse()};
    }),
  };
}
export type ProgressServices=ReturnType<typeof createProgressServices>;
