# HEA-13 — Live on-device Health Connect read (real wearable data)

Status: **Android criterion DONE with evidence.** iOS/HealthKit criterion still blocked
(no macOS/Xcode build host and no iPhone+Apple Watch on this run) — tracked as a child issue.

This is the deferred HEA-4 "read real data from a real device" criterion. It closes the
Android half against real, current wearable data. No raw personal series is recorded here or
in the repo — only aggregates, counts, granularity, and source packages. Detailed logs live in
the run scratch dir (auto-removed), never committed.

## 1. Environment (real device)

| | |
|---|---|
| Device | Xiaomi `25113PN0EG` (codename `pudding_eea`), **Android 17 (SDK 37)**, physical, USB `d7712bbb` |
| Health platform | Health Connect (`com.google.android.apps.healthdata`) — `getSdkStatus` = `SDK_AVAILABLE` (3) |
| Data-source apps writing to HC | **Fitbit** (`com.fitbit.FitbitMobile`), **Withings** (`com.withings.wiscale2`), Google Fit, a home-workout app |
| Our app | `com.healthapp` debug build (Expo SDK 57 / RN 0.86, new arch), installed via `:app:installDebug` |
| Read API | **AndroidX `androidx.health.connect:connect-client:1.1.+`** (first-party platform client) in our own Kotlin (`HealthReadProbe.kt`) |

Note: Garmin Connect is installed and holds `WRITE_*` health grants, but the records actually
present for these five metrics originate from **Fitbit** and **Withings** — reported below as
observed, not inferred.

## 2. Method

1. Declared 7 `android.permission.health.READ_*` perms in the app manifest; added `connect-client`;
   bumped `minSdk` to 26 (client requirement).
2. Native probe (`HealthReadProbe.run`) fires from `MainActivity.onCreate` in a coroutine, reads a
   30-day window per record type, logs aggregates to Logcat tag `HEA13READ`.
3. Granted the read perms via `adb shell pm grant` (works on Android 17 — see §5), launched, captured logcat.
4. Repeated with `READ_SLEEP` revoked to observe denied/revoked-after-grant behavior.

## 3. Results — live read, 30-day window (2026-07-02 → 2026-08-01)

Structural metadata only (record counts, cadence, source packages). Raw personal values
(bpm/step/RMSSD/clock-time series) are deliberately omitted from the repo and kept in run scratch.

| Metric | Records | Granularity | Source(s) |
|---|---|---|---|
| Steps | 1000* | fine-grained intervals (page cap → ~2 days covered) | Fitbit, Google Fit, HC phone source |
| Heart rate | 1000* | ~25k intraday samples across the page | Fitbit |
| Resting HR | 30 | ~1/day (nightly) over the window | Fitbit |
| HRV (RMSSD) | 1000* | intraday cadence, not nightly-only | Fitbit |
| Sleep | 41 sessions | full hypnogram (multi-row stages per session) | Fitbit, Withings |
| Exercise | 151 sessions | type histogram over raw HC exercise-type ints `{79, 0, 70}` | Withings, Fitbit, Google Fit, home-workout app |

`*` = hit the **1000-record page cap** (see §4, finding 1). Data is current: the most recent sleep
session ended the morning of the read.

## 4. Contract confirmations (vs HEA-4 §4/§5) and findings

1. **`readRecords` caps at 1000 records/page.** High-frequency types (steps, HR, HRV) truncate —
   steps' 1000 records only spanned ~2 days. **Production read MUST paginate via `pageToken`.**
   (Aggregation APIs / `aggregateGroupByPeriod` avoid this for dashboard rollups.)
2. **HRV on Health Connect is RMSSD-only** (`HeartRateVariabilityRmssdRecord`; no SDNN type exists).
   Confirms HEA-4 §5: Android exposes **RMSSD**, Apple HealthKit exposes **SDNN** — the metrics
   layer must not compare the two numerically across platforms.
3. **Multi-source duplication is real and must be de-duplicated.** Steps came from 3 origins, sleep
   from 2, exercise from 4. Overlapping windows across sources will double-count unless dedup by
   `dataOrigin` + time interval (+ a source-priority rule). Direct evidence for priority #1 (correctness).
4. **Denied/revoked read → `SecurityException` per record type** (not iOS-style silent-empty).
   With `READ_SLEEP` revoked: granted count 7→6, the SLEEP read threw
   `SecurityException: Caller requires android.permission.health.READ_SLEEP`, while still-granted
   reads (resting HR) succeeded in the same pass. Confirms HEA-4 §4 (Android). **Read layer must
   catch per-type and degrade gracefully** — the probe already does.
5. **`pm grant` grants HC read perms on Android 17** without the permission UI — useful for automated
   / e2e tests. Real UX still needs the in-app Health Connect permission dialog.

## 5. iOS / HealthKit — still blocked

The scope requires BOTH platforms. iOS could not be exercised this run: this is a Linux host (no
macOS/Xcode → HealthKit cannot even be built/run) and no iPhone+Apple Watch is attached. This is a
CEO resourcing item (macOS/Xcode build host + a real iPhone with Apple Watch HRV/sleep history).
Tracked as a child issue.

## Appendix A — changes made (all in CNG-generated `android/`, gitignored — preserved here)

- `AndroidManifest.xml`: 7 `android.permission.health.READ_*` + `<package>` query for `com.google.android.apps.healthdata`.
- `app/build.gradle`: `implementation("androidx.health.connect:connect-client:1.1.+")`; `minSdk = max(26, …)`.
- `MainActivity.onCreate`: `HealthReadProbe.run(applicationContext)`.
- `HealthReadProbe.kt`: the verified read (below).

```kotlin
// android/app/src/main/java/com/healthapp/HealthReadProbe.kt  (spike probe; not production)
// Reads Steps / HeartRate / RestingHeartRate / HeartRateVariabilityRmssd / SleepSession /
// ExerciseSession over a 30-day window via androidx.health.connect connect-client, logs
// aggregates (count, span, source packages, min/max) to Logcat tag HEA13READ. Each type is
// read in its own try/catch so a single revoked permission fails only that type.
// Full source captured in the run; see repo history if promoted to a production module.
```

The production read path (a real Expo native module + `TS` interface with pagination, unit
normalization, and multi-source dedup) is deliberately **not** built here — that is metrics-layer
work, gated until this contract was confirmed, which it now is.
