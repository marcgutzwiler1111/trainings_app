import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import type { ManualOverrideResult } from '../../../domain/cycle/cycle';
import { useApplication } from '../../../features/application/provider';
import { FeatureError } from '../../../features/application/errors';
import { useFeatureAction, useFocusedResource } from '../../../hooks/useFeature';
import { Button, Card, Copy, Loading, Notice, Page } from '../../../components/foundation';

const volumeFormat = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 });
export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { completion } = useApplication();
  const resource = useFocusedResource(useCallback(() => {
    if (!id || typeof id !== 'string') return Promise.reject(new FeatureError('Kein Workout ausgewählt.'));
    return completion.load(id);
  }, [completion, id]));
  const action = useFeatureAction();
  const [choice, setChoice] = useState<{ id: string; value: ManualOverrideResult } | null>(null);
  const [success, setSuccess] = useState<{ id: string; nextLabel: string } | null>(null);
  const data = resource.data;
  const decision = choice?.id === id ? choice.value : undefined;
  if (success?.id === id) return <Page title="Workout abgeschlossen">
    <Card><Copy heading>✓ Workout abgeschlossen</Copy><Copy>Als Nächstes: {success.nextLabel}</Copy></Card>
    <Button label="Zu Home" onPress={() => router.dismissTo('/')} />
  </Page>;
  return <Page title="Workout Summary">
    {resource.loading && <Loading />}
    <Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <>
      <Card><Copy heading>{data.label}</Copy><Copy>Trainiert: {data.label}</Copy><Copy>Cycle erwartet: {data.expectedLabel}</Copy></Card>
      <Card><Copy heading>Power</Copy><Copy>{data.power?.exercise_name_snapshot ?? 'Keine Übung'}</Copy>
        <Copy>{data.power?.status === 'COMPLETE' ? '✓ Abgeschlossen' : 'Noch nicht abgeschlossen'} · {data.power?.completed_set_count ?? 0} / 4 Sets</Copy></Card>
      <Card><Copy heading>Strength</Copy>{data.strength.map(row => <Card key={row.exercise.id}>
        <Copy heading>{row.exercise.exercise_name_snapshot}</Copy>
        <Copy>{row.exercise.is_complete ? '✓ Abgeschlossen' : 'Noch nicht abgeschlossen'} · {row.setCount} / 4 Sets</Copy>
        <Copy>Volumen: {volumeFormat.format(row.volume)} kg</Copy>
      </Card>)}</Card>
      <Card><Copy heading>Circuit</Copy><Copy>{data.circuit?.section.status === 'COMPLETE' ? '✓ Circuit abgeschlossen' : 'Noch nicht abgeschlossen'}</Copy>
        <Copy>{data.circuit?.section.round_count ?? 0} Runden · {data.circuit?.stations.length ?? 0} Stationen</Copy></Card>
      {data.ready ? <Copy heading>Workout vollständig</Copy> : <Notice message={data.issues.join('\n')} />}
      {data.requiresDecision && <Card>
        <Copy heading>Abweichendes Training</Copy><Copy>Laut Trainingszyklus wäre jetzt: {data.expectedLabel}</Copy><Copy>Du hast trainiert: {data.label}</Copy>
        <Button secondary label="Cycle normal fortsetzen" selected={decision === 'CONTINUE_CYCLE_NORMALLY'} disabled={action.busy}
          onPress={() => setChoice({ id, value: 'CONTINUE_CYCLE_NORMALLY' })} />
        <Copy>{data.expectedLabel} bleibt als nächster Cycle-Eintrag bestehen.</Copy>
        <Button secondary label="Als aktuellen Cycle-Schritt zählen" selected={decision === 'COUNT_AS_CURRENT_CYCLE_WORKOUT'} disabled={action.busy}
          onPress={() => setChoice({ id, value: 'COUNT_AS_CURRENT_CYCLE_WORKOUT' })} />
        <Copy>{data.expectedLabel} gilt als erledigt. Der Cycle geht zu {data.countedNextLabel} weiter.</Copy>
        {!decision && <Copy muted>Bitte eine Option ausdrücklich wählen.</Copy>}
      </Card>}
      <Button label="Workout abschließen" disabled={action.busy || !data.ready || (data.requiresDecision && !decision)} onPress={() => {
        void action.run(async () => {
          const result = await completion.finish(id, decision);
          setSuccess({ id, nextLabel: result.nextLabel });
        });
      }} />
    </>}
    <Button secondary label="Zurück zum Workout" disabled={action.busy} onPress={() => router.dismissTo({ pathname: '/workout/[id]', params: { id } })} />
    <Button secondary label="Zurück zu Home" disabled={action.busy} onPress={() => router.dismissTo('/')} />
  </Page>;
}
