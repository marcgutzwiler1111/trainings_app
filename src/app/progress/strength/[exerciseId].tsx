import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Card, Copy } from '../../../components/foundation';
import { useApplication } from '../../../features/application/provider';
import { useFocusedResource } from '../../../hooks/useFeature';
import { ProgressList, HistoryLink } from '../../../features/progress/ProgressList';
import { metric, ProgressChart } from '../../../features/progress/ProgressChart';
import { formatHistoryDate } from '../../../features/history/services';
import { FeatureError } from '../../../features/application/errors';

export default function StrengthDetailScreen(){
  const {exerciseId}=useLocalSearchParams<{exerciseId:string}>();const {progress}=useApplication();
  const resource=useFocusedResource(useCallback(async()=>{if(typeof exerciseId!=='string'||!exerciseId)throw new FeatureError('Übung nicht gefunden.');return progress.strengthDetail(exerciseId);},[progress,exerciseId]));
  const data=resource.data;
  return <ProgressList title="Strength Verlauf" resource={resource} rows={data?.sessions??[]} empty="Noch keine Daten für diese Übung." header={data&&<>
    <Copy heading>{data.name}</Copy>{data.inactive&&<Copy>Inactive</Copy>}<Copy>Volume PR: {data.hasEligible?`${metric.format(data.benchmark)} kg`:'Noch kein vollständiger Eintrag'}</Copy>
    <Copy muted>e1RM ist eine Schätzung. Incomplete Übungen zählen nicht als Volume PR.</Copy>
    <ProgressChart title="Volume" unit="kg" points={data.points}/>
    <ProgressChart title="e1RM" unit="kg" points={data.points.map(row=>({...row,value:row.e1rm}))}/>
    <ProgressChart title="Relative e1RM" unit="" points={data.points.flatMap(row=>row.relativeE1rm===null?[]:[{...row,value:row.relativeE1rm}])}/>
    <Copy heading>Session History</Copy>
  </>} render={row=><Card><Copy heading>{formatHistoryDate(row.date,true)}</Copy><Copy>{row.exercise.exercise_name_snapshot}</Copy>
    <Copy>Strength {row.isComplete?'Complete':'Incomplete'} · Workout {row.exercise.session_status==='COMPLETE'?'Complete':'Incomplete'}</Copy>
    <Copy>Volume: {metric.format(row.value)} kg{row.isNewPr?' · Volume PR':''}</Copy><Copy>e1RM: {metric.format(row.e1rm)} kg</Copy>
    <Copy>Relative e1RM: {row.relativeE1rm===null?'Nicht verfügbar':metric.format(row.relativeE1rm)}</Copy>
    {row.exercise.bodyweight_snapshot_kg!==null&&<Copy>Körpergewicht beim Training: {row.exercise.bodyweight_snapshot_kg} kg</Copy>}
    {row.sets.map(set=><Copy key={set.id}>Set {set.set_number} · {set.weight_kg} kg × {set.reps} · RIR {set.rir}</Copy>)}
    <HistoryLink kind="workout" id={row.sourceSessionId}/>
  </Card>}/>;
}
