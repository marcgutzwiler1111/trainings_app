import { useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Area, Effect, Exercise } from '../data/types';
import { exerciseOptions } from '../features/workout/builder';
import { Button, Copy, ExerciseThumbnail, Field, usePalette } from './foundation';

export function ExerciseSelector({ label, value, exercises, area, effect, onChange, disabled = false }: {
  label: string; value: string | null; exercises: readonly Exercise[]; area: Area; effect?: Effect; onChange: (id: string) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(''); const [all, setAll] = useState(false);
  const p = usePalette(); const selected = exercises.find(e => e.id === value);
  const options = exerciseOptions(exercises, area, effect, query, all);
  return <View style={{ gap: 6 }}>
    <Copy>{label}</Copy>
    <Button secondary label={`${label}: ${selected?.name ?? 'Übung wählen'}`} disabled={disabled} onPress={() => { setQuery(''); setAll(false); setOpen(true); }} />
    <Modal visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.background, padding: 20, gap: 12 }}>
        <Copy heading>{label} auswählen</Copy>
        <Field label="Übung suchen" value={query} onChangeText={setQuery} autoCorrect={false} />
        <Button secondary label={all ? 'Empfohlene anzeigen' : 'Alle anzeigen'} onPress={() => setAll(!all)} />
        <Copy muted>{all ? 'Alle aktiven Übungen, Empfehlungen zuerst.' : 'Aktive Übungen passend zu Bereich und Trainingsfokus.'}</Copy>
        <FlatList data={options} keyExtractor={e => e.id} keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Copy>Keine passenden Übungen. Suche ändern oder „Alle anzeigen“ wählen.</Copy>}
          renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Übung ${item.name} auswählen`}
            onPress={() => { onChange(item.id); setOpen(false); }}
            style={{ minHeight: 68, flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderBottomColor: p.border, borderBottomWidth: 1 }}>
            <ExerciseThumbnail key={item.thumbnail_uri} uri={item.thumbnail_uri} name={item.name} />
            <View style={{ flex: 1 }}><Copy>{item.name}</Copy><Copy muted>{item.areas.join(' · ')}</Copy></View>
          </Pressable>} />
        <Button label="Auswahl schließen" secondary onPress={() => setOpen(false)} />
      </SafeAreaView>
    </Modal>
  </View>;
}
