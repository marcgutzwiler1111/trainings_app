import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Component, type ErrorInfo, type ReactNode, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { migrateDatabase } from '../data/migrations';

class DatabaseBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Database initialization failed', error, info.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={styles.status}>
          <Text accessibilityRole="alert">
            Die lokale Datenbank konnte nicht geöffnet werden. Bitte die App neu starten.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <DatabaseBoundary>
      <Suspense fallback={<View style={styles.status}><ActivityIndicator accessibilityLabel="Datenbank wird geöffnet" /></View>}>
        <SQLiteProvider databaseName="hybrid-training.db" onInit={migrateDatabase} useSuspense>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
          </Stack>
        </SQLiteProvider>
      </Suspense>
    </DatabaseBoundary>
  );
}

const styles = StyleSheet.create({
  status: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
});
