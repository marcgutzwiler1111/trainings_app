import { useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../../features/application/provider';
import { useFocusedResource } from '../../../hooks/useFeature';
import { Button, Card, Copy, Loading, Notice, Page } from '../../../components/foundation';
import { WorkoutBack } from '../../../components/TrainingControls';
import { roleLabels } from '../../../features/workout/builder';

export default function CircuitPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { training } = useApplication();
  const resource = useFocusedResource(useCallback(() => training.preview(id), [id, training]));
  const data = resource.data;
  return <Page title="Circuit Preview">
    <WorkoutBack id={id} />
    {resource.loading && <Loading />}<Notice message={resource.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && <Card>
      <Copy>{data.section.round_count} Runden · {data.stations.length} Stationen</Copy>
      <Copy>60 Sekunden pro Station · {data.durationSeconds / 60} Minuten</Copy>
      {data.stations.map(s => <Copy key={s.id}>{s.position}. {roleLabels[s.role]} · {s.exercise_name_snapshot}</Copy>)}
      <Copy>Circuit-Training wird in der nächsten Implementierungsphase aktiviert.</Copy>
    </Card>}
  </Page>;
}
