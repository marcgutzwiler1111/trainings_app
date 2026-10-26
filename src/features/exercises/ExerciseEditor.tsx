import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useApplication } from '../application/provider';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { Button, Copy, Loading, Notice, Page } from '../../components/foundation';
import { ExerciseForm } from '../../components/ExerciseForm';
import { emptyExercise, exerciseDraft, exerciseOrigin, type ExerciseDraft } from './services';
import { pickExerciseImage } from '../../lib/exerciseImages';

export function ExerciseEditor({ id }: { id?: string }) {
  const { exercises } = useApplication();
  const resource = useFocusedResource(useCallback(async () => {
    if (!id) return { draft: emptyExercise(), origin: 'Eigene Übung' };
    const exercise = await exercises.get(id);
    return { draft: exerciseDraft(exercise), origin: exerciseOrigin(id) };
  }, [exercises, id]));
  const command = useMemo(() => id ? null : exercises.createCommand(), [exercises, id]);
  const [edited, setEdited] = useState<{ source: typeof resource.data; draft: ExerciseDraft } | null>(null);
  const [saved, setSaved] = useState<{ sourceId: string | undefined; id: string } | null>(null);
  const action = useFeatureAction();
  const data = resource.data;
  const draft = edited?.source === data ? edited?.draft : data?.draft;
  const change = (draft: ExerciseDraft) => setEdited({ source: data, draft });
  if (saved && saved.sourceId === id) return <Page title={id ? 'Änderungen gespeichert' : 'Übung gespeichert'}>
    <Copy>✓ {id ? 'Änderungen gespeichert' : 'Exercise gespeichert'}</Copy>
    <Button label="Zur Übungen-Library" onPress={() => router.dismissTo('/exercises')} />
  </Page>;
  return <Page title={id ? 'Übung bearbeiten' : 'Übung erstellen'}>
    <Button secondary label="Zur Übungen-Library" disabled={action.busy} onPress={() => router.dismissTo('/exercises')} />
    {resource.loading && <Loading />}
    <Notice message={resource.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {data && draft && <>
      <Copy muted>{data.origin}</Copy>
      <ExerciseForm draft={draft} onChange={change} busy={action.busy} editing={!!id} onPickImage={() => {
        void action.run(async () => { const uri = await pickExerciseImage(); if (uri !== null) change({ ...draft, thumbnailUri: uri }); });
      }} />
      <Notice message={action.error} />
      <Button label={id ? 'Änderungen speichern' : 'Übung speichern'} disabled={action.busy} onPress={() => {
        void action.run(async () => {
          const savedId = id ? (await exercises.update(id, draft), id) : await command!.submit(draft);
          setSaved({ sourceId: id, id: savedId });
        });
      }} />
    </>}
  </Page>;
}
