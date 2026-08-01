# ADR 001: Expo (CNG), React Navigation, Zustand

Date: 2026-07-31
Status: Accepted

## Context

The project scaffold (HEA-2) needs a React Native workflow, a navigation
library, and a state management library. The founder explicitly directed:
"We should use Expo for sure."

Later tasks add on-device Whisper transcription, HealthKit / Health Connect
reads, and provider API clients — all of which require native modules but no
custom native code we plan to write ourselves.

## Decision

1. **Expo SDK 57 with Continuous Native Generation (prebuild).** The
   `android/` and `ios/` directories are generated from `app.json` via
   `npx expo prebuild` and committed for reproducible builds. This gives us
   the Expo module ecosystem (expo-av/audio, health adapters via config
   plugins) and OTA-friendly tooling while keeping full native build output.
2. **React Navigation 7** (bottom tabs + native stack) instead of Expo Router.
   Our navigation graph is small and fixed (Dashboard / Goals / Coach); a
   file-based router adds indirection we do not need yet.
3. **Zustand** for client state. Small API surface, no provider boilerplate,
   trivial to test, and sufficient for settings, goals, and cached metrics.
   Server/device sync concerns will be handled by the data layer (HEA-5), not
   by a heavier global state framework.

## Consequences

- Reversing the Expo decision is expensive after native-module config plugins
  accumulate; reversing navigation or state choices is cheap (few screens).
- `expo run:ios` requires macOS; Linux developers can only build Android.
- Dependency additions stay deliberate: each new package needs to justify its
  footprint against the privacy promise.
