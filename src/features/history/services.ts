import type { createRepositories } from '../../data/repositories/index.ts';
import type { HistorySessionRow, HistoricalKind, HistoricalStatus } from '../../data/repositories/history.ts';
import { BenchmarkStateError } from '../../data/repositories/benchmark.ts';
import type { BenchmarkSession, WorkoutSession } from '../../data/types.ts';
import { calculateExerciseVolume, calculateE1RM, calculateRelativeE1RM } from '../../domain/strength/calculations.ts';
import { workoutLabels } from '../workout/builder.ts';
import { powerView, circuitBenchmarkView } from '../benchmarks/services.ts';
import { FeatureError } from '../application/errors.ts';

export type HistoryFilter = HistoricalKind | 'ALL';
export const historyFilters: readonly {value:HistoryFilter;label:string}[] = [
  {value:'ALL',label:'Alle'},{value:'WORKOUT',label:'Workouts'},
  {value:'POWER_BENCHMARK',label:'Power Benchmark'},{value:'CIRCUIT_BENCHMARK',label:'Circuit Benchmark'},
];
export interface HistoryEntry {
  id: string; key: string; kind: HistoricalKind; status: HistoricalStatus; title: string;
  date: string | null; timestamp: number | null; startedAt: string | null; endedAt: string | null;
}
function validDate(value: string | null): string | null { return value && Number.isFinite(Date.parse(value)) ? value : null; }
export function historyEntry(row: HistorySessionRow): HistoryEntry {
  const startedAt = validDate(row.started_at); const endedAt = validDate(row.completed_at);
  const date = endedAt ?? startedAt ?? validDate(row.created_at);
  const title = row.kind === 'WORKOUT' ? row.workout_type ? workoutLabels[row.workout_type] : 'Workout' : row.kind === 'POWER_BENCHMARK' ? 'Power Benchmark' : 'Circuit Benchmark';
  return {id:row.id,key:`${row.kind}/${row.id}`,kind:row.kind,status:row.status,title,date,timestamp:date===null?null:Date.parse(date),startedAt,endedAt};
}
export function sortHistory(entries: readonly HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a,b)=>{
    if(a.timestamp!==b.timestamp){if(a.timestamp===null)return 1;if(b.timestamp===null)return -1;return b.timestamp-a.timestamp;}
    const started=(b.startedAt?Date.parse(b.startedAt):0)-(a.startedAt?Date.parse(a.startedAt):0);
    return started||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id);
  });
}
export function filterHistory(entries: readonly HistoryEntry[], filter: HistoryFilter): HistoryEntry[] {
  if(!historyFilters.some(option=>option.value===filter))throw new FeatureError('Unbekannter History-Filter.');
  return entries.filter(entry=>filter==='ALL'||entry.kind===filter);
}
const dateFormat=new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric'});
const timeFormat=new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
export function formatHistoryDate(date:string|null,withTime=false):string {
  return date===null?'Datum nicht verfügbar':(withTime?timeFormat:dateFormat).format(new Date(date));
}
export function historyRouteKind(kind:HistoricalKind):'workout'|'power'|'circuit' {
  switch(kind){case 'WORKOUT':return 'workout';case 'POWER_BENCHMARK':return 'power';case 'CIRCUIT_BENCHMARK':return 'circuit';}
}
export function parseHistoryRouteKind(value:unknown):HistoricalKind {
  if(value==='workout')return 'WORKOUT';if(value==='power')return 'POWER_BENCHMARK';if(value==='circuit')return 'CIRCUIT_BENCHMARK';
  throw new FeatureError('Training nicht gefunden.');
}
function sessionEntry(kind:HistoricalKind,session:BenchmarkSession|WorkoutSession):HistoryEntry {
  if(session.status!=='COMPLETE'&&session.status!=='INCOMPLETE')throw new FeatureError('Dieses Training ist noch nicht beendet. Bitte über Home fortsetzen.');
  return historyEntry({...session,kind,status:session.status,workout_type:'workout_type' in session?session.workout_type:null});
}
export function createHistoryServices(repositories:ReturnType<typeof createRepositories>){
  const guarded=async<T,>(task:()=>Promise<T>):Promise<T>=>{
    try{return await task();}catch(error){
      if(error instanceof BenchmarkStateError)throw new FeatureError('Training nicht gefunden.');
      if(error instanceof RangeError)throw new FeatureError('Die gespeicherten Trainingswerte konnten nicht ausgewertet werden.');
      throw error;
    }
  };
  return {
    list:(filter:HistoryFilter='ALL')=>guarded(async()=>filterHistory(sortHistory((await repositories.history.list()).map(historyEntry)),filter)),
    detail:(kind:HistoricalKind,id:string)=>guarded(async()=>{
      if(kind==='WORKOUT'){
        const snapshot=await repositories.workouts.trainingSnapshot(id);
        if(!snapshot)throw new FeatureError('Training nicht gefunden.');
        const entry=sessionEntry(kind,snapshot.session);
        const circuit=await repositories.workouts.circuit(id);
        const bodyweight=snapshot.session.bodyweight_snapshot_kg;
        const strength=snapshot.strength.map(row=>{
          const volume=calculateExerciseVolume(row.sets.map(set=>({weight:set.weight_kg,reps:set.reps})));
          const e1rm=row.sets.length?Math.max(...row.sets.map(set=>calculateE1RM(set.weight_kg,set.reps,set.rir))):null;
          return {...row,volume,e1rm,relativeE1rm:e1rm!==null&&bodyweight!==null?calculateRelativeE1RM(e1rm,bodyweight):null};
        });
        return {kind:'WORKOUT' as const,entry,data:{...snapshot,strength,circuit}};
      }
      if(kind==='POWER_BENCHMARK'){
        const data=await repositories.benchmarks.power(id);const entry=sessionEntry(kind,data.session);
        return {kind:'POWER_BENCHMARK' as const,entry,data:powerView(data)};
      }
      if(kind==='CIRCUIT_BENCHMARK'){
        const data=await repositories.benchmarks.circuit(id);const entry=sessionEntry(kind,data.session);
        return {kind:'CIRCUIT_BENCHMARK' as const,entry,data:circuitBenchmarkView(data)};
      }
      throw new FeatureError('Training nicht gefunden.');
    }),
  };
}
export type HistoryDetail=Awaited<ReturnType<ReturnType<typeof createHistoryServices>['detail']>>;
