/* global jest */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Provide synchronous safe-area insets in tests. Without this the real
// SafeAreaProvider defers rendering its children until it measures a layout,
// which never happens under Jest, so screens using useSafeAreaInsets render empty.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// The native splash module has no behaviour to exercise in tests; stub its
// async hold/hide calls so importing App doesn't pull the native side in.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

// On-device coach native stack. The engine (llama.rn) is only ever `require`d
// lazily inside llamaEngine.load(), but stub it so any accidental import is
// inert. expo-file-system/legacy backs the model download store; the default
// mock reports "no model on disk" and a no-op resumable — individual tests that
// exercise download progress override createDownloadResumable themselves.
jest.mock('llama.rn', () => ({
  initLlama: jest.fn(() =>
    Promise.resolve({
      completion: jest.fn(() => Promise.resolve({ text: '{"reply":"ok"}' })),
      release: jest.fn(() => Promise.resolve()),
    }),
  ),
}));

// Voice input: expo-audio's recorder is a native module with no Jest backing,
// so importing it throws. Stub the recorder + the enums/presets the composer
// reads at module load. whisper.rn itself is only `require`d lazily inside a
// transcription, so it needs no mock here.
jest.mock('expo-audio', () => ({
  useAudioRecorder: jest.fn(() => ({
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
    uri: null,
    isRecording: false,
  })),
  requestRecordingPermissionsAsync: jest.fn(() =>
    Promise.resolve({ granted: true }),
  ),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  RecordingPresets: { HIGH_QUALITY: { ios: {} } },
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  AudioQuality: { HIGH: 96 },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
  deleteAsync: jest.fn(() => Promise.resolve()),
  createDownloadResumable: jest.fn(() => ({
    downloadAsync: jest.fn(() =>
      Promise.resolve({ uri: 'file:///doc/models/model.gguf' }),
    ),
    cancelAsync: jest.fn(() => Promise.resolve()),
  })),
}));
