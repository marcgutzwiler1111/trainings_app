import { useCallback } from 'react';
import { router } from 'expo-router';
import { useApplication } from '../../features/application/provider';
import { useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, Copy, Loading, Notice, Page } from '../../components/foundation';
import { formatBodyweight } from '../../features/settings/services';

export default function BodyweightHistoryScreen() {
  const { settings } = useApplication();
  const resource = useFocusedResource(useCallback(() => settings.history(), [settings]));
  return <Page title="Körpergewichtsverlauf">
    <Button secondary label="Zurück zu Einstellungen" onPress={() => router.dismissTo('/settings')} />
    {resource.loading && <Loading />}
    <Notice message={resource.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {resource.data && (resource.data.length ? resource.data.map(entry => <Card key={entry.id}>
      <Copy>{formatBodyweight(entry.bodyweight_kg)}</Copy><Copy muted>{new Date(entry.measured_at).toLocaleString('de-CH')}</Copy>
    </Card>) : <Copy>Noch kein Körpergewicht gespeichert.</Copy>)}
  </Page>;
}
