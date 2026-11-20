import { Buffer } from 'buffer';
import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// whisper.rn (via safe-buffer) expects a Node-style Buffer, which the React
// Native runtime doesn't provide. Install the userland polyfill on the global so
// it's available by the time the voice engine lazy-loads whisper.rn. The bundle
// also needs the `buffer` package present so safe-buffer's `require('buffer')`
// resolves at build time.
const globalScope = globalThis as { Buffer?: typeof Buffer };
if (typeof globalScope.Buffer === 'undefined') {
  globalScope.Buffer = Buffer;
}

registerRootComponent(App);

// The Android home-screen widget's headless task (ADR-010). Registered at
// module scope, next to the root component, because Android starts it without
// mounting the app. Lazy so iOS and Jest never load the native widget module.
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
    require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { widgetTaskHandler } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
    require('./src/widget/widgetTaskHandler') as typeof import('./src/widget/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
