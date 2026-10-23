import { StyleSheet, Text, View } from 'react-native';

export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.description}>Dieser Bereich wird in einer späteren Phase umgesetzt.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 12, color: '#17202a' },
  description: { fontSize: 16, lineHeight: 24, color: '#394854' },
});
