import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useApplication } from '../../features/application/provider';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, Copy, Loading, Notice, Page } from '../../components/foundation';
import { formatBodyweight, formatSettingDuration, stepRestDuration } from '../../features/settings/services';
import { restDurationLimits, type RestKind } from '../../data/profileValidation';

function RestSetting({ kind, seconds, busy, onChange }: { kind: RestKind; seconds: number; busy: boolean; onChange(seconds: number): void }) {
  const name = kind === 'POWER' ? 'Power' : 'Strength';
  return <Card><Copy heading>{name} Pausenzeit</Copy><Copy>{formatSettingDuration(seconds)}</Copy>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Button secondary label={`${name} −30 Sek.`} disabled={busy || seconds <= restDurationLimits.min}
        onPress={() => onChange(stepRestDuration(seconds, -1))} /></View>
      <View style={{ flex: 1 }}><Button secondary label={`${name} +30 Sek.`} disabled={busy || seconds >= restDurationLimits.max}
        onPress={() => onChange(stepRestDuration(seconds, 1))} /></View>
    </View>
  </Card>;
}
export default function SettingsScreen() {
  const { settings } = useApplication();
  const resource = useFocusedResource(useCallback(() => settings.load(), [settings]));
  const action = useFeatureAction();
  const [feedback, setFeedback] = useState<string | null>(null);
  const data = resource.data;
  const change = (kind: RestKind, seconds: number) => {
    setFeedback(null);
    void action.run(async () => {
      await settings.updateRestTimer(kind, seconds);
      await resource.refresh();
      setFeedback(`${kind === 'POWER' ? 'Power' : 'Strength'} Pausenzeit gespeichert.`);
    });
  };
  return <Page title="Einstellungen">
    <Button secondary label="Zurück zu Home" disabled={action.busy} onPress={() => router.dismissTo('/')} />
    {resource.loading && <Loading />}
    <Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <>
      <Card><Copy heading>Profil</Copy><Copy>Körpergewicht</Copy>
        <Copy>{data.current_bodyweight_kg === null ? 'Noch nicht gesetzt' : formatBodyweight(data.current_bodyweight_kg)}</Copy>
        <Button label={data.current_bodyweight_kg === null ? 'Körpergewicht festlegen' : 'Körpergewicht ändern'} disabled={action.busy} onPress={() => router.push('/settings/bodyweight')} />
        <Button secondary label="Körpergewichtsverlauf" disabled={action.busy} onPress={() => router.push('/settings/bodyweight-history')} />
      </Card>
      <Copy heading>Training</Copy><Copy muted>Pausenzeit nach einem gespeicherten Set. Änderungen werden sofort gespeichert.</Copy>
      <RestSetting kind="POWER" seconds={data.power_rest_seconds} busy={action.busy} onChange={seconds => change('POWER', seconds)} />
      <RestSetting kind="STRENGTH" seconds={data.strength_rest_seconds} busy={action.busy} onChange={seconds => change('STRENGTH', seconds)} />
      <Copy muted>30 Sekunden bis 10 Minuten, in Schritten von 30 Sekunden.</Copy>
      {feedback && <Copy>✓ {feedback}</Copy>}
    </>}
  </Page>;
}
