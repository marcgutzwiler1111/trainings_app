import { CircuitConfiguration } from '../../components/CircuitConfiguration';
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useApplication } from '../../features/application/provider';
import { FeatureError } from '../../features/application/services';
import { isWorkoutType, strengthEffects, validateBuilder, workoutLabels, workoutTypes, type BuilderDraft } from '../../features/workout/builder';
import type { WorkoutType } from '../../domain/shared/types';
import { useFeatureAction, useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, ChoiceField, Copy, Loading, Notice, Page } from '../../components/foundation';
import { ExerciseSelector } from '../../components/ExerciseSelector';

export default function BuilderScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const { workout } = useApplication();
  const [type, setType] = useState<WorkoutType | null>(() => isWorkoutType(params.type) ? params.type : null);
  const resource = useFocusedResource(useCallback(() => {
    if (!type) return Promise.reject(new FeatureError('Bitte auf Home einen Workout Type wählen.'));
    return workout.builder(type);
  }, [type, workout]));
  const [edited, setEdited] = useState<{ source: NonNullable<typeof resource.data>; draft: BuilderDraft } | null>(null);
  const action = useFeatureAction();
  const data = resource.data;
  const draft = edited?.source === data ? edited!.draft : data?.draft ?? null;
  const setDraft = (draft: BuilderDraft) => { if (data) setEdited({ source: data, draft }); };
  const ready = draft && data && draft.workoutType === type && data.draft.workoutType === type && !resource.loading;
  const errors = ready ? validateBuilder(draft, data.exercises) : [];
  return <Page title="Workout Builder">
    <Button label="Zurück zu Home" secondary disabled={action.busy} onPress={() => router.dismissTo('/')} />
    <Notice message={resource.error ?? action.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {(resource.loading || (!ready && !resource.error)) && <Loading />}
    {ready && <>
      <Card>
        <ChoiceField label="Workout Type" value={draft.workoutType} options={workoutTypes.map(value => ({ value, label: workoutLabels[value] }))} onChange={setType} disabled={action.busy} />
        <Copy muted>{data.fromPrevious ? 'Letzte Konfiguration übernommen. Leistungsdaten werden nicht kopiert.' : 'Neue Konfiguration: Bitte Übungen auswählen.'}</Copy>
        {data.warnings.map(warning => <Notice key={warning} message={warning} />)}
      </Card>
      <Card><Copy heading>Power</Copy>
        <ExerciseSelector label="Power" value={draft.powerExerciseId} exercises={data.exercises} area="POWER" disabled={action.busy}
          onChange={powerExerciseId => setDraft({ ...draft, powerExerciseId })} />
      </Card>
      <Card><Copy heading>Strength</Copy>
        <ExerciseSelector label="Strength A" value={draft.strengthA} exercises={data.exercises} area="STRENGTH" effect={strengthEffects(draft.workoutType)[0]} disabled={action.busy}
          onChange={strengthA => setDraft({ ...draft, strengthA })} />
        <ExerciseSelector label="Strength B" value={draft.strengthB} exercises={data.exercises} area="STRENGTH" effect={strengthEffects(draft.workoutType)[1]} disabled={action.busy}
          onChange={strengthB => setDraft({ ...draft, strengthB })} />
      </Card>
      <CircuitConfiguration draft={draft} workoutType={draft.workoutType} exercises={data.exercises} disabled={action.busy} onChange={circuit => setDraft({ ...draft, ...circuit })} />
      <Card>
        {!!errors.length && <Notice message={errors.join('\n')} />}
        <Button label={action.busy ? 'Workout wird gespeichert …' : 'Workout verbindlich starten'} disabled={action.busy || errors.length > 0} onPress={() => {
          void action.run(async () => {
            const id = await workout.start(draft);
            router.replace({ pathname: '/workout/[id]', params: { id } });
          });
        }} />
      </Card>
    </>}
  </Page>;
}
