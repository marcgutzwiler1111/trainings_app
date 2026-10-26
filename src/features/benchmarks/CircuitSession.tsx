import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApplication } from '../application/provider';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { useBenchmarkStationTimer } from '../../hooks/useBenchmarkStationTimer';
import { Button, Card, Copy, ExerciseThumbnail, Field, Loading, Notice, Page, usePalette } from '../../components/foundation';
import { formatRestTime } from '../workout/restTimer';
import { BenchmarkActions } from './BenchmarkActions';

const metric=new Intl.NumberFormat('de-CH',{maximumFractionDigits:2});
export function CircuitSession({id}:{id:string}) {
  const {benchmarks}=useApplication();const resource=useFocusedResource(useCallback(()=>benchmarks.circuit(id),[benchmarks,id]));
  const action=useFeatureAction();const timer=useBenchmarkStationTimer();const palette=usePalette();
  const [drafts,setDrafts]=useState<Record<string,string>>({});const [corrections,setCorrections]=useState(false);
  const scroll=useRef<ComponentRef<typeof ScrollView>>(null);
  const data=resource.data;const active=data?.session.status==='IN_PROGRESS';
  const time=data?.timerKey&&timer.frame?.key===data.timerKey?timer.frame.timer:timer.initial;
  const finish=(status:'COMPLETE'|'INCOMPLETE')=>{timer.pause();void action.run(async()=>{await benchmarks.finish('circuit',id,status);timer.clear();await resource.refresh();scroll.current?.scrollTo({y:0,animated:false});});};
  return <Page title="Circuit Benchmark" scrollRef={scroll}>
    <Button secondary label="Zurück zu Home" disabled={action.busy} onPress={()=>router.dismissTo('/')}/>
    {resource.loading&&<Loading/>}<Notice message={resource.error??action.error}/>{resource.error&&<Button label="Erneut laden" onPress={resource.reload}/>}
    {data&&<>
      {active&&data.cursor&&data.current&&<>
        <Card><Copy>Runde {data.cursor.round} / 5 · Station {data.cursor.station} / 6</Copy><Copy heading>{data.current.exercise_name_snapshot}</Copy>
          <View style={{flexDirection:'row',alignItems:'center',gap:18}}><ExerciseThumbnail uri={data.current.thumbnail_uri_snapshot} name={data.current.exercise_name_snapshot} size={96}/>
            <Text accessibilityLabel="Benchmark Stationszeit" style={{color:palette.text,fontSize:48,fontWeight:'700',fontVariant:['tabular-nums']}}>{formatRestTime(time.remaining)}</Text>
          </View>
          <Copy>{time.phase==='running'?'Station läuft':time.phase==='expired'?'Zeit abgelaufen – Wiederholungen erfassen.':'Station pausiert'}</Copy>
          {time.phase==='running'?<Button secondary label="Pause" disabled={action.busy} onPress={timer.pause}/>:time.phase!=='expired'&&<Button label="Station fortsetzen" disabled={action.busy} onPress={()=>timer.resume(data.timerKey!)}/>}
          <Copy>Effektives Gewicht: {data.current.effective_weight_kg} kg</Copy>
          {data.next?<View style={{flexDirection:'row',gap:12,alignItems:'center'}}><ExerciseThumbnail uri={data.next.exercise.thumbnail_uri_snapshot} name={data.next.exercise.exercise_name_snapshot}/><View style={{flex:1}}><Copy>Als Nächstes: {data.next.exercise.exercise_name_snapshot}</Copy><Copy muted>Runde {data.next.round} · Station {data.next.station}</Copy></View></View>:<Copy>Letzte Station – danach alle Ergebnisse prüfen und ausdrücklich abschließen.</Copy>}
        </Card>
        <Card><Field label="Wiederholungen" value={drafts[data.timerKey!]??''} keyboardType="number-pad" editable={!action.busy} onChangeText={text=>setDrafts(before=>({...before,[data.timerKey!]:text}))}/>
          <Copy muted>0 ist gültig. Auch ein vorzeitiger Stationswechsel benötigt gespeicherte Reps.</Copy>
          <Button label="Reps speichern & weiter" disabled={action.busy} onPress={()=>{
            const token=timer.token();timer.pause();void action.run(async()=>{
              const result=await benchmarks.advanceCircuit(id,data.cursor!,drafts[data.timerKey!]??'');await resource.refresh();
              if(result.timerKey)timer.resume(result.timerKey,token);else timer.clear();
            });
          }}/>
        </Card>
      </>}
      <Card><Copy heading>{active?data.ready?'Alle 30 Ergebnisse gespeichert':'Benchmark aktiv':data.session.status==='COMPLETE'?'Circuit Benchmark abgeschlossen':'Circuit Benchmark unvollständig beendet'}</Copy>
        <Copy>{data.results.length} / 30 Rundenergebnisse gespeichert</Copy><Copy>6 Stationen · 5 Runden · 60 Sekunden</Copy>
        <Copy>Total Volume: {metric.format(data.totalVolume)} kg</Copy><Copy>Relative Performance: {metric.format(data.relativePerformance)}</Copy>
      </Card>
      <Card><Copy heading>Gesperrte Bedingungen</Copy><Copy>Körpergewicht: {data.session.bodyweight_kg_snapshot} kg</Copy>
        <Copy>Goblet Squat: {data.session.goblet_squat_load_kg} kg</Copy><Copy>Kettlebell Swing: {data.session.kettlebell_swing_load_kg} kg</Copy><Copy>Pull-up Zusatzgewicht: {data.session.pullup_added_load_kg} kg</Copy>
      </Card>
      {active&&<BenchmarkActions ready={data.ready} busy={action.busy} onFinish={finish}/>}
      {active&&data.results.length>0&&<Button secondary label={corrections?'Korrekturen schließen':'Gespeicherte Ergebnisse korrigieren'} disabled={action.busy} onPress={()=>{timer.pause();setCorrections(value=>!value);}}/>}
      {active&&corrections&&data.results.map(row=>{
        const key=row.id;
        return <Card key={key}><Field label={`R${row.round_number} S${row.station_position} Reps`} value={drafts[key]??row.reps.toString()} keyboardType="number-pad" editable={!action.busy} onChangeText={text=>setDrafts(before=>({...before,[key]:text}))}/>
          <Button secondary label={`R${row.round_number} S${row.station_position} korrigieren`} disabled={action.busy} onPress={()=>{void action.run(async()=>{await benchmarks.correctCircuit(id,row.round_number,row.station_position,drafts[key]??row.reps.toString());await resource.refresh();});}}/>
        </Card>;
      })}
      {(!active||data.ready)&&data.breakdown.map(row=><Card key={row.station.id}>
        <Copy heading>{row.station.exercise_name_snapshot}</Copy><Copy>Effektives Gewicht: {row.station.effective_weight_kg} kg</Copy>
        {row.rounds.map((result,index)=><Copy key={index}>R{index+1}: {result?.reps??'—'} Reps</Copy>)}
        <Copy>Total Reps: {row.totalReps}</Copy><Copy>Volume: {metric.format(row.volume)} kg</Copy>
      </Card>)}
      <Button secondary label="Zur Benchmark-Übersicht" disabled={action.busy} onPress={()=>router.dismissTo({pathname:'/benchmark/[kind]',params:{kind:'circuit'}})}/>
    </>}
  </Page>;
}
