# HealthApp

A privacy-first health companion app built with **React Native (0.86) + Expo SDK 57** and TypeScript in strict mode.

- **Today** dashboard: recovery ring, sleep / cardio load / HRV / resting HR, energy balance
- **Weekly goals** with auto-tracked progress, defined via a bottom sheet and persisted in SQLite
- **Nutrition**: calorie budget, in-vs-out, macros, and today's meals
- **AI Coach** chat with user-selectable provider (Anthropic / OpenAI / Gemini / on-device)
- **Trends**: weight, body fat, HRV, RHR, recovery, sleep charts
- **Recovery** and **Cardio load** detail screens; **Settings** for health-data connections and the AI provider
- Voice food logging via on-device Whisper (planned)

The UI implements the Open Design prototype (`design/bd2f7ef5-…/healthy-app-prototype.html`).
See `docs/adr/003-design-sync.md` for how the app stays in sync with that design, and
`docs/adr/002-local-database.md` for the goals data store.

## Toolchain requirements

| Tool        | Version                                                  |
| ----------- | -------------------------------------------------------- |
| Node.js     | >= 22.11 (built with 25.9)                               |
| pnpm        | >= 10 (pinned via `packageManager` in `package.json`)    |
| JDK         | 17                                                       |
| Android SDK | platform 36, build-tools 36, NDK 27 (via `ANDROID_HOME`) |
| Xcode       | 16+ (macOS only, required for iOS builds)                |
| CocoaPods   | latest stable (macOS only)                               |

## Setup (clean checkout)

```sh
pnpm install --frozen-lockfile
pnpm expo prebuild --clean
```

> Corepack ships pnpm with Node; run `corepack enable` once if the `pnpm`
> command is not on your PATH. The pinned version comes from the
> `packageManager` field.

This is an Expo **Continuous Native Generation (CNG)** project: the `android/`
and `ios/` folders are **generated artifacts** and are **not** committed
(they are gitignored). `expo prebuild` regenerates them deterministically from
`app.json` and config plugins, so a clean checkout always produces identical
native projects. Never hand-edit files under `android/` or `ios/` — express
native changes through `app.json` / config plugins instead.

## Commands

| Command             | What it does                                           |
| ------------------- | ------------------------------------------------------ |
| `pnpm start`        | Start the Expo dev server                              |
| `pnpm android`      | Build and run the Android app (`expo run:android`)     |
| `pnpm ios`          | Build and run the iOS app (`expo run:ios`, macOS only) |
| `pnpm test`         | Run the Jest test suite (jest-expo)                    |
| `pnpm lint`         | ESLint (eslint-config-expo, flat config)               |
| `pnpm typecheck`    | `tsc --noEmit` in strict mode                          |
| `pnpm format:check` | Prettier check                                         |

### Reproducible Android debug build

```sh
pnpm install --frozen-lockfile
pnpm expo prebuild --platform android --clean   # generates android/
cd android
./gradlew assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

### Reproducible iOS debug build (macOS only)

```sh
pnpm install --frozen-lockfile
pnpm expo prebuild --platform ios --clean   # generates ios/ and runs pod install
pnpm expo run:ios --configuration Debug
```

> **Note:** iOS builds require macOS with Xcode and CocoaPods. They cannot be
> produced on Linux CI runners or developer Linux machines.

## Project structure

```
App.tsx                  # Root component (navigation container, theming, goal hydration)
index.ts                 # Expo entry (registerRootComponent)
src/
  app/navigation/        # RootStack (tabs + detail/settings) and RootTabs
  components/            # Design-system primitives: Card, Ring, ProgressBar,
                         #   StatCard, SectionLabel, Charts, Icon, Screen
  features/dashboard/    # Today screen
  features/nutrition/    # Nutrition screen
  features/coach/        # AI coach chat
  features/trends/       # Trends charts
  features/recovery/     # Recovery detail
  features/cardio/       # Cardio load detail
  features/settings/     # Connections + AI provider settings
  features/goals/        # Weekly goals card + goal-definition bottom sheet
  db/                    # SQLite database + goals repository (migration-friendly)
  data/                  # Static sample health data + goal-source definitions
  state/                 # Zustand stores + goals service (SQLite write-through)
  theme/                 # Color tokens (light/dark), spacing, metric colors
__tests__/               # Jest + @testing-library/react-native tests
jest/                    # Test setup + render helpers
docs/adr/                # Architecture decision records
```

## Conventions

- TypeScript **strict** mode; no new compiler warnings allowed.
- Keep the dependency list small — it is part of our privacy promise. No
  analytics, tracking, or health-data dependencies without an approved ADR.
- Navigation: React Navigation. State: Zustand. See `docs/adr/`.
