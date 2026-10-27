import { useCallback } from 'react';
import { Card, Copy } from '../../components/foundation';
import { useApplication } from '../../features/application/provider';
import { useFocusedResource } from '../../hooks/useFeature';
import { ProgressList } from '../../features/progress/ProgressList';
import { metric, ProgressChart } from '../../features/progress/ProgressChart';
import { formatHistoryDate } from '../../features/history/services';

export default function BodyweightProgressScreen(){
  const {progress}=useApplication();const resource=useFocusedResource(useCallback(()=>progress.bodyweight(),[progress]));const data=resource.data;
  return <ProgressList title="Bodyweight Progress" resource={resource} rows={data?.entries??[]} empty="Noch keine Körpergewichts-Historie vorhanden." header={data&&<>
    <Copy>Aktuell: {data.current===null?'Noch nicht gesetzt':`${metric.format(data.current)} kg`}</Copy>
    <ProgressChart title="Körpergewicht" unit="kg" points={data.points}/><Copy heading>Bodyweight History</Copy>
  </>} render={row=><Card><Copy>{formatHistoryDate(row.date,true)}</Copy><Copy>{metric.format(row.value)} kg</Copy></Card>}/>;
}
