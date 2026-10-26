import { useEffect, useState, type ReactNode, type Ref, type ComponentRef } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme, type TextInputProps } from 'react-native';
import { resolveExerciseImage } from '../lib/exerciseImages';
import { SafeAreaView } from 'react-native-safe-area-context';

export function usePalette() {
  return useColorScheme() === 'dark'
    ? { background: '#101820', card: '#1c2936', text: '#f1f5f9', muted: '#bac7d4', border: '#526579', accent: '#a5e5d4', onAccent: '#123329', danger: '#ffb7b3' }
    : { background: '#f4f7f8', card: '#ffffff', text: '#172b37', muted: '#4e6370', border: '#a4b6c0', accent: '#165f50', onAccent: '#ffffff', danger: '#9f241e' };
}
export function Copy({ children, heading = false, muted = false }: { children: ReactNode; heading?: boolean; muted?: boolean }) {
  const p = usePalette();
  return <Text accessibilityRole={heading ? 'header' : undefined} style={{ color: muted ? p.muted : p.text, fontSize: heading ? 23 : 16, lineHeight: heading ? 31 : 24, fontWeight: heading ? '700' : '400' }}>{children}</Text>;
}
export function Page({ title, children, toolbar, scrollRef }: { title: string; children: ReactNode; toolbar?: ReactNode; scrollRef?: Ref<ComponentRef<typeof ScrollView>> }) {
  const p = usePalette();
  return <SafeAreaView style={{ flex: 1, backgroundColor: p.background }} edges={['top', 'bottom']}>
    {toolbar}
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <Copy heading>{title}</Copy>{children}
    </ScrollView>
  </SafeAreaView>;
}
export function Card({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>{children}</View>;
}
export function Button({ label, onPress, disabled = false, secondary = false, selected = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; selected?: boolean }) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { borderColor: p.accent, backgroundColor: secondary && !selected ? p.card : p.accent, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}>
    <Text style={{ fontSize: 16, fontWeight: '600', color: secondary && !selected ? p.accent : p.onAccent, textAlign: 'center' }}>{label}</Text>
  </Pressable>;
}
export function Field(props: TextInputProps & { label: string }) {
  const p = usePalette();
  return <View style={{ gap: 6 }}><Copy>{props.label}</Copy><TextInput {...props} accessibilityLabel={props.accessibilityLabel ?? props.label} placeholderTextColor={p.muted}
    style={[styles.input, { color: p.text, backgroundColor: p.card, borderColor: p.border }]} /></View>;
}
export function Notice({ message }: { message: string | null }) {
  const p = usePalette();
  return message ? <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 16, lineHeight: 24 }}>{message}</Text> : null;
}
export function Loading() { return <View style={{ padding: 24 }}><ActivityIndicator accessibilityLabel="Daten werden geladen" /></View>; }
export function ConfirmDialog({ visible, title, message, confirmLabel, busy, onConfirm, onCancel }: {
  visible: boolean; title: string; message: string; confirmLabel: string; busy: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const p = usePalette();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={() => { if (!busy) onCancel(); }}>
    <View style={styles.backdrop}><View accessibilityViewIsModal style={[styles.dialog, { backgroundColor: p.card }]}>
      <Copy heading>{title}</Copy><Copy>{message}</Copy>
      <Button label={confirmLabel} disabled={busy} onPress={onConfirm} />
      <Button label="Abbrechen" disabled={busy} onPress={onCancel} secondary />
    </View></View>
  </Modal>;
}
export function ExerciseThumbnail({ uri, name, size = 44 }: { uri: string | null; name: string; size?: number }) {
  const p = usePalette();
  const [resolved, setResolved] = useState<{ source: string; uri: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true; let release: (() => void) | undefined;
    if (uri) void resolveExerciseImage(uri).then(result => {
      if (!mounted) { result.release(); return; }
      release = result.release; setFailed(null); setResolved({ source: uri, uri: result.uri });
    }).catch(() => { if (mounted) setFailed(uri); });
    return () => { mounted = false; release?.(); };
  }, [uri]);
  return uri && resolved?.source === uri && failed !== uri
    ? <Image source={{ uri: resolved.uri }} accessibilityLabel={name} onError={() => setFailed(uri)} style={[styles.thumbnail, { width: size, height: size }]} />
    : <View style={[styles.thumbnail, { width: size, height: size, backgroundColor: p.background, borderColor: p.border, borderWidth: 1 }]}><Text accessibilityLabel="Kein Übungsbild" style={{ color: p.muted, fontSize: 24 }}>◇</Text></View>;
}
const styles = StyleSheet.create({
  page: { padding: 20, gap: 18, width: '100%', maxWidth: 720, alignSelf: 'center', paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 12 },
  button: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderRadius: 8, justifyContent: 'center' },
  input: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, fontSize: 17, borderWidth: 1, borderRadius: 8 },
  backdrop: { flex: 1, backgroundColor: '#0009', padding: 20, alignItems: 'center', justifyContent: 'center' },
  dialog: { width: '100%', maxWidth: 560, padding: 24, gap: 16, borderRadius: 12 },
  thumbnail: { width: 44, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

export function ChoiceField<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string; value: T | null; options: readonly { value: T; label: string }[]; onChange: (value: T) => void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 6 }}>
    <Copy>{label}</Copy>
    <Button secondary disabled={disabled} label={`${label}: ${options.find(o => o.value === value)?.label ?? 'Bitte wählen'}`} onPress={() => setOpen(true)} />
    <Modal visible={open} transparent onRequestClose={() => setOpen(false)}>
      <View style={styles.backdrop}><Card><Copy heading>{label} wählen</Copy>
        {options.map(option => <Button key={option.value} label={option.label} secondary selected={option.value === value} onPress={() => { onChange(option.value); setOpen(false); }} />)}
        <Button label="Auswahl schließen" secondary onPress={() => setOpen(false)} />
      </Card></View>
    </Modal>
  </View>;
}
