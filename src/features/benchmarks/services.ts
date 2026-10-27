import type { createRepositories } from '../../data/repositories/index.ts';
import { BenchmarkStateError, powerGroups } from '../../data/repositories/benchmark.ts';
import type { BenchmarkRepository } from '../../data/repositories/benchmark.ts';
import { ActiveTrainingError } from '../../data/activeTraining.ts';
import { benchmarkSchedule } from '../../domain/benchmarks/due.ts';
import { arePowerBenchmarksComparable, type PowerTestConditions } from '../../domain/benchmarks/power.ts';
import { bestPowerAttempt, completePowerGroup, powerProgress, powerProtocol, circuitBenchmarkCursor, circuitBenchmarkFormat } from '../../domain/benchmarks/protocol.ts';
import { calculateCircuitTotalVolume, calculateCircuitExerciseVolume, calculateRelativePerformance, calculateCircuitRowVolume } from '../../domain/benchmarks/circuit.ts';
import { nextCircuitPosition } from '../../domain/circuit/progression.ts';
import { integer, positive, nonNegative } from '../../domain/shared/validation.ts';
import { FeatureError } from '../application/errors.ts';
import type { PowerTest } from '../../data/types.ts';

export type BenchmarkKind = 'power' | 'circuit';
export const benchmarkLabels = { power: 'Power Benchmark', circuit: 'Circuit Benchmark' } as const;
export function isBenchmarkKind(value: unknown): value is BenchmarkKind { return value === 'power' || value === 'circuit'; }
export function decimal(text: string, label: string, allowZero = false): number {
  const input = text.trim(); const value = /^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(input) ? Number(input.replace(',', '.')) : NaN;
  try { if (allowZero) nonNegative(value, label); else positive(value, label); }
  catch { throw new FeatureError(`${label}: Bitte eine gültige Zahl ${allowZero ? 'ab 0' : 'größer als 0'} eingeben.`); }
  return value;
}
export function repetitions(text: string): number {
  const value = /^\d+$/.test(text.trim()) ? Number(text.trim()) : NaN;
  try { integer(value, 'reps'); } catch { throw new FeatureError('Bitte Wiederholungen als ganze Zahl ab 0 eingeben.'); }
  return value;
}
export const sideLabels = { LEFT: 'Links', RIGHT: 'Rechts', NONE: 'Ohne Seite' } as const;
function conditions(test: PowerTest): PowerTestConditions {
  if (test.test_type === 'STANDING_BROAD_JUMP') return { testType: test.test_type, side: 'NONE' };
  if (test.test_type === 'CHEST_PASS') return { testType: test.test_type, side: 'NONE', medicineBallWeight: test.medicine_ball_weight_kg! };
  return { testType: test.test_type, side: test.side as 'LEFT' | 'RIGHT', medicineBallWeight: test.medicine_ball_weight_kg! };
}
export function powerView(data: Awaited<ReturnType<BenchmarkRepository['power']>>, previous?: Awaited<ReturnType<BenchmarkRepository['power']>>) {
  const groups = powerGroups(data); const progress = powerProgress(groups);
  return { ...data, ...progress, groups: powerProtocol.flatMap((protocol, testIndex) => protocol.sides.map(side => {
    const test = data.tests.find(test => test.test_type === protocol.testType && test.side === side);
    const group = groups.find(group => group.testType === protocol.testType && group.side === side);
    const best = bestPowerAttempt(group?.attempts.map(attempt => attempt.value) ?? []);
    const old = previous?.tests.find(test => test.test_type === protocol.testType && test.side === side);
    const oldValues = old ? previous!.attempts.filter(attempt => attempt.power_benchmark_test_id === old.id).map(attempt => attempt.value) : [];
    const previousBest = oldValues.length === 3 ? bestPowerAttempt(oldValues) : null;
    let comparison: 'NO_PREVIOUS' | 'INCOMPLETE' | 'NOT_COMPARABLE' | 'COMPARABLE' = 'NO_PREVIOUS';
    let delta: number | null = null;
    if (previousBest !== null && test && old && group) {
      if (!completePowerGroup(group)) comparison = 'INCOMPLETE';
      else if (test.unit !== old.unit || !arePowerBenchmarksComparable(conditions(test), conditions(old))) comparison = 'NOT_COMPARABLE';
      else { comparison = 'COMPARABLE'; delta = best! - previousBest; }
    }
    return { test, label: protocol.label, testIndex, side, best, previousBest, previousBallWeight: old?.medicine_ball_weight_kg ?? null, previousUnit: old?.unit ?? null, comparison, delta,
      attempts: data.attempts.filter(attempt => attempt.power_benchmark_test_id === test?.id) };
  })) };
}
export function circuitBenchmarkView(data: Awaited<ReturnType<BenchmarkRepository['circuit']>>) {
  const { session, stations, results } = data;
  if (stations.length !== circuitBenchmarkFormat.stations || stations.some((station,index)=>station.position !== index+1)) throw new FeatureError('Die gespeicherte Benchmark-Konfiguration ist unvollständig.');
  const cursor = circuitBenchmarkCursor(results.map(row => ({ round: row.round_number, station: row.station_position })));
  const metrics = results.map(row => ({ exercise: stations[row.station_position-1].exercise_key, reps: row.reps, effectiveWeight: stations[row.station_position-1].effective_weight_kg }));
  const totalVolume = calculateCircuitTotalVolume(metrics);
  const next = cursor ? nextCircuitPosition(circuitBenchmarkFormat.rounds,circuitBenchmarkFormat.stations,cursor) : null;
  return { ...data, cursor, ready: cursor === null, totalVolume, relativePerformance: calculateRelativePerformance(totalVolume,session.bodyweight_kg_snapshot),
    current: cursor ? stations[cursor.station-1] : null, next: next ? { ...next, exercise: stations[next.station-1] } : null,
    timerKey: cursor ? `${session.id}/${cursor.round}/${cursor.station}` : null, format: circuitBenchmarkFormat,
    breakdown: stations.map(station => ({ station,
      rounds: Array.from({length:circuitBenchmarkFormat.rounds},(_,i)=>results.find(row=>row.round_number===i+1&&row.station_position===station.position) ?? null),
      totalReps: results.filter(row=>row.station_position===station.position).reduce((sum,row)=>sum+row.reps,0),
      volume: calculateCircuitExerciseVolume(station.exercise_key,metrics),
      rows: results.filter(row=>row.station_position===station.position).map(row=>({...row,volume:calculateCircuitRowVolume(station.effective_weight_kg,row.reps)})),
    })) };
}
export function createBenchmarkServices(repositories: ReturnType<typeof createRepositories>, now: () => number = Date.now) {
  const guarded = async <T,>(task: () => Promise<T>): Promise<T> => {
    try { return await task(); }
    catch (error) {
      if (error instanceof BenchmarkStateError || error instanceof ActiveTrainingError) throw new FeatureError(error.message);
      if (error instanceof RangeError) throw new FeatureError('Diese Benchmark-Werte können nicht verarbeitet werden. Bitte gültige, kleinere Werte verwenden.');
      throw error;
    }
  };
  const dashboard = () => guarded(async () => {
    const [sessions, active] = await Promise.all([repositories.benchmarks.scheduledSessions(),repositories.benchmarks.activeTraining()]);
    const cards = (['power','circuit'] as const).map(kind=>{
      const schedule=benchmarkSchedule(kind==='power'?'POWER':'CIRCUIT',sessions,now());const state=schedule.state;
      const statusLabel=state.status==='NOT_TESTED_YET'?'Noch nicht durchgeführt':state.status==='NOT_DUE'?`Noch ${state.daysRemaining} Tage`:state.daysOverdue?`Fällig · ${state.daysOverdue} Tage überfällig`:'Fällig';
      return {kind,...schedule,statusLabel};
    });
    return {cards,active};
  });
  return {
    dashboard,
    overview: (kind: BenchmarkKind) => guarded(async()=>({...await dashboard(),kind,history:await repositories.benchmarks.history(kind)})),
    setup: (kind: BenchmarkKind) => guarded(async()=> {
      const active=await repositories.benchmarks.activeTraining(); if(active)throw new FeatureError('Bitte die aktive Trainingseinheit über Home fortsetzen oder beenden.');
      return {kind,bodyweight:(await repositories.profile.get()).current_bodyweight_kg};
    }),
    startPower: (draft:{rotation:string;chest:string;shotPut:string})=>guarded(()=>repositories.benchmarks.startPower({rotation:decimal(draft.rotation,'Rotational Throw Ballgewicht'),chest:decimal(draft.chest,'Chest Pass Ballgewicht'),shotPut:decimal(draft.shotPut,'Shot-Put Ballgewicht')})),
    startCircuit: (draft:{bodyweight:string;goblet:string;swing:string;pullup:string})=>guarded(()=>repositories.benchmarks.startCircuit({bodyweight_kg_snapshot:decimal(draft.bodyweight,'Körpergewicht'),goblet_squat_load_kg:decimal(draft.goblet,'Goblet Squat Gewicht',true),kettlebell_swing_load_kg:decimal(draft.swing,'Kettlebell Swing Gewicht',true),pullup_added_load_kg:decimal(draft.pullup,'Pull-up Zusatzgewicht',true)})),
    power: (id:string)=>guarded(async()=>{
      const data=await repositories.benchmarks.power(id);
      const prior=(await repositories.benchmarks.history('power')).filter(session=>session.status==='COMPLETE'&&session.id!==id&&session.completed_at!<=data.session.started_at).sort((a,b)=>b.completed_at!.localeCompare(a.completed_at!))[0];
      return powerView(data,prior?await repositories.benchmarks.power(prior.id):undefined);
    }),
    circuit: (id:string)=>guarded(async()=>circuitBenchmarkView(await repositories.benchmarks.circuit(id))),
    saveAttempt: (id:string,testId:string,n:number,text:string)=>guarded(()=>repositories.benchmarks.saveAttempt(id,testId,n,decimal(text,'Distanz in cm'))),
    advanceCircuit: (id:string,expected:{round:number;station:number},text:string)=>guarded(async()=>circuitBenchmarkView(await repositories.benchmarks.advanceCircuit(id,expected,repetitions(text)))),
    correctCircuit: (id:string,round:number,station:number,text:string)=>guarded(()=>repositories.benchmarks.correctCircuitResult(id,round,station,repetitions(text))),
    finish: (kind:BenchmarkKind,id:string,status:'COMPLETE'|'INCOMPLETE')=>guarded(()=>repositories.benchmarks.finish(kind,id,status)),
  };
}
