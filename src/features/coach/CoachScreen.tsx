import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppStore } from '../../state/useAppStore';

export function CoachScreen() {
  const aiProvider = useAppStore(state => state.aiProvider);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>AI Coach</Text>
      <Text style={styles.subtitle}>Selected provider: {aiProvider}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
});
