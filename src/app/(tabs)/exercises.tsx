import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useApplication } from '../../features/application/provider';
import { useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, ChoiceField, Copy, ExerciseThumbnail, Field, Loading, Notice, Page } from '../../components/foundation';
import { areaLabels, effectLabels, exerciseOrigin, filterExercises } from '../../features/exercises/services';
import { exerciseAreas, exerciseEffects } from '../../data/exerciseValidation';
import type { Area, Effect } from '../../data/types';

export default function ExerciseLibraryScreen() {
  const { exercises } = useApplication();
  const resource = useFocusedResource(useCallback(() => exercises.library(), [exercises]));
  const [query, setQuery] = useState('');
  const [area, setArea] = useState<Area | null>(null);
  const [effect, setEffect] = useState<Effect | 'ALL'>('ALL');
  const rows = resource.data ? filterExercises(resource.data, query, area, effect === 'ALL' ? null : effect) : [];
  return <Page title="Übungen">
    <Button label="+ Übung erstellen" onPress={() => router.push('/exercise/new')} />
    <Field label="Übungen suchen" value={query} onChangeText={setQuery} autoCorrect={false} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button secondary label="Alle Areas" selected={area === null} onPress={() => setArea(null)} />
      {exerciseAreas.map(value => <Button secondary key={value} label={areaLabels[value]} selected={area === value} onPress={() => setArea(value)} />)}
    </View>
    <ChoiceField<Effect | 'ALL'> label="Effect" value={effect} onChange={setEffect}
      options={[{ value: 'ALL', label: 'Alle Effects' }, ...exerciseEffects.map(value => ({ value, label: effectLabels[value] }))]} />
    {resource.loading && <Loading />}
    <Notice message={resource.error} />
    {resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
    {resource.data && <>
      <Copy muted>{rows.length} Übungen · aktive und inaktive Übungen</Copy>
      {!rows.length && <Copy>Keine passenden Übungen. Suche oder Filter ändern.</Copy>}
      {rows.map(exercise => <Pressable key={exercise.id} accessibilityRole="button" accessibilityLabel={`Übung ${exercise.name} öffnen`}
        onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: exercise.id } })}>
        <Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <ExerciseThumbnail uri={exercise.thumbnail_uri} name={exercise.name} />
          <View style={{ flex: 1 }}><Copy heading>{exercise.name}</Copy>
            <Copy>{exercise.areas.map(area => areaLabels[area]).join(' · ')}</Copy>
            <Copy>{exercise.effects.map(effect => effectLabels[effect]).join(' · ')}</Copy>
            <Copy>{exercise.is_active ? 'Aktiv' : 'Inaktiv'} · {exerciseOrigin(exercise.id)}</Copy>
          </View>
        </View></Card>
      </Pressable>)}
    </>}
  </Page>;
}
