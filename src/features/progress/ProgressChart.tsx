import { useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Copy, usePalette } from '../../components/foundation';
import type { ProgressPoint } from './services';

export const metric = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 });
const dateLabel = new Intl.DateTimeFormat('de-CH', { day:'2-digit',month:'2-digit',year:'2-digit' });
/** Native scatter time series. No interpolation, invented samples or dependency.
 * Exact values remain available in the accompanying virtualized session list. */
export function ProgressChart({ title, points, unit }: { title:string;points:readonly ProgressPoint[];unit:string }) {
  const palette=usePalette();const [width,setWidth]=useState(240);
  const rows=points.filter(row=>row.date!==null&&Number.isFinite(Date.parse(row.date))&&Number.isFinite(row.value));
  const times=rows.map(row=>Date.parse(row.date!));const values=rows.map(row=>row.value);
  const minTime=rows.length?Math.min(...times):0;const maxTime=rows.length?Math.max(...times):0;
  const min=rows.length?Math.min(...values):0;const max=rows.length?Math.max(...values):0;
  const span=max-min;const pad=span===0?Math.max(Math.abs(max)*0.05,1):span*0.08;
  const lo=min-pad;const hi=max+pad;const height=160;
  return <Card><Copy heading>{title}</Copy><Copy muted>{unit||'Relativer Wert'} · {rows.length} {rows.length===1?'Messpunkt':'Messpunkte'}</Copy>
    {!rows.length?<Copy>Noch keine Daten vorhanden.</Copy>:<>
      <View accessible accessibilityLabel={`${title}: ${rows.length} Messpunkte; Minimum ${metric.format(min)}, Maximum ${metric.format(max)} ${unit}. Einzelwerte stehen in der Liste.`}>
        <View style={{height:height+16,flexDirection:'row'}}>
          <View style={{width:62,justifyContent:'space-between'}}><Text style={{color:palette.muted,fontSize:12}}>{metric.format(hi)}</Text><Text style={{color:palette.muted,fontSize:12}}>{metric.format(lo)}</Text></View>
          <View onLayout={event=>setWidth(Math.max(1,event.nativeEvent.layout.width-12))} style={{flex:1,height:height+8,borderLeftWidth:1,borderBottomWidth:1,borderColor:palette.border}}>
            {rows.map((row,index)=><View key={row.id} style={{position:'absolute',left:6+(maxTime===minTime?width/2:(times[index]-minTime)/(maxTime-minTime)*width)-4,
              top:4+(hi-row.value)/(hi-lo)*height-4,width:8,height:8,borderRadius:4,borderWidth:2,borderColor:palette.accent,backgroundColor:row.isComplete?palette.accent:palette.card}}/>)}
          </View>
        </View>
        <View style={{marginLeft:62,flexDirection:'row',justifyContent:maxTime===minTime?'center':'space-between'}}>
          <Text style={{color:palette.muted,fontSize:12}}>{dateLabel.format(minTime)}</Text>{maxTime!==minTime&&<Text style={{color:palette.muted,fontSize:12}}>{dateLabel.format(maxTime)}</Text>}
        </View>
      </View>
      <Copy muted>Einzelmessungen nach Datum; keine Zwischenwerte.{points.some(row=>!row.isComplete)?' Offener Punkt = Incomplete.':''}</Copy>
    </>}
    {rows.length!==points.length&&<Copy muted>Messungen ohne gültigen Zeitpunkt sind nur in der Liste sichtbar.</Copy>}
  </Card>;
}
