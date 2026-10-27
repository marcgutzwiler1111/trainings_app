import { ProgressSelect } from '../../features/progress/ProgressSelect';
import { useCallback, useState } from 'react';
import { Card, Copy } from '../../components/foundation';
import { useApplication } from '../../features/application/provider';
import { useFocusedResource } from '../../hooks/useFeature';
import { ProgressList, HistoryLink } from '../../features/progress/ProgressList';
import { metric, ProgressChart } from '../../features/progress/ProgressChart';
import { formatHistoryDate } from '../../features/history/services';

export default function CircuitProgressScreen(){
  const {progress}=useApplication();const resource=useFocusedResource(useCallback(()=>progress.circuit(),[progress]));const data=resource.data;
  const [exerciseId,setExerciseId]=useState<string|null>(null);const [sessionId,setSessionId]=useState<string|null>(null);
  const exercise=data?.exercises.find(row=>row.key===exerciseId)??data?.exercises[0];
  const session=data?.sessions.find(row=>row.id===sessionId)??data?.sessions[0];
  return <ProgressList title="Circuit Benchmark Progress" resource={resource} rows={data?.sessions??[]} empty="Noch kein vollständiger Circuit Benchmark vorhanden." header={data&&data.sessions.length>0?<>
    <Copy muted>Nur Complete Benchmarks. Körpergewicht und Loads können zwischen Messungen abweichen; die Bedingungen stehen pro Session in der Liste.</Copy>
    <ProgressChart title="Total Volume" unit="kg" points={data.total}/><ProgressChart title="Relative Performance" unit="" points={data.relative}/>
    <ProgressSelect label="Circuit Exercise" value={exercise?.key??null} options={data.exercises.map(row=>({value:row.key,label:row.name}))} onChange={setExerciseId}/>
    {exercise&&<><ProgressChart title={`${exercise.name} · Total Reps`} unit="reps" points={exercise.reps}/><ProgressChart title={`${exercise.name} · Exercise Volume`} unit="kg" points={exercise.volume}/></>}
    <Copy heading>Round Fatigue</Copy><Copy muted>Gespeicherte Wiederholungen R1–R5; kein Fatigue Score.</Copy>
    <ProgressSelect label="Benchmark Session" value={session?.id??null} options={data.sessions.map((row,index)=>({value:row.id,label:`${formatHistoryDate(row.date,true)} · ${metric.format(row.totalVolume)} kg${index===0?' · Neuester Complete':''}`}))} onChange={setSessionId}/>
    {session?.breakdown.map(row=><Card key={row.station.id}><Copy heading>{row.station.exercise_name_snapshot}</Copy>
      <Copy>Effektives Gewicht: {row.station.effective_weight_kg} kg</Copy>
      {row.rounds.map((result,index)=><Copy key={index}>R{index+1}: {result===null?'Nicht gespeichert':`${result.reps} Reps`}</Copy>)}
    </Card>)}
    <Copy heading>Benchmark Sessions</Copy>
  </>:undefined} render={row=><Card><Copy heading>{formatHistoryDate(row.date,true)}</Copy><Copy>Total Volume: {metric.format(row.totalVolume)} kg</Copy><Copy>Relative Performance: {metric.format(row.relativePerformance)}</Copy>
    <Copy>Körpergewicht: {row.session.bodyweight_kg_snapshot} kg · Goblet: {row.session.goblet_squat_load_kg} kg · KB Swing: {row.session.kettlebell_swing_load_kg} kg · Pull-up Zusatzgewicht: {row.session.pullup_added_load_kg} kg</Copy>
    {row.breakdown.map(item=><Copy key={item.station.id}>{item.station.exercise_name_snapshot}: {item.totalReps} Reps · {metric.format(item.volume)} kg · effektiv {item.station.effective_weight_kg} kg</Copy>)}
    <HistoryLink kind="circuit" id={row.id}/>
  </Card>}/>;
}
