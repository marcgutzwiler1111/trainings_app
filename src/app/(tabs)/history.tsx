import { useCallback, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useApplication } from '../../features/application/provider';
import { useFocusedResource } from '../../hooks/useFeature';
import { Button, Card, Copy, Loading, Notice, usePalette } from '../../components/foundation';
import { historyFilters, filterHistory, formatHistoryDate, historyRouteKind, type HistoryFilter } from '../../features/history/services';

export default function HistoryScreen() {
  const { history } = useApplication();
  const resource = useFocusedResource(useCallback(() => history.list(), [history]));
  const [filter, setFilter] = useState<HistoryFilter>('ALL');
  const palette = usePalette();
  const rows = filterHistory(resource.data ?? [], filter);
  return <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }} edges={['bottom']}>
    <FlatList data={rows} keyExtractor={entry => entry.key} initialNumToRender={12} maxToRenderPerBatch={12} windowSize={7}
      style={{ flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      ListHeaderComponent={<View style={{ gap: 16, marginBottom: 16 }}><Copy heading>History</Copy>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{historyFilters.map(option => <Button secondary key={option.value} label={option.label} selected={filter === option.value} onPress={() => setFilter(option.value)} />)}</View>
        {resource.loading && <Loading />}<Notice message={resource.error} />{resource.error && <Button label="Erneut laden" onPress={resource.reload} />}
      </View>}
      ListEmptyComponent={resource.data ? <View style={{ gap: 8 }}><Copy>{resource.data.length ? 'Keine Trainings für diesen Filter.' : 'Noch keine Trainings vorhanden.'}</Copy>
        {!resource.data.length && <Copy muted>Abgeschlossene und unvollständig beendete Trainings erscheinen hier.</Copy>}
      </View> : undefined}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}, ${item.status === 'COMPLETE' ? 'Complete' : 'Incomplete'}, ${formatHistoryDate(item.date)}`}
        onPress={() => router.push({ pathname: '/history/[kind]/[id]', params: { kind: historyRouteKind(item.kind), id: item.id } })}>
        <Card><Copy muted>{formatHistoryDate(item.date, true)}</Copy><Copy heading>{item.title}</Copy><Copy>{item.status === 'COMPLETE' ? 'Complete' : 'Incomplete'}</Copy>
          {item.kind === 'WORKOUT' && <Copy muted>Power · Strength · Circuit</Copy>}
        </Card>
      </Pressable>}
    />
  </SafeAreaView>;
}
