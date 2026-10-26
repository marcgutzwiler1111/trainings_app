import { useLocalSearchParams } from 'expo-router';
import { ExerciseEditor } from '../../features/exercises/ExerciseEditor';
import { Notice, Page } from '../../components/foundation';
export default function EditExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return typeof id === 'string' && id ? <ExerciseEditor key={id} id={id} /> : <Page title="Übung bearbeiten"><Notice message="Keine Übung ausgewählt." /></Page>;
}
