import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../features/application/provider';
import { FeatureError } from '../../features/application/services';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, ConfirmDialog, Copy, Loading, Notice, Page } from '../../components/foundation';
import { roleLabels } from '../../features/workout/builder';

export default function WorkoutOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { workout } = useApplication();
  const resource = useFocusedResource(useCallback(() => {
    if (!id || typeof id !== 'string') return Promise.reject(new FeatureError('Kein Workout ausgewählt.'));
    return workout.overview(id);
  }, [id, workout]));
  const action = useFeatureAction(); const [confirm, setConfirm] = useState(false);
  const data = resource.data;
  return <Page title="Workout Overview">
    {resource.loading && <Loading />}
    <Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <>
      <Card><Copy heading>{data.label}</Copy><Copy>{data.session.status === 'IN_PROGRESS' ? 'Workout aktiv' : 'Workout nicht aktiv'}</Copy></Card>
      <Card><Copy heading>Power</Copy><Copy>{data.power.exercise_name_snapshot}</Copy></Card>
      <Card><Copy heading>Strength</Copy>{data.strength.map(s => <Copy key={s.id}>{s.slot}: {s.exercise_name_snapshot}</Copy>)}</Card>
      <Card><Copy heading>Circuit</Copy><Copy>{data.circuit.section.round_count} Runden</Copy><Copy>{data.circuit.stations.length} Stationen</Copy><Copy>{data.durationSeconds / 60} Minuten</Copy>
        {data.circuit.stations.map(s => <Copy key={s.id}>{s.position}. {roleLabels[s.role]} · {s.exercise_name_snapshot}</Copy>)}
      </Card>
      {data.session.status === 'IN_PROGRESS' && <Button secondary label="Workout als unvollständig beenden" disabled={action.busy} onPress={() => setConfirm(true)} />}
      <ConfirmDialog visible={confirm} title="Workout unvollständig beenden?" message="Gespeicherte Daten bleiben erhalten. Der Cycle bleibt unverändert."
        busy={action.busy} confirmLabel="Unvollständig beenden bestätigen" onCancel={() => setConfirm(false)} onConfirm={() => {
          setConfirm(false);
          void action.run(async () => { await workout.endIncomplete(id); router.dismissTo('/'); });
        }} />
    </>}
    <Button label="Zurück zu Home" disabled={action.busy} onPress={() => router.dismissTo('/')} />
  </Page>;
}
