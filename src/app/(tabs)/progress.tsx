import { router } from 'expo-router';
import { Button, Copy, Page } from '../../components/foundation';

export default function ProgressScreen() {
  return <Page title="Progress"><Copy>Messwerte und Verläufe deiner gespeicherten Trainings.</Copy>
    <Button secondary label="Strength" onPress={()=>router.push('/progress/strength')}/>
    <Button secondary label="Power Benchmark" onPress={()=>router.push('/progress/power')}/>
    <Button secondary label="Circuit Benchmark" onPress={()=>router.push('/progress/circuit')}/>
    <Button secondary label="Bodyweight" onPress={()=>router.push('/progress/bodyweight')}/>
  </Page>;
}
