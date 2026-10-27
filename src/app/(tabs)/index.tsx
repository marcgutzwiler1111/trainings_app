import { useCallback, useState } from 'react';
import { router, Tabs } from 'expo-router';
import { View } from 'react-native';
import { useApplication } from '../../features/application/provider';
import { workoutLabels, workoutTypes } from '../../features/workout/builder';
import type { WorkoutType } from '../../domain/shared/types';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, ChoiceField, ConfirmDialog, Copy, Loading, Notice, Page } from '../../components/foundation';

export default function HomeScreen() {
  const { home } = useApplication();
  const resource = useFocusedResource(useCallback(() => home.load(), [home]));
  const action = useFeatureAction();
  const [selection, setSelection] = useState<{ source: typeof resource.data; type: WorkoutType | null } | null>(null);
  const [confirmRest, setConfirmRest] = useState(false);
  const data = resource.data;
  const type = selection?.source === data ? selection!.type : data?.item.type === 'WORKOUT' ? data.item.workoutType : null;
  const setType = (type: WorkoutType) => setSelection({ source: data, type });
  return <>
    <Tabs.Screen options={{ headerRight: () => <View style={{ marginRight: 12 }}><Button secondary label="Einstellungen" disabled={action.busy} onPress={() => router.push('/settings')} /></View> }} />
    <Page title="Home">
    {resource.loading && <Loading />}
    <Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <>
      {data.active && <Card>
        <Copy heading>Aktives Workout</Copy><Copy>{workoutLabels[data.active.workout_type]}</Copy>
        <Button label="Workout fortsetzen" onPress={() => router.push({ pathname: '/workout/[id]', params: { id: data.active!.id } })} />
        <Copy muted>Beende zuerst dein aktives Workout, bevor du ein neues startest.</Copy>
      </Card>}
      <Card><Copy heading>{data.item.type === 'REST' ? 'Heute' : 'Nächstes Training'}</Copy>
        <Copy>{data.nextLabel}</Copy><Copy muted>Cycle {data.cycle.current_position} / 6</Copy>
        {data.item.type === 'REST' && !data.active && <Button label="Ruhetag abschließen" disabled={action.busy} onPress={() => setConfirmRest(true)} />}
      </Card>
      {data.benchmarkStatus.active && data.benchmarkStatus.active.kind !== 'WORKOUT' && <Card>
        <Copy heading>Aktiver {data.benchmarkStatus.active.kind === 'POWER' ? 'Power Benchmark' : 'Circuit Benchmark'}</Copy>
        <Button label="Benchmark fortsetzen" onPress={() => router.push({ pathname: '/benchmark/[kind]/[id]', params: { kind: data.benchmarkStatus.active!.kind === 'POWER' ? 'power' : 'circuit', id: data.benchmarkStatus.active!.id } })} />
        <Copy muted>Beende zuerst die aktive Einheit, bevor du ein neues Workout startest.</Copy>
      </Card>}
      {!data.active && !data.benchmarkStatus.active && <Card>
        <ChoiceField label="Workout Type" value={type} disabled={action.busy}
          options={workoutTypes.map(value => ({ value, label: workoutLabels[value] }))} onChange={setType} />
        {data.item.type === 'REST' && <Copy muted>Du kannst für ein manuelles Workout einen Typ wählen.</Copy>}
        <Button label="Workout starten" disabled={!type || action.busy} onPress={() => {
          if (type) router.push({ pathname: '/workout/builder', params: { type } });
        }} />
      </Card>}
      {data.latest && <Card><Copy heading>Letztes Workout</Copy>
        <Copy>{workoutLabels[data.latest.workout_type]}</Copy>
        <Copy>{data.latest.status === 'COMPLETE' ? '✓ Abgeschlossen' : 'Unvollständig beendet'}</Copy>
        <Copy muted>{data.latest.completed_at ? new Date(data.latest.completed_at).toLocaleString('de-CH') : ''}</Copy>
      </Card>}
      {data.benchmarkStatus.cards.map(card => <Card key={card.kind}>
        <Copy heading>{card.kind === 'power' ? 'Power Benchmark' : 'Circuit Benchmark'}</Copy><Copy>{card.statusLabel}</Copy>
        <Button secondary label={`${card.kind === 'power' ? 'Power' : 'Circuit'} Benchmark öffnen`} onPress={() => router.push({ pathname: '/benchmark/[kind]', params: { kind: card.kind } })} />
      </Card>)}
      <ConfirmDialog visible={confirmRest} title="Ruhetag abschließen?" message="Der Cycle wechselt zum nächsten Eintrag. Es wird kein Workout angelegt."
        busy={action.busy} confirmLabel="Ruhetag bestätigen" onCancel={() => setConfirmRest(false)} onConfirm={() => {
          setConfirmRest(false);
          void action.run(async () => { await home.completeRest(data.cycle.current_position); resource.reload(); });
        }} />
    </>}
  </Page></>;
}
