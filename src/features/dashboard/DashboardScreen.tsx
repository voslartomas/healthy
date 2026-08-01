import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const METRIC_PLACEHOLDERS = [
  { label: 'Sleep', value: '--' },
  { label: 'HRV', value: '--' },
  { label: 'Recovery', value: '--' },
  { label: 'Resting HR', value: '--' },
  { label: 'Steps', value: '--' },
] as const;

export function DashboardScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Today</Text>
      <View style={styles.grid}>
        {METRIC_PLACEHOLDERS.map(metric => (
          <View key={metric.label} style={styles.card}>
            <Text style={styles.metricLabel}>{metric.label}</Text>
            <Text style={styles.metricValue}>{metric.value}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47%',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#D8DCE2',
  },
  metricLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '600',
  },
});
