import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button, Card, Copy, usePalette } from './foundation';
import type { useRestTimer } from '../hooks/useRestTimer';
import { formatRestTime } from '../features/workout/restTimer';

export function WorkoutBack({ id, disabled = false }: { id: string; disabled?: boolean }) {
  return <Button secondary label="Zum Workout Overview" disabled={disabled} onPress={() => router.dismissTo({ pathname: '/workout/[id]', params: { id } })} />;
}
export function RestTimer({ timer }: { timer: ReturnType<typeof useRestTimer> }) {
  const p = usePalette();
  return <Card><Copy heading>Rest</Copy>
    <Text accessibilityLabel={`Rest ${formatRestTime(timer.state.remaining)}`} style={{ color: p.text, fontSize: 40, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatRestTime(timer.state.remaining)}</Text>
    {!timer.state.running && <Copy>Bereit für den nächsten Satz.</Copy>}
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}><Button secondary label="+30 Sek." onPress={timer.extend} /></View>
      <View style={{ flex: 1 }}><Button secondary label="Überspringen" onPress={timer.skip} /></View>
    </View>
  </Card>;
}
