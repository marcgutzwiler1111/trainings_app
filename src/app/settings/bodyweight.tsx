import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { useApplication } from '../../features/application/provider';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, Copy, Field, Loading, Notice, Page } from '../../components/foundation';
import { formatBodyweight } from '../../features/settings/services';

export default function BodyweightScreen() {
  const { settings } = useApplication();
  const resource = useFocusedResource(useCallback(() => settings.load(), [settings]));
  const action = useFeatureAction();
  const [edited, setEdited] = useState<{ source: typeof resource.data; text: string } | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const data = resource.data;
  const text = edited?.source === data ? edited!.text : data?.current_bodyweight_kg?.toString() ?? '';
  return <Page title="Körpergewicht">
    <Button secondary label="Zurück zu Einstellungen" disabled={action.busy} onPress={() => router.dismissTo('/settings')} />
    {resource.loading && <Loading />}
    <Notice message={resource.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <>
      <Card><Copy>Aktuell: {data.current_bodyweight_kg === null ? 'Noch nicht gesetzt' : formatBodyweight(data.current_bodyweight_kg)}</Copy>
        <Field label="Körpergewicht in kg" value={text} editable={!action.busy} keyboardType="decimal-pad" autoCorrect={false}
          onChangeText={text => { setEdited({ source: data, text }); setFeedback(null); }} />
        <Copy muted>20–400 kg. Dezimalwerte mit Punkt oder Komma sind möglich.</Copy>
        <Notice message={action.error} />
        <Button label="Körpergewicht speichern" disabled={action.busy} onPress={() => {
          setFeedback(null);
          void action.run(async () => {
            const result = await settings.updateBodyweight(text);
            await resource.refresh();
            setFeedback(result.changed ? `Körpergewicht gespeichert: ${formatBodyweight(result.weight)}` : 'Körpergewicht unverändert. Kein neuer Verlaufseintrag.');
          });
        }} />
        {feedback && <Copy>✓ {feedback}</Copy>}
      </Card>
      <Button secondary label="Körpergewichtsverlauf ansehen" disabled={action.busy} onPress={() => router.push('/settings/bodyweight-history')} />
    </>}
  </Page>;
}
