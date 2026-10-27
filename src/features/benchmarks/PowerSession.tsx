import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useApplication } from '../application/provider';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, Copy, Field, Loading, Notice, Page } from '../../components/foundation';
import { powerProtocol } from '../../domain/benchmarks/protocol';
import { sideLabels } from './services';
import { PowerBenchmarkResults } from './BenchmarkResults';
import { BenchmarkActions } from './BenchmarkActions';

export function PowerSession({id}:{id:string}) {
  const {benchmarks}=useApplication();const resource=useFocusedResource(useCallback(()=>benchmarks.power(id),[benchmarks,id]));
  const action=useFeatureAction();const [drafts,setDrafts]=useState<Record<string,string>>({});const [selected,setSelected]=useState<number|null>(null);
  const scroll=useRef<ComponentRef<typeof ScrollView>>(null);
  const data=resource.data;const active=data?.session.status==='IN_PROGRESS';const current=selected??data?.currentTest??0;
  return <Page title="Power Benchmark" scrollRef={scroll}>
    <Button secondary label="Zurück zu Home" disabled={action.busy} onPress={()=>router.dismissTo('/')}/>
    {resource.loading&&<Loading/>}<Notice message={resource.error??action.error}/>{resource.error&&<Button label="Erneut laden" onPress={resource.reload}/>}
    {data&&<>
      <Card><Copy heading>{active?`Test ${current+1} von 4`:data.session.status==='COMPLETE'?'Power Benchmark abgeschlossen':'Power Benchmark unvollständig beendet'}</Copy>
        <Copy>{data.attempts.length} / 18 Versuche gespeichert</Copy><Copy muted>Bedingungen gesperrt · alle Distanzen in cm</Copy>
      </Card>
      {active&&<>
        {powerProtocol.map((test,index)=><Button key={test.testType} secondary label={`Test ${index+1}: ${test.label}`} selected={current===index} disabled={action.busy||index>data.currentTest} onPress={()=>setSelected(index)}/>)}
        {selected!==null&&<Button secondary label="Zum aktuellen Test" disabled={action.busy} onPress={()=>setSelected(null)}/>}
      </>}
      {active?data.groups.filter(group=>group.testIndex===current).map(group=><Card key={`${group.testIndex}/${group.side}`}>
        <Copy heading>{group.label}{group.side==='NONE'?'':` · ${sideLabels[group.side]}`}</Copy>
        {group.test?.medicine_ball_weight_kg!==null&&group.test&&<Copy>Medicine Ball: {group.test.medicine_ball_weight_kg} kg</Copy>}
        {[1,2,3].map(n=>{
          const saved=group.attempts.find(attempt=>attempt.attempt_number===n);const key=`${group.test?.id}/${n}`;
          const label=`${group.side==='NONE'?'':`${sideLabels[group.side]} `}Versuch ${n}`;
          return <Card key={n}>
            {active&&group.test?<>
              <Field label={`${label} in cm`} value={drafts[key]??saved?.value.toString()??''} keyboardType="decimal-pad" editable={!action.busy} onChangeText={text=>setDrafts(before=>({...before,[key]:text}))}/>
              <Button secondary label={`${label} speichern`} disabled={action.busy} onPress={()=>{void action.run(async()=>{
                await benchmarks.saveAttempt(id,group.test!.id,n,drafts[key]??saved?.value.toString()??'');await resource.refresh();
              });}}/>
            </>:<Copy>{label}: {saved?.value??'—'} {group.test?.unit??'cm'}</Copy>}
            {active&&saved&&<Copy>✓ {label}: {saved.value} cm</Copy>}
          </Card>;
        })}
        <Copy>Bestwert: {group.best??'—'} {group.test?.unit??'cm'}</Copy>
        {group.previousBest!==null&&<Copy>Vorher: {group.previousBest} {group.previousUnit}{group.previousBallWeight===null?'':` · Ball ${group.previousBallWeight} kg`}</Copy>}
        {group.comparison==='COMPARABLE'&&<Copy>Vergleich: {group.delta!>0?'+':''}{group.delta} {group.test?.unit}</Copy>}
        {group.comparison==='NOT_COMPARABLE'&&<Copy>Nicht direkt vergleichbar: unterschiedliches Ballgewicht oder unterschiedliche Einheit.</Copy>}
        {group.comparison==='INCOMPLETE'&&<Copy>Direkter Vergleich nach drei gespeicherten Versuchen.</Copy>}
      </Card>):<PowerBenchmarkResults data={data} showComparison/>}
      {active&&<BenchmarkActions ready={data.ready} busy={action.busy} onFinish={status=>{void action.run(async()=>{await benchmarks.finish('power',id,status);await resource.refresh();scroll.current?.scrollTo({y:0,animated:false});});}}/>}
      <Button secondary label="Zur Benchmark-Übersicht" disabled={action.busy} onPress={()=>router.dismissTo({pathname:'/benchmark/[kind]',params:{kind:'power'}})}/>
    </>}
  </Page>;
}
