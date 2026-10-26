import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../../features/application/provider';
import { useFeatureAction, useFocusedResource } from '../../../hooks/useFeature';
import { Button, Loading, Notice, Page } from '../../../components/foundation';
import { WorkoutBack } from '../../../components/TrainingControls';
import { CircuitConfiguration } from '../../../components/CircuitConfiguration';
import { validateCircuitDraft, type CircuitDraft } from '../../../features/workout/builder';

export default function CircuitEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { circuit } = useApplication();
  const resource = useFocusedResource(useCallback(() => circuit.editor(id), [circuit, id]));
  const action = useFeatureAction();
  const [edited, setEdited] = useState<{ source: NonNullable<typeof resource.data>; draft: CircuitDraft } | null>(null);
  const data = resource.data; const draft = edited?.source === data ? edited!.draft : data?.draft;
  const errors = data && draft ? validateCircuitDraft(draft, data.exercises) : [];
  return <Page title="Circuit bearbeiten">
    <WorkoutBack id={id} disabled={action.busy} />
    {resource.loading && <Loading />}<Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && draft && <>
      {data.warnings.map(w => <Notice key={w} message={w} />)}
      <CircuitConfiguration draft={draft} workoutType={data.workoutType} exercises={data.exercises} disabled={action.busy} onChange={value => setEdited({ source: data, draft: value })} />
      <Notice message={errors.length ? errors.join('\n') : null} />
      <Button label="Circuit-Konfiguration speichern" disabled={action.busy || errors.length > 0} onPress={() => {
        void action.run(async () => { await circuit.saveEditor(id, data.sectionId, draft); router.replace({ pathname: '/workout/[id]/circuit-preview', params: { id } }); });
      }} />
    </>}
  </Page>;
}
