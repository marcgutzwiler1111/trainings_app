import { View } from 'react-native';
import { Card, Copy, ExerciseThumbnail } from '../../components/foundation';
import { sideLabels, type powerView, type circuitBenchmarkView } from './services';

const metric = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 });
export function PowerBenchmarkResults({ data, showComparison = false }: { data: ReturnType<typeof powerView>; showComparison?: boolean }) {
  return <>{data.groups.map(group => <Card key={`${group.testIndex}/${group.side}`}>
    <Copy heading>{group.label}{group.side === 'NONE' ? '' : ` · ${sideLabels[group.side]}`}</Copy>
    {group.test && group.test.medicine_ball_weight_kg !== null && <Copy>Medicine Ball: {group.test.medicine_ball_weight_kg} kg</Copy>}
    {!group.attempts.length && <Copy muted>Keine Versuche gespeichert.</Copy>}
    {group.attempts.map(attempt => <Copy key={attempt.id}>{group.side === 'NONE' ? '' : `${sideLabels[group.side]} `}Versuch {attempt.attempt_number}: {attempt.value} {group.test?.unit}</Copy>)}
    {group.best !== null && <Copy>Bestwert: {group.best} {group.test?.unit}</Copy>}
    {showComparison && <>
      {group.previousBest !== null && <Copy>Vorher: {group.previousBest} {group.previousUnit}{group.previousBallWeight === null ? '' : ` · Ball ${group.previousBallWeight} kg`}</Copy>}
      {group.comparison === 'COMPARABLE' && <Copy>Vergleich: {group.delta! > 0 ? '+' : ''}{group.delta} {group.test?.unit}</Copy>}
      {group.comparison === 'NOT_COMPARABLE' && <Copy>Nicht direkt vergleichbar: unterschiedliches Ballgewicht oder unterschiedliche Einheit.</Copy>}
      {group.comparison === 'INCOMPLETE' && <Copy>Direkter Vergleich nach drei gespeicherten Versuchen.</Copy>}
    </>}
  </Card>)}</>;
}
export function CircuitBenchmarkBreakdown({ data }: { data: ReturnType<typeof circuitBenchmarkView> }) {
  return <>{data.breakdown.map(row => <Card key={row.station.id}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ExerciseThumbnail uri={row.station.thumbnail_uri_snapshot} name={row.station.exercise_name_snapshot} />
      <View style={{ flex: 1 }}><Copy heading>{row.station.exercise_name_snapshot}</Copy></View>
    </View>
    <Copy>Effektives Gewicht: {row.station.effective_weight_kg} kg</Copy>
    {row.rounds.map((result, index) => <Copy key={index}>R{index + 1}: {result ? `${result.reps} Reps` : 'Nicht gespeichert'}</Copy>)}
    <Copy>Total Reps: {row.totalReps}</Copy><Copy>Volume: {metric.format(row.volume)} kg</Copy>
  </Card>)}</>;
}
export function CircuitBenchmarkResults({ data }: { data: ReturnType<typeof circuitBenchmarkView> }) {
  return <>
    <Card><Copy>Total Volume: {metric.format(data.totalVolume)} kg</Copy><Copy>Relative Performance: {metric.format(data.relativePerformance)}</Copy>
      <Copy>{data.results.length} / 30 Rundenergebnisse gespeichert</Copy><Copy>6 Stationen · 5 Runden · 60 Sekunden</Copy>
    </Card>
    <Card><Copy heading>Gesperrte Bedingungen</Copy><Copy>Körpergewicht: {data.session.bodyweight_kg_snapshot} kg</Copy>
      <Copy>Goblet Squat: {data.session.goblet_squat_load_kg} kg</Copy><Copy>Kettlebell Swing: {data.session.kettlebell_swing_load_kg} kg</Copy>
      <Copy>Pull-up Zusatzgewicht: {data.session.pullup_added_load_kg} kg</Copy>
    </Card>
    <CircuitBenchmarkBreakdown data={data} />
  </>;
}
