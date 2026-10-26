import { useCallback, useRef, useState, type ComponentRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useApplication } from '../../../features/application/provider';
import { useFeatureAction, useFocusedResource } from '../../../hooks/useFeature';
import { useRestTimer } from '../../../hooks/useRestTimer';
import { Button, Card, ConfirmDialog, Copy, ExerciseThumbnail, Field, Loading, Notice, Page } from '../../../components/foundation';
import { ExerciseSelector } from '../../../components/ExerciseSelector';
import { RestTimer, WorkoutBack } from '../../../components/TrainingControls';
import { strengthEffects } from '../../../features/workout/builder';
import type { SetInput } from '../../../features/workout/active';

export default function StrengthScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { training } = useApplication();
  const resource = useFocusedResource(useCallback(() => training.strength(id), [id, training]));
  const action = useFeatureAction(); const timer = useRestTimer(); const [restart, setRestart] = useState(false);
  const [feedbackSet, setFeedbackSet] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SetInput>>({});
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null); const positions = useRef<Record<string, number>>({});
  const data = resource.data;
  const toolbar = data ? <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
    {data.rows.map(row => <View key={row.exercise.id} style={{ flex: 1 }}><Button secondary label={`${row.exercise.slot} · ${row.exercise.exercise_name_snapshot} · ${row.sets.length}/4${row.exercise.is_complete ? ' ✓' : ''}`}
      onPress={() => scroll.current?.scrollTo({ y: positions.current[row.exercise.slot] ?? 0, animated: false })} /></View>)}
  </View> : null;
  return <Page title="Strength" toolbar={toolbar} scrollRef={scroll}>
    <WorkoutBack id={id} disabled={action.busy} />
    {resource.loading && <Loading />}<Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <>
      <Copy>{data.label}</Copy><Copy muted>A und B frei alternieren. Der Pausentimer sperrt keine Übung.</Copy>
      <RestTimer timer={timer} />
      {data.rows.map(row => <View key={row.exercise.id} onLayout={event => { positions.current[row.exercise.slot] = event.nativeEvent.layout.y; }}>
        <Card>
          <Copy heading>{row.exercise.slot} — {row.exercise.exercise_name_snapshot}</Copy>
          <ExerciseThumbnail key={row.exercise.thumbnail_uri_snapshot} uri={row.exercise.thumbnail_uri_snapshot} name={row.exercise.exercise_name_snapshot} />
          {row.inactive && <Copy muted>Diese Übung ist in der Bibliothek inaktiv. Gespeicherte Auswahl und Fortschritt bleiben verwendbar.</Copy>}
          <Copy>{row.sets.length} / 4 Sets gespeichert</Copy>
          {!!row.exercise.is_complete && <Copy>✓ {row.exercise.exercise_name_snapshot} abgeschlossen</Copy>}
          {!row.sets.length && <ExerciseSelector label={`Übung ${row.exercise.slot}`} value={row.exercise.exercise_id} exercises={data.exercises} area="STRENGTH"
            effect={strengthEffects(data.session.workout_type)[row.exercise.slot === 'A' ? 0 : 1]} disabled={action.busy}
            onChange={exerciseId => { setFeedbackSet(null); void action.run(async () => { await training.changeStrength(id, row.exercise.slot, exerciseId); await resource.refresh(); }); }} />}
          {!!row.sets.length && <Copy muted>Übung gesperrt. Zum Ändern den Strength-Bereich neu starten.</Copy>}
          <Copy>Letztes Training</Copy>
          {row.previous ? row.previous.sets.map(set => <Copy key={set.id}>{set.weight_kg} kg × {set.reps} @ RIR {set.rir}</Copy>) : <Copy muted>Noch keine vorherige Leistung</Copy>}
          <Copy>Aktuelles Volumen: {row.benchmark.currentVolume.toLocaleString('de-CH')} kg</Copy>
          {row.bestE1RM !== null && <Copy>Bestes e1RM: {row.bestE1RM.toFixed(1)} kg</Copy>}
          {row.benchmark.isNewPr && <Copy>✓ Neuer Strength Volume PR</Copy>}
          {[1, 2, 3, 4].map(number => {
            const saved = row.sets.find(s => s.set_number === number);
            const key = `${row.exercise.id}:${number}`;
            const form = drafts[key] ?? { weight: saved ? String(saved.weight_kg) : '', reps: saved ? String(saved.reps) : '', rir: saved ? String(saved.rir) : '' };
            const update = (field: keyof SetInput, value: string) => setDrafts(current => ({ ...current, [key]: { ...form, [field]: value } }));
            const label = `${row.exercise.slot} Satz ${number}`;
            return <Card key={number}>
              <Copy heading>Satz {number}</Copy>
              {saved && <Copy>{label} gespeichert</Copy>}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="kg" accessibilityLabel={`${label} Gewicht`} keyboardType="decimal-pad" value={form.weight} editable={!action.busy} onChangeText={v => update('weight', v)} /></View>
                <View style={{ flex: 1 }}><Field label="Reps" accessibilityLabel={`${label} Reps`} keyboardType="number-pad" value={form.reps} editable={!action.busy} onChangeText={v => update('reps', v)} /></View>
                <View style={{ flex: 1 }}><Field label="RIR" accessibilityLabel={`${label} RIR`} keyboardType="decimal-pad" value={form.rir} editable={!action.busy} onChangeText={v => update('rir', v)} /></View>
              </View>
              <Notice message={feedbackSet === key ? action.error : null} />
              <Button label={`${label} ${saved ? 'aktualisieren' : 'speichern'}`} disabled={action.busy} onPress={() => {
                setFeedbackSet(key);
                void action.run(async () => {
                  await training.saveSet(id, row.exercise.id, number, form);
                  setDrafts(current => { const next = { ...current }; delete next[key]; return next; });
                  timer.start(data.restSeconds); await resource.refresh();
                });
              }} />
            </Card>;
          })}
          <Button label={`Übung ${row.exercise.slot} abschließen`} disabled={action.busy || row.sets.length !== 4 || !!row.exercise.is_complete} onPress={() => {
            setFeedbackSet(null);
            void action.run(async () => { await training.completeExercise(id, row.exercise.id); await resource.refresh(); });
          }} />
        </Card>
      </View>)}
      {data.progress.status === 'COMPLETE' && <Card><Copy heading>Strength abgeschlossen</Copy>
        <Button label="Circuit ansehen" disabled={action.busy} onPress={() => router.push({ pathname: '/workout/[id]/circuit-preview', params: { id } })} />
      </Card>}
      <Button secondary label="Bereich neu starten" disabled={action.busy} onPress={() => setRestart(true)} />
      <ConfirmDialog visible={restart} title="Strength wirklich neu starten?" message="Alle aktuellen Strength-Sätze und beide Übungsabschlüsse werden zurückgesetzt. Power, Circuit und historische Workouts bleiben erhalten. Die Übungen sind danach wieder änderbar."
        confirmLabel="Strength neu starten bestätigen" busy={action.busy} onCancel={() => setRestart(false)} onConfirm={() => {
          setRestart(false); setFeedbackSet(null);
          void action.run(async () => { await training.restart(id, 'STRENGTH'); setDrafts({}); timer.clear(); await resource.refresh(); });
        }} />
    </>}
  </Page>;
}
