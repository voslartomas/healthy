import { Buffer } from 'buffer';
import { registerRootComponent } from 'expo';

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
