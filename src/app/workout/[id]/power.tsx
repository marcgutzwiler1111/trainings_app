import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../../features/application/provider';
import { useFeatureAction, useFocusedResource } from '../../../hooks/useFeature';
import { useRestTimer } from '../../../hooks/useRestTimer';
import { Button, Card, ConfirmDialog, Copy, ExerciseThumbnail, Loading, Notice, Page } from '../../../components/foundation';
import { RestTimer, WorkoutBack } from '../../../components/TrainingControls';

export default function PowerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { training } = useApplication();
  const resource = useFocusedResource(useCallback(() => training.power(id), [id, training]));
  const action = useFeatureAction(); const timer = useRestTimer(); const [restart, setRestart] = useState(false);
  const data = resource.data;
  return <Page title="Power">
    <WorkoutBack id={id} disabled={action.busy} />
    {resource.loading && <Loading />}<Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <>
      <Card><Copy>{data.label}</Copy>
        <ExerciseThumbnail key={data.power.thumbnail_uri_snapshot} uri={data.power.thumbnail_uri_snapshot} name={data.power.exercise_name_snapshot} />
        <Copy heading>{data.power.exercise_name_snapshot}</Copy>
        <Copy>Explosiv und sauber ausführen. Qualität vor Ermüdung.</Copy>
        {data.inactive && <Copy muted>Diese Übung ist in der Bibliothek inaktiv. Die gespeicherte Workout-Auswahl bleibt verwendbar.</Copy>}
        <Copy>{data.power.completed_set_count} / 4 Sets abgeschlossen</Copy>
        {data.power.status === 'COMPLETE' ? <Copy>✓ Power abgeschlossen</Copy>
          : <>
            <Copy>Set {data.nextSet} / 4</Copy>
            <Button label="Set abgeschlossen" disabled={action.busy || data.power.completed_set_count >= 4} onPress={() => {
              void action.run(async () => { await training.completePowerSet(id, data.power.completed_set_count); timer.start(data.restSeconds); await resource.refresh(); });
            }} />
            <Button label="Power abschließen" disabled={action.busy || data.power.completed_set_count !== 4} onPress={() => {
              void action.run(async () => { await training.completePower(id); timer.clear(); await resource.refresh(); });
            }} />
          </>}
      </Card>
      {data.power.status !== 'COMPLETE' && <RestTimer timer={timer} />}
      {data.power.status === 'COMPLETE' && <Button label="Weiter zu Strength" disabled={action.busy} onPress={() => router.replace({ pathname: '/workout/[id]/strength', params: { id } })} />}
      <Button secondary label="Bereich neu starten" disabled={action.busy} onPress={() => setRestart(true)} />
      <ConfirmDialog visible={restart} title="Power wirklich neu starten?" message="Der aktuelle Power-Fortschritt wird gelöscht. Strength und Circuit bleiben unverändert."
        confirmLabel="Power neu starten bestätigen" busy={action.busy} onCancel={() => setRestart(false)} onConfirm={() => {
          setRestart(false);
          void action.run(async () => { await training.restart(id, 'POWER'); timer.clear(); await resource.refresh(); });
        }} />
    </>}
  </Page>;
}
