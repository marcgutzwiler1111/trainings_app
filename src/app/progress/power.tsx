import { ProgressSelect } from '../../features/progress/ProgressSelect';
import { useCallback, useState } from 'react';
import { Card, Copy } from '../../components/foundation';
import { useApplication } from '../../features/application/provider';
import { useFocusedResource } from '../../hooks/useFeature';
import { ProgressList, HistoryLink } from '../../features/progress/ProgressList';
import { metric, ProgressChart } from '../../features/progress/ProgressChart';
import { formatHistoryDate } from '../../features/history/services';
import { sideLabels } from '../../features/benchmarks/services';
import { powerProtocol } from '../../domain/benchmarks/protocol';
import type { PowerBenchmarkTestType } from '../../domain/benchmarks/power';

export default function PowerProgressScreen(){
  const {progress}=useApplication();const resource=useFocusedResource(useCallback(()=>progress.power(),[progress]));
  const [test,setTest]=useState<PowerBenchmarkTestType>('STANDING_BROAD_JUMP');const [selected,setSelected]=useState<string|null>(null);
  const groups=resource.data?.filter(group=>group.testType===test)??[];
  const options=[...new Map(groups.map(group=>[JSON.stringify([group.ballWeight,group.unit]),{value:JSON.stringify([group.ballWeight,group.unit]),label:`${group.ballWeight===null?'Ohne Ballgewicht':`${group.ballWeight} kg`} · ${group.unit}`}])).values()];
  const condition=options.some(option=>option.value===selected)?selected:options[options.length-1]?.value??null;
  const visible=groups.filter(group=>JSON.stringify([group.ballWeight,group.unit])===condition);
  const rows=visible.flatMap(group=>[...group.points].reverse().map(point=>({...point,id:`${group.id}/${point.id}`,side:group.side,unit:group.unit})));
  return <ProgressList title="Power Benchmark Progress" resource={resource} rows={rows} empty="Noch kein vollständiger Power Benchmark vorhanden." header={<>
    <ProgressSelect label="Test" value={test} options={powerProtocol.map(test=>({value:test.testType,label:test.label}))} onChange={value=>{setTest(value);setSelected(null);}}/>
    {options.length>0&&<ProgressSelect label="Ballgewicht / Einheit" value={condition} options={options} onChange={setSelected}/>}
    <Copy muted>Nur Complete Benchmarks. Vergleiche und Bestwerte gelten pro Test, Seite, Ballgewicht und Einheit.</Copy>
    {visible.map(group=><ProgressChart key={group.id} title={`${group.label}${group.side==='NONE'?'':` · ${sideLabels[group.side]}`}`} unit={group.unit} points={group.points}/>)}
    {visible.map(group=><Copy key={group.id}>Best{group.side==='NONE'?'':` ${sideLabels[group.side]}`}: {metric.format(group.best)} {group.unit}</Copy>)}
    {!!rows.length&&<Copy heading>Messwerte je Seite</Copy>}
  </>} render={row=><Card><Copy>{formatHistoryDate(row.date,true)}{row.side==='NONE'?'':` · ${sideLabels[row.side]}`}</Copy>
    <Copy>{metric.format(row.value)} {row.unit}{row.isNewPr?' · PR':''}</Copy>
    {row.previous!==null&&<><Copy>Vorher: {metric.format(row.previous)} {row.unit}</Copy><Copy>Δ: {row.delta!>0?'+':''}{metric.format(row.delta!)} {row.unit}</Copy></>}
    <HistoryLink kind="power" id={row.sourceSessionId}/>
  </Card>}/>;
}
