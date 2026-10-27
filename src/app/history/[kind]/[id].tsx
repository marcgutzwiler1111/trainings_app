import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../../features/application/provider';
import { FeatureError } from '../../../features/application/errors';
import { useFocusedResource } from '../../../hooks/useFeature';
import { Button, Loading, Notice, Page } from '../../../components/foundation';
import { parseHistoryRouteKind } from '../../../features/history/services';
import { SessionHeader } from '../../../features/history/SessionHeader';
import { WorkoutDetail } from '../../../features/history/WorkoutDetail';
import { PowerBenchmarkResults, CircuitBenchmarkResults } from '../../../features/benchmarks/BenchmarkResults';

export default function HistoryDetailScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const { history } = useApplication();
  const resource = useFocusedResource(useCallback(async () => {
    if (typeof id !== 'string' || !id) throw new FeatureError('Training nicht gefunden.');
    return history.detail(parseHistoryRouteKind(kind), id);
  }, [history, kind, id]));
  const detail = resource.data;
  return <Page title="Training Detail">
    <Button secondary label="Zurück zur History" onPress={() => router.dismissTo('/history')} />
    {resource.loading && <Loading />}<Notice message={resource.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {detail && <>
      <SessionHeader entry={detail.entry} />
      {detail.kind === 'WORKOUT' && <WorkoutDetail data={detail.data} />}
      {detail.kind === 'POWER_BENCHMARK' && <PowerBenchmarkResults data={detail.data} />}
      {detail.kind === 'CIRCUIT_BENCHMARK' && <CircuitBenchmarkResults data={detail.data} />}
    </>}
  </Page>;
}
