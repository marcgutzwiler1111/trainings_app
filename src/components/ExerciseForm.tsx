import { Pressable, Text, View } from 'react-native';
import { Button, Card, Copy, ExerciseThumbnail, Field, usePalette } from './foundation';
import type { ExerciseDraft } from '../features/exercises/services';
import { areaLabels, effectLabels } from '../features/exercises/services';
import { exerciseAreas, exerciseEffects } from '../data/exerciseValidation';

function CheckOption({ label, checked, disabled, onPress }: { label: string; checked: boolean; disabled: boolean; onPress(): void }) {
  const palette = usePalette();
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={onPress}
    style={{ minHeight: 48, padding: 12, borderWidth: 1, borderRadius: 8, borderColor: palette.border, opacity: disabled ? 0.5 : 1 }}>
    <Text style={{ color: palette.text, fontSize: 17 }}>{checked ? '☑' : '☐'} {label}</Text>
  </Pressable>;
}
function toggle<T,>(values: readonly T[], value: T): T[] { return values.includes(value) ? values.filter(item => item !== value) : [...values, value]; }
export function ExerciseForm({ draft, onChange, busy, editing, onPickImage }: {
  draft: ExerciseDraft; onChange(draft: ExerciseDraft): void; busy: boolean; editing: boolean; onPickImage(): void;
}) {
  return <>
    <Card><Field label="Name" value={draft.name} editable={!busy} onChangeText={name => onChange({ ...draft, name })} autoCapitalize="words" /></Card>
    <Card><Copy heading>Areas</Copy><Copy muted>Mindestens eine Area wählen. Mehrere sind möglich.</Copy>
      <View style={{ gap: 8 }}>{exerciseAreas.map(area => <CheckOption key={area} label={`Area ${areaLabels[area]}`} checked={draft.areas.includes(area)} disabled={busy}
        onPress={() => onChange({ ...draft, areas: toggle(draft.areas, area) })} />)}</View>
    </Card>
    <Card><Copy heading>Effects</Copy><Copy muted>Mindestens einen Effect wählen. Mehrere sind möglich.</Copy>
      <View style={{ gap: 8 }}>{exerciseEffects.map(effect => <CheckOption key={effect} label={`Effect ${effectLabels[effect]}`} checked={draft.effects.includes(effect)} disabled={busy}
        onPress={() => onChange({ ...draft, effects: toggle(draft.effects, effect) })} />)}</View>
    </Card>
    <Card><Copy heading>Bild</Copy><ExerciseThumbnail uri={draft.thumbnailUri} name={draft.name || 'Übung'} size={96} />
      <Copy muted>Optional. Ohne verfügbares Bild wird ein Platzhalter angezeigt.</Copy>
      <Button secondary label={draft.thumbnailUri ? 'Bild ersetzen' : 'Bild auswählen'} disabled={busy} onPress={onPickImage} />
      {draft.thumbnailUri && <Button secondary label="Bild entfernen" disabled={busy} onPress={() => onChange({ ...draft, thumbnailUri: null })} />}
    </Card>
    <Card><Copy heading>Status</Copy><Copy>{draft.active ? 'Aktiv' : 'Inaktiv'}</Copy>
      {editing ? <>
        <Button secondary label={draft.active ? 'Übung deaktivieren' : 'Übung reaktivieren'} disabled={busy} onPress={() => onChange({ ...draft, active: !draft.active })} />
        <Copy muted>Inaktive Übungen werden für neue Trainings nicht mehr vorgeschlagen. Bestehende Trainingsdaten bleiben erhalten. Die Änderung gilt nach dem Speichern.</Copy>
      </> : <Copy muted>Neue Übungen werden aktiv angelegt.</Copy>}
    </Card>
  </>;
}
