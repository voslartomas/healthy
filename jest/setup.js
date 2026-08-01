/* global jest */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Provide synchronous safe-area insets in tests. Without this the real
// SafeAreaProvider defers rendering its children until it measures a layout,
// which never happens under Jest, so screens using useSafeAreaInsets render empty.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
