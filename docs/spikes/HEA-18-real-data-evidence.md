# HEA-18 — Dashboard + goals on real Android Health Connect data (evidence)

Status: **Android criterion DONE with on-device evidence.** iOS/HealthKit,
Nutrition/Coach, and Trends/Cardio-load full derivation split to child issues.

Connects the *directly-measured* health-metric surfaces to live wearable data
via Android Health Connect, replacing the design-sample constants, with graceful
sample fallback everywhere the platform/permissions are unavailable. No raw
personal series is recorded here or in the repo — only aggregates and source
package names. Detailed values live in the run scratch dir (auto-removed).

## 1. Environment (real device)

| | |
|---|---|
| Device | Xiaomi `d7712bbb`, **Android 17 (SDK 37)**, physical, USB |
| Health platform | Health Connect — `getSdkStatus` = `available` |
| Sources writing to HC | Fitbit, Withings, Google Fit, a home-workout app, HC phone source (5 distinct origins) |
| App | `com.healthapp` debug build (Expo SDK 57 / RN 0.86, new arch) |
| Read path | **local Expo native module `health-connect`** (Kotlin, androidx.health.connect:connect-client 1.1.0) — production, autolinked, survives `expo prebuild` |

## 2. What was built

- **`modules/health-connect`** — local Expo native module promoting the HEA-13
  probe to production: SDK-status gate, `getGrantedPermissions`, per-type
  `SecurityException` catch (one revoked perm degrades only that metric),
  `pageToken` pagination with page caps, bounded recent window for
  high-frequency types, source-tagged records. Read-only (privacy boundary).
- **`src/health`** — pure TS derivation: multi-source **dedup by `dataOrigin`**
  (source-priority; no cross-origin step double-count), unit normalization,
  **RMSSD tagging**, aggregation, and the non-clinical **readiness** heuristic
  (ADR-004). Provider selection with sample fallback. 13 unit tests.
- **`useHealthStore` / `initHealth`** — live snapshot loaded on app start.
- **Dashboard** stats (HRV, resting HR, sleep, steps) + recovery ring + **honest
  recovery copy** + **weekly-goal auto-tracking** read the live snapshot.
- **`plugins/withHealthConnect.js`** — CNG config plugin (READ perms, provider
  `<queries>`, `minSdk 26`) so `expo prebuild --clean` regenerates `android/`
  reproducibly. Nothing hand-edited in the generated tree.

## 3. Result — live read, on device (2026-08-01)

End-to-end: app start → native `readAll` (Logcat shows Health Connect
`requestSize = 1000` paginated reads) → TS dedup/derive → dashboard render.
Snapshot summary logged from the app (aggregates only):

| Field | Live value | Notes |
|---|---|---|
| `live` | `true` | real read, not fallback |
| HRV | **39.7 ms**, baseline 51.7, **RMSSD** | tagged; below baseline |
| Resting HR | **54 bpm**, baseline 53.5 | |
| Sleep | **8.28 h** → "8:17", 100% perf | last session, deduped |
| Steps today / week | **3,127 / 49,471** | single primary source (dedup — 5 origins present, no cross-origin sum) |
| Readiness | **51% "Balanced"** | ADR-004 heuristic |
| Goals auto-track | strength **3**, zone2 **151 min**, steps 49,471, calories 0, core 0 | calories 0 = no ActiveCalories writer among these sources |
| Sources | 5 | homeworkout, Google Fit, Withings, Fitbit, HC phone |

Rendered dashboard: `docs/spikes/assets/HEA-18-dashboard-live.png` — recovery ring
51% Balanced, "HRV is below your baseline and sleep was solid", sleep 8:17, HRV
40, RHR 54, Strength 3/3 auto-complete. The recovery **copy is generated from the
live signals** — it does not repeat the sample "HRV is up" when HRV is down.

## 4. Correctness confirmations

1. **Multi-source dedup works on real data.** 5 origins wrote steps; week total
   49,471 reflects a single primary source, not a cross-origin sum (which would
   be far higher). Direct evidence for priority #1 (no double count).
2. **RMSSD carried through and tagged.** HRV surfaced as RMSSD; the readiness
   heuristic and any future SDNN (iOS) path must stay baselined separately.
3. **Graceful degradation.** `activeEnergy` had no writer → calories tracked = 0,
   not an error. Sample fallback covers non-Android / no-permission cases (unit
   test `readSnapshot fallback`).
4. **Reproducible via CNG.** `expo prebuild --clean` + config plugin regenerated
   `android/` with the perms/queries/minSdk and autolinked the local module; a
   clean `:app:assembleDebug` produced the APK verified above.

## 5. Deferred (child issues, not dropped)

- **iOS / HealthKit** wiring — no macOS/Xcode host (HEA-15 runbook exists).
- **Nutrition + Coach** real data — need food-logging + provider-agnostic AI
  coach (separate committed features), not Health-platform reads.
- **Trends + Cardio-load** full derivation — need a defined training-load formula
  and per-metric history series (ADR + product input).
- **In-app Health Connect permission UX** — the module opens HC settings today
  (interim); the polished in-app permission contract is follow-up. Verification
  here used `pm grant` (HEA-13 finding 5).
