import { useCallback } from 'react';
import { router } from 'expo-router';
import { Button, Card, Copy, ExerciseThumbnail } from '../../../components/foundation';
import { useApplication } from '../../../features/application/provider';
import { useFocusedResource } from '../../../hooks/useFeature';
import { ProgressList } from '../../../features/progress/ProgressList';
import { metric } from '../../../features/progress/ProgressChart';
import { formatHistoryDate } from '../../../features/history/services';

export default function StrengthProgressScreen(){
  const {progress}=useApplication();const resource=useFocusedResource(useCallback(()=>progress.strength(),[progress]));
  return <ProgressList title="Strength Progress" resource={resource} rows={resource.data??[]} empty="Noch keine Strength-Daten vorhanden." render={row=><Card>
    <ExerciseThumbnail uri={row.thumbnail} name={row.name}/><Copy heading>{row.name}</Copy>{row.inactive&&<Copy>Inactive</Copy>}
    <Copy>Volume PR: {row.hasEligible?`${metric.format(row.benchmark)} kg`:'Noch kein vollständiger Eintrag'}</Copy><Copy>Letzte Performance: {metric.format(row.latest.value)} kg · {row.latest.isComplete?'Complete':'Incomplete'}</Copy>
    <Copy>e1RM: {metric.format(row.latest.e1rm)} kg · {formatHistoryDate(row.latest.date)}</Copy>
    <Button secondary label={`Verlauf: ${row.name}`} onPress={()=>router.push({pathname:'/progress/strength/[exerciseId]',params:{exerciseId:row.id}})}/>
  </Card>}/>;
}
