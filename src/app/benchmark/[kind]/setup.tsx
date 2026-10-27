import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../../features/application/provider';
import { FeatureError } from '../../../features/application/errors';
import { benchmarkLabels, isBenchmarkKind } from '../../../features/benchmarks/services';
import { useFeatureAction, useFocusedResource } from '../../../hooks/useFeature';
import { Button, Card, Copy, Field, Loading, Notice, Page } from '../../../components/foundation';

export default function BenchmarkSetupScreen() {
  const {kind}=useLocalSearchParams<{kind:string}>();const {benchmarks}=useApplication();
  const resource=useFocusedResource(useCallback(()=>isBenchmarkKind(kind)?benchmarks.setup(kind):Promise.reject(new FeatureError('Unbekannter Benchmark.')),[benchmarks,kind]));
  const [edited,setEdited]=useState<{source:typeof resource.data;values:Record<string,string>}|null>(null);const action=useFeatureAction();const data=resource.data;
  const values=edited?.source===data?edited!.values:{bodyweight:data?.bodyweight?.toString()??''};
  const field=(key:string,label:string)=><Field key={key} label={label} value={values[key]??''} keyboardType="decimal-pad" editable={!action.busy}
    onChangeText={text=>setEdited({source:data,values:{...values,[key]:text}})}/>;
  return <Page title={`${isBenchmarkKind(kind)?benchmarkLabels[kind]:'Benchmark'} Setup`}>
    <Button secondary label="Zur Benchmark-Übersicht" disabled={action.busy} onPress={()=>router.dismissTo({pathname:'/benchmark/[kind]',params:{kind}})}/>
    {resource.loading&&<Loading/>}<Notice message={resource.error}/>{resource.error&&<Button label="Erneut laden" onPress={resource.reload}/>}
    {data&&<>
      {kind==='power'?<Card><Copy>Alle Distanzen werden in cm erfasst.</Copy>{field('rotation','Rotational Throw Ballgewicht in kg')}{field('chest','Chest Pass Ballgewicht in kg')}{field('shotPut','Shot-Put Ballgewicht in kg')}</Card>
        :<Card><Copy>6 feste Stationen · 5 Runden · 60 Sekunden pro Station</Copy>{field('bodyweight','Benchmark Körpergewicht in kg')}{field('goblet','Goblet Squat Gewicht in kg')}{field('swing','Kettlebell Swing Gewicht in kg')}{field('pullup','Pull-up Zusatzgewicht in kg')}
          <Copy muted>Das Körpergewicht gilt nur für diesen Benchmark. Dein Profil bleibt unverändert.</Copy>
          <Copy>Goblet Squat → Push-ups → Kettlebell Swing → Pull-ups / Chin-ups → Hanging Leg Raises → Burpees</Copy>
        </Card>}
      <Copy>Mit dem Start werden diese Bedingungen für die Session gesperrt.</Copy><Notice message={action.error}/>
      <Button label="Benchmark verbindlich starten" disabled={action.busy} onPress={()=>{
        void action.run(async()=>{
          const id=kind==='power'?await benchmarks.startPower({rotation:values.rotation??'',chest:values.chest??'',shotPut:values.shotPut??''}):await benchmarks.startCircuit({bodyweight:values.bodyweight??'',goblet:values.goblet??'',swing:values.swing??'',pullup:values.pullup??''});
          router.replace({pathname:'/benchmark/[kind]/[id]',params:{kind,id}});
        });
      }}/>
    </>}
  </Page>;
}
