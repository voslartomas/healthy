import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Render a component inside the providers screens depend on (safe-area). */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: RenderOptions,
) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>,
    options,
  );
}

/** Minimal navigation stub for screens typed against AppNav. */
export function mockNav() {
  return { navigate: jest.fn(), goBack: jest.fn() };
}
