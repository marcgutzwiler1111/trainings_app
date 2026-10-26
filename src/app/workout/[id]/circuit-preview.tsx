import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useApplication } from '../../../features/application/provider';
import { useFeatureAction, useFocusedResource } from '../../../hooks/useFeature';
import { useCircuitTimer } from '../../../hooks/useCircuitTimer';
import { Button, Card, ConfirmDialog, Copy, ExerciseThumbnail, Loading, Notice, Page, usePalette } from '../../../components/foundation';
import { WorkoutBack } from '../../../components/TrainingControls';
import { roleLabels } from '../../../features/workout/builder';
import { formatRestTime } from '../../../features/workout/restTimer';
import type { CircuitCursor } from '../../../data/circuitSnapshot';

/** The existing route hosts preview, running Circuit and completion; reload always starts paused. */
export default function CircuitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { circuit } = useApplication();
  const resource = useFocusedResource(useCallback(() => circuit.load(id), [id, circuit]));
  const { refresh } = resource;
  const transition = useCallback(async (cursor: CircuitCursor) => {
    const next = await circuit.advance(id, cursor); await refresh(); return next;
  }, [circuit, id, refresh]);
  const timer = useCircuitTimer(transition); const action = useFeatureAction();
  const [restart, setRestart] = useState(false); const p = usePalette();
  const data = resource.data; const busy = action.busy || timer.saving;
  const running = timer.frame?.timer.phase === 'running';
  return <Page title={data?.complete ? 'Circuit beendet' : data?.section.status === 'PLANNED' ? 'Circuit Preview' : 'Circuit'}>
    <WorkoutBack id={id} disabled={busy} />
    {resource.loading && <Loading />}<Notice message={resource.error ?? action.error ?? timer.error} />
    {(resource.error || timer.error) && <Button label="Erneut laden" disabled={busy} onPress={() => { timer.clear(); resource.reload(); }} />}
    {data?.section.status === 'PLANNED' && <>
      <Card><Copy>{data.section.round_count} Runden · {data.stations.length} Stationen</Copy>
        <Copy>{data.stationSeconds} Sek. pro Station · Gesamtdauer: {formatRestTime(data.durationSeconds)}</Copy>
        {data.stations.map(s => <View key={s.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <ExerciseThumbnail uri={s.thumbnail_uri_snapshot} name={s.exercise_name_snapshot} />
          <View style={{ flex: 1 }}><Copy>{s.position}. {s.exercise_name_snapshot}</Copy><Copy muted>{roleLabels[s.role]}</Copy></View>
        </View>)}
      </Card>
      <Button label="Circuit starten" disabled={busy} onPress={() => {
        void action.run(async () => {
          const started = await circuit.start(id, data.section.id); await resource.refresh();
          if (started.cursor) timer.resume(started.cursor, started.stationSeconds);
        });
      }} />
      <Button secondary label="Circuit bearbeiten" disabled={busy} onPress={() => router.push({ pathname: '/workout/[id]/circuit-edit', params: { id } })} />
    </>}
    {data && !data.complete && data.cursor && data.current && <>
      <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Copy>Runde {data.cursor.round} / {data.section.round_count}</Copy><Copy>Station {data.cursor.station} / {data.stations.length}</Copy></View>
        <Copy muted>{roleLabels[data.current.role]}</Copy><Copy heading>{data.current.exercise_name_snapshot}</Copy>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ExerciseThumbnail key={data.current.id} uri={data.current.thumbnail_uri_snapshot} name={data.current.exercise_name_snapshot} size={128} />
          <Text accessibilityLabel="Stationszeit" style={{ flex: 1, color: p.text, fontSize: 52, fontWeight: '700', textAlign: 'center', fontVariant: ['tabular-nums'] }}>{formatRestTime(timer.frame?.timer.remaining ?? data.stationSeconds)}</Text>
        </View>
        <Copy>{busy ? 'Stationswechsel wird gespeichert …' : running ? 'Circuit läuft' : 'Circuit pausiert'}</Copy>
        <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button label={running ? 'Pause' : timer.frame ? 'Fortsetzen' : 'Station fortsetzen'} disabled={busy} onPress={() => {
          if (running) timer.pause(); else timer.resume(data.cursor!, data.stationSeconds);
        }} /></View>
        <View style={{ flex: 1 }}><Button secondary label="Nächste Station" disabled={busy} onPress={() => { void timer.next(data.cursor!, data.stationSeconds); }} /></View>
        </View>
      </Card>
      <Card><Copy heading>Als Nächstes</Copy>
        {data.next ? <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <ExerciseThumbnail key={data.next.station.id} uri={data.next.station.thumbnail_uri_snapshot} name={data.next.station.exercise_name_snapshot} size={56} />
          <View style={{ flex: 1 }}><Copy>{data.next.station.exercise_name_snapshot}</Copy><Copy muted>Runde {data.next.position.round} · Station {data.next.position.station}</Copy></View>
        </View> : <Copy>Letzte Station — danach ist der Circuit beendet.</Copy>}
      </Card>
    </>}
    {data?.complete && <Card><Copy heading>Circuit abgeschlossen</Copy><Copy>{data.section.round_count} Runden</Copy>
      <Copy>{data.totalStations} Stationen</Copy><Copy>{formatRestTime(data.durationSeconds)} geplante Dauer</Copy>
      <Copy>Das Workout bleibt bis zum ausdrücklichen Abschluss aktiv. Der Cycle bleibt unverändert.</Copy>
      <Button label="Zur Zusammenfassung" onPress={() => router.push({ pathname: '/workout/[id]/summary', params: { id } })} />
      <Button label="Zurück zum Workout" onPress={() => router.dismissTo({ pathname: '/workout/[id]', params: { id } })} />
    </Card>}
    {!resource.loading && <Button secondary label="Bereich neu starten" disabled={busy} onPress={() => { timer.pause(); setRestart(true); }} />}
    <ConfirmDialog visible={restart} title="Circuit wirklich neu starten?" message="Der aktuelle Circuit-Fortschritt wird zurückgesetzt. Power und Strength bleiben erhalten. Danach kannst du den Circuit wieder bearbeiten."
      busy={busy} confirmLabel="Circuit neu starten bestätigen" onCancel={() => setRestart(false)} onConfirm={() => {
        setRestart(false);
        void action.run(async () => { await circuit.restart(id, data?.section.id); timer.clear(); router.replace({ pathname: '/workout/[id]/circuit-edit', params: { id } }); });
      }} />
  </Page>;
}
