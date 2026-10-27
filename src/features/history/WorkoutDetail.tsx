import { View } from 'react-native';
import { Card, Copy, ExerciseThumbnail } from '../../components/foundation';
import { roleLabels } from '../workout/builder';
import { sectionLabels } from '../workout/active';
import { effectLabels } from '../exercises/services';
import type { HistoryDetail } from './services';

const metric = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 });
type WorkoutData = Extract<HistoryDetail, { kind: 'WORKOUT' }>['data'];
function SnapshotName({ name, uri }: { name: string; uri: string | null }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ExerciseThumbnail uri={uri} name={name} /><View style={{ flex: 1 }}><Copy heading>{name}</Copy></View></View>;
}
export function WorkoutDetail({ data }: { data: WorkoutData }) {
  const { session, power, strength, circuit } = data;
  return <>
    {session.bodyweight_snapshot_kg !== null ? <Copy>Körpergewicht beim Training: {session.bodyweight_snapshot_kg} kg</Copy> : <Copy muted>Für dieses Training wurde kein Körpergewicht gespeichert.</Copy>}
    {session.cycle_override_decision && <Copy>{session.cycle_override_decision === 'COUNT_AS_CURRENT_CYCLE_WORKOUT' ? 'Als aktuelles Cycle-Workout gezählt' : 'Cycle unverändert fortgesetzt'}</Copy>}
    <Card><Copy heading>Power</Copy>{power ? <>
      <SnapshotName name={power.exercise_name_snapshot} uri={power.thumbnail_uri_snapshot} />
      <Copy>{power.completed_set_count} / 4 Sets abgeschlossen</Copy><Copy>{sectionLabels[power.status]}</Copy>
    </> : <Copy>Kein Power-Bereich gespeichert.</Copy>}</Card>
    {!strength.length && <Card><Copy heading>Strength</Copy><Copy>Keine Strength-Übungen gespeichert.</Copy></Card>}
    {strength.map(row => <Card key={row.exercise.id}>
      <Copy heading>Strength {row.exercise.slot}</Copy><SnapshotName name={row.exercise.exercise_name_snapshot} uri={row.exercise.thumbnail_uri_snapshot} />
      {row.exercise.effect_snapshot && <Copy muted>Effect: {effectLabels[row.exercise.effect_snapshot]}</Copy>}
      <Copy>{row.sets.length} / 4 Sets · {row.exercise.is_complete ? 'Complete' : 'Incomplete'}</Copy>
      {!row.sets.length && <Copy>Keine Arbeitssätze gespeichert.</Copy>}
      {row.sets.map(set => <Copy key={set.id}>Set {set.set_number} · {set.weight_kg} kg × {set.reps} · RIR {set.rir}</Copy>)}
      <Copy>Volume: {metric.format(row.volume)} kg</Copy>
      {row.e1rm !== null && <Copy>e1RM: {metric.format(row.e1rm)} kg</Copy>}
      {row.relativeE1rm !== null && <Copy>Relative e1RM: {metric.format(row.relativeE1rm)}</Copy>}
    </Card>)}
    <Card><Copy heading>Circuit</Copy>{circuit ? <>
      <Copy>{sectionLabels[circuit.section.status]}</Copy><Copy>{circuit.section.round_count} Runden · {circuit.stations.length} Stationen · {circuit.section.station_duration_seconds} Sekunden pro Station</Copy>
      {circuit.section.current_round !== null && circuit.section.current_station_position !== null && <Copy>{session.status === 'INCOMPLETE' && circuit.section.status !== 'COMPLETE' ? 'Abgebrochen bei' : 'Gespeicherte Position'}: Runde {circuit.section.current_round} / Station {circuit.section.current_station_position}</Copy>}
      {circuit.stations.map(station => <Card key={station.id}>
        <Copy>{station.position}. {roleLabels[station.role]}</Copy><SnapshotName name={station.exercise_name_snapshot} uri={station.thumbnail_uri_snapshot} />
        {station.effect_snapshot && <Copy muted>Effect: {effectLabels[station.effect_snapshot]}</Copy>}
      </Card>)}
    </> : <Copy>Kein Circuit-Bereich gespeichert.</Copy>}</Card>
  </>;
}
