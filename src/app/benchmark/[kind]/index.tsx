import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../../features/application/provider';
import { FeatureError } from '../../../features/application/errors';
import { benchmarkLabels, isBenchmarkKind } from '../../../features/benchmarks/services';
import { useFocusedResource } from '../../../hooks/useFeature';
import { Button, Card, Copy, Loading, Notice, Page } from '../../../components/foundation';

export default function BenchmarkOverviewScreen() {
  const {kind}=useLocalSearchParams<{kind:string}>();const {benchmarks}=useApplication();
  const resource=useFocusedResource(useCallback(()=>isBenchmarkKind(kind)?benchmarks.overview(kind):Promise.reject(new FeatureError('Unbekannter Benchmark.')),[benchmarks,kind]));
  const data=resource.data;const status=data?.cards.find(card=>card.kind===kind);
  return <Page title={isBenchmarkKind(kind)?benchmarkLabels[kind]:'Benchmark'}>
    <Button secondary label="Zurück zu Home" onPress={()=>router.dismissTo('/')} />
    {resource.loading&&<Loading/>}<Notice message={resource.error}/>{resource.error&&<Button label="Erneut laden" onPress={resource.reload}/>}
    {data&&status&&<>
      <Card><Copy heading>{status.statusLabel}</Copy>
        <Copy>Letzter vollständiger Benchmark: {status.lastCompletedAtMs===null?'Noch nicht durchgeführt':new Date(status.lastCompletedAtMs).toLocaleString('de-CH')}</Copy>
        {status.dueAtMs!==null&&<Copy>Nächste Fälligkeit: {new Date(status.dueAtMs).toLocaleString('de-CH')}</Copy>}
        <Copy muted>Unabhängiger 30-Tage-Turnus. Der normale Trainingszyklus bleibt unverändert.</Copy>
      </Card>
      {data.active?<Card><Copy>Eine Trainingseinheit ist aktiv.</Copy>
        <Button label="Aktive Einheit fortsetzen" onPress={()=>data.active!.kind==='WORKOUT'?router.push({pathname:'/workout/[id]',params:{id:data.active!.id}}):router.push({pathname:'/benchmark/[kind]/[id]',params:{kind:data.active!.kind==='POWER'?'power':'circuit',id:data.active!.id}})}/>
      </Card>:<Button label={`${benchmarkLabels[data.kind]} starten`} onPress={()=>router.push({pathname:'/benchmark/[kind]/setup',params:{kind}})}/>}
      <Copy heading>Benchmark-Verlauf</Copy>
      {!data.history.length&&<Copy>Noch keine Benchmark-Sessions.</Copy>}
      {data.history.map((session,index)=><Card key={session.id}>
        <Copy>{new Date(session.completed_at??session.started_at).toLocaleString('de-CH')} · {session.status==='COMPLETE'?'Complete':session.status==='INCOMPLETE'?'Incomplete':'In Progress'}</Copy>
        <Button secondary label={`Session ${index+1} ansehen`} onPress={()=>router.push({pathname:'/benchmark/[kind]/[id]',params:{kind,id:session.id}})}/>
      </Card>)}
    </>}
  </Page>;
}
