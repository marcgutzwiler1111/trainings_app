import { View } from 'react-native';
import type { CircuitRole, Exercise } from '../data/types';
import type { WorkoutType } from '../domain/shared/types';
import { builderDuration, circuitEffect, moveStation, roleLabels, type CircuitDraft } from '../features/workout/builder';
import { Button, Card, ChoiceField, Copy, Field } from './foundation';
import { ExerciseSelector } from './ExerciseSelector';

export function CircuitConfiguration({ draft, workoutType, exercises, onChange, disabled = false }: {
  draft: CircuitDraft; workoutType: WorkoutType; exercises: readonly Exercise[]; onChange: (draft: CircuitDraft) => void; disabled?: boolean;
}) {
  const duration = builderDuration(draft);
  return <>
      <Card><Copy heading>Circuit</Copy>
        <Field label="Anzahl Runden" value={Number.isNaN(draft.rounds) ? '' : String(draft.rounds)} keyboardType="number-pad" editable={!disabled}
          onChangeText={text => onChange({ ...draft, rounds: text.trim() === '' ? NaN : Number(text) })} />
        <Copy>{draft.stations.length} Stationen · 60 Sekunden pro Station</Copy>
        {duration !== null && <Copy>{duration / 60} Minuten</Copy>}
      </Card>
      {draft.stations.map((station, index) => <Card key={index}>
        <Copy heading>Station {index + 1}</Copy>
        <ChoiceField label={`Rolle Station ${index + 1}`} value={station.role} disabled={disabled}
          options={(Object.keys(roleLabels) as CircuitRole[]).map(value => ({ value, label: roleLabels[value] }))}
          onChange={role => onChange({ ...draft, stations: draft.stations.map((s, i) => i === index ? { ...s, role } : s) })} />
        <ExerciseSelector label={`Station ${index + 1}`} value={station.exerciseId} exercises={exercises} area="CIRCUIT" effect={circuitEffect(workoutType, station.role)} disabled={disabled}
          onChange={exerciseId => onChange({ ...draft, stations: draft.stations.map((s, i) => i === index ? { ...s, exerciseId } : s) })} />
        <View style={{ gap: 8 }}>
          <Button secondary label={`Station ${index + 1} nach oben ↑`} disabled={disabled || index === 0} onPress={() => onChange(moveStation(draft, index, -1))} />
          <Button secondary label={`Station ${index + 1} nach unten ↓`} disabled={disabled || index === draft.stations.length - 1} onPress={() => onChange(moveStation(draft, index, 1))} />
          <Button secondary label={`Station ${index + 1} entfernen`} disabled={disabled} onPress={() => onChange({ ...draft, stations: draft.stations.filter((_, i) => i !== index) })} />
        </View>
      </Card>)}
      <Button secondary label="Station hinzufügen" disabled={disabled} onPress={() => onChange({ ...draft, stations: [...draft.stations, { role: 'FOCUS', exerciseId: null }] })} />
  </>;
}
