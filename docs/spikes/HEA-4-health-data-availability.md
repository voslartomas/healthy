# HEA-4 — Health data availability matrix (HealthKit + Health Connect)

**Status:** documentation deliverable complete; real-device read pending hardware + scaffold (see "What is NOT yet verified").
**Owner:** Founding Mobile Engineer
**Decision context:** Board confirmed Android read path = **Health Connect (on-device)**, not the cloud Google Health API. iOS = HealthKit. Cloud/Fitbit connector deferred as a possible future opt-in import source only.

This is a documentation-first spike output. Every value below is sourced from the platform API contracts (Apple HealthKit, AndroidX Health Connect), which is what a real-device read would confirm — not replace. Where a value depends on the wearable rather than the platform, that is called out explicitly, because **that variance is the actual risk this spike exists to surface.**

---

## 1. Metric → native type mapping

| Metric | HealthKit type | Health Connect record |
|---|---|---|
| Sleep | `HKCategoryTypeIdentifierSleepAnalysis` (category, staged) | `SleepSessionRecord` (session + `Stage[]`) |
| HRV | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | `HeartRateVariabilityRmssdRecord` |
| Resting HR | `HKQuantityTypeIdentifierRestingHeartRate` | `RestingHeartRateRecord` |
| Steps | `HKQuantityTypeIdentifierStepCount` | `StepsRecord` |
| Workouts | `HKWorkout` / `HKWorkoutType` (+ `HKWorkoutActivityType`) | `ExerciseSessionRecord` (+ `ExerciseSegment[]`, `ExerciseLap[]`) |

### ⚠️ Cross-platform normalization landmine (highest-value finding)
**HRV is not the same number on both platforms.**
- HealthKit exposes **SDNN** (standard deviation of NN intervals), in `ms`.
- Health Connect exposes **RMSSD** (root mean square of successive differences), in `ms`.

SDNN and RMSSD are *different HRV algorithms* over the same beat-to-beat intervals and do **not** produce equal values (RMSSD is typically lower and more parasympathetic-weighted). We must **never** display or trend them as one series across platforms without a documented, disclosed conversion — and there is no exact universal conversion. The data layer must tag HRV samples with their algorithm and, for now, keep iOS-SDNN and Android-RMSSD as distinct derived inputs. This alone justifies the spike.

---

## 2. Availability matrix — Apple HealthKit (iOS)

| Metric | Available | Native unit | Sampling granularity | History depth | Behavior on wearable gap |
|---|---|---|---|---|---|
| **Sleep** | Yes | No unit — start/end intervals + category value. iOS 16+: `.inBed`, `.asleepUnspecified`, `.asleepCore`, `.asleepDeep`, `.asleepREM`, `.awake`. Pre-16: only `.inBed`/`.asleep`/`.awake`. | Per-stage segments; each is a time interval, not a fixed cadence. Apple Watch writes staged sleep; iPhone-only writes `.inBed` from Sleep Schedule. | Indefinite on device (bounded by storage). Reads return as far back as any source wrote. | Gap = absence of samples. No interpolation, no zero-fill. **Overlapping samples from multiple sources (Watch + a 3rd-party sleep app) are the real hazard** — must dedupe by `sourceRevision`. |
| **HRV (SDNN)** | Yes | `ms` (`HKUnit.secondUnit(with: .milli)`) | **Sporadic / opportunistic.** Apple Watch samples during Breathe/Mindfulness sessions and sleep — often only a handful of samples per day, irregular. Not a fixed cadence. | Indefinite on device. | Gap = absence. Expect naturally sparse data even with no "gap"; a day with zero SDNN samples is normal, not an error. |
| **Resting HR** | Yes | `count/min` (bpm) | ~1 computed value per day, produced by watchOS. | Indefinite on device. | Gap = missing day(s). No back-fill. |
| **Steps** | Yes | `count` | Many short samples/day from **both** iPhone and Apple Watch. | Indefinite on device. | Gap = absence. **Double-count hazard:** iPhone + Watch both write steps. Must use `HKStatisticsQuery`/`HKStatisticsCollectionQuery` with `.cumulativeSum` (HealthKit de-dups overlapping same-quantity samples across sources) rather than summing raw samples. |
| **Workouts** | Yes | Per field: energy `kcal`, distance `m`, duration `s`; plus `HKWorkoutActivityType`. | Per-session discrete events; optional per-segment/route detail. | Indefinite on device. | Not a "gap" concept — discrete events. Duplicate hazard when two apps log the same workout; dedupe by `sourceRevision` + start/end + type. |

**HealthKit access mechanics**
- Auth request: `requestAuthorization(toShare:read:)`. Read and share (write) authorizations are independent.
- Incremental sync: `HKAnchoredObjectQuery` returns an opaque **anchor**; persisting it gives gap-free, duplicate-free incremental reads — this is the mechanism the data layer should build on, not date-range polling.
- Background refresh: `HKObserverQuery` + `enableBackgroundDelivery(for:frequency:)`.
- Aggregation: `HKStatisticsCollectionQuery` for daily buckets (steps, etc.).

---

## 3. Availability matrix — Android Health Connect

| Metric | Available | Native unit | Sampling granularity | History depth | Behavior on wearable gap |
|---|---|---|---|---|---|
| **Sleep** | Yes | No unit — `SleepSessionRecord` start/end + `Stage[]` (`STAGE_TYPE_DEEP/_LIGHT/_REM/_AWAKE/_SLEEPING/_OUT_OF_BED/_UNKNOWN`). | Per-stage segments within a session. Depends entirely on the writing app (Samsung Health, Fitbit, Google, Oura, Whoop…). | Default read window **30 days**; full history needs `PERMISSION_READ_HEALTH_DATA_HISTORY`. | Gap = absence. **Fragmentation is the core pain:** multiple apps may write overlapping sleep sessions with different stage granularity. Filter/choose by `metadata.dataOrigin` (package name). |
| **HRV (RMSSD)** | Yes | `ms` (`HeartRateVariabilityRmssdRecord.heartRateVariabilityMillis`) | Instantaneous per-record; cadence set by writer, typically sparse (nightly). | Default 30 days; full history needs history permission. | Gap = absence. Many wearables write RMSSD only during sleep, so sparse is normal. |
| **Resting HR** | Yes | bpm (`RestingHeartRateRecord.beatsPerMinute`, Long) | Instantaneous record, typically ~1/day. | Default 30 days; full history needs history permission. | Gap = missing record. |
| **Steps** | Yes | `count` (`StepsRecord.count`, start/end interval) | Interval records; cadence set by writer. | Default 30 days; full history needs history permission. | Gap = absence. **Double-count hazard is worse than iOS:** Google Fit + Samsung Health + Fitbit can each independently write steps for the same period. `aggregate(StepsRecord.COUNT_TOTAL)` de-dups within a single `dataOrigin` but **NOT across different origins** — must pick one origin or the platform double-counts. |
| **Workouts** | Yes | `ExerciseSessionRecord.exerciseType` (enum) + optional segments/laps/route; energy/distance are separate linked records, not fields. | Per-session discrete events. | Default 30 days; full history needs history permission. | Discrete events; duplicate hazard across origins. Dedupe by `dataOrigin` + time + type. |

**Health Connect access mechanics**
- Availability first: `HealthConnectClient.getSdkStatus()` → `SDK_AVAILABLE` / `SDK_UNAVAILABLE` / `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED`. On Android 13 and below, Health Connect is a **separately installable app** (Play Store); Android 14+ ships it in the OS. This gate must run before any read.
- Permissions are per-record-type (`HealthPermission.getReadPermission(RecordType::class)`), requested via the `PermissionController` contract.
- History: `PERMISSION_READ_HEALTH_DATA_HISTORY` required to read older than 30 days.
- Background: `PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND` required for reads outside the foreground.
- Incremental sync: `getChangesToken()` + `getChanges(token)` — the changes API is the gap/duplicate-free incremental mechanism (the Android analogue of HKAnchoredObjectQuery).
- Play Store gate: declared health permissions require a **data-use declaration** in the Play Console before release.

---

## 4. Permission-denied and permission-revoked-after-grant behavior

### HealthKit (iOS) — deliberately opaque reads
- `authorizationStatus(for:)` reports your **share (write)** status reliably. For **read** access, Apple intentionally will **not** tell you whether the user granted or denied — for privacy, a denied read type behaves **identically to "authorized but no data": the query returns an empty result set, no error, no callback.**
- **Consequence:** you cannot distinguish "user denied HRV" from "user has no HRV data." The app must be built to treat empty as ambiguous and never assert "you denied this."
- `getRequestStatusForAuthorization(toShare:read:)` tells you only whether prompting again *would* show UI (`.shouldRequest`) vs. `.unnecessary` — useful to decide whether to re-prompt, not to detect denial.
- **Revoked after grant:** user toggles off in Settings → Privacy & Security → Health → [app]. There is **no callback and no error** — reads simply start returning empty again, indistinguishable from no-data. Detection is by the same ambiguity; UX must offer a "check Health settings" path rather than claim revocation.

### Health Connect (Android) — explicit but must be re-checked every time
- Denied: the read throws `SecurityException`, and the type is absent from `getGrantedPermissions()`. Denial is detectable (unlike iOS).
- **Revoked after grant:** user can revoke in the Health Connect app at any time; the next read throws `SecurityException`. Google explicitly requires **re-checking `getGrantedPermissions()` on every app start / before every read batch** — never cache a past grant.
- **Auto-revocation:** if the app doesn't read/write for **~30 days**, Health Connect automatically revokes its permissions. Long-idle users will silently lose access; the sync layer must re-request gracefully.
- If the user denies the same permission twice, the system may stop showing the dialog (fixed "don't ask again" semantics) — must deep-link to Health Connect settings as fallback.

**Design implication for the data layer:** the two platforms have *opposite* failure signatures — iOS hides denial (empty ≈ denied ≈ no data), Android surfaces it as an exception and auto-revokes on idle. A single cross-platform `HealthPermissionState` abstraction must normalize both into `{ granted | denied | unknown-empty | provider-unavailable }`, and the UI must never claim "permission denied" on iOS from emptiness alone.

---

## 5. What IS verified vs. what is NOT

**Verified (from API contracts — the documentation deliverable):**
- Every metric maps to a first-class native type on both platforms — no missing metric. ✅
- Units, granularity model, history-window rules, and gap semantics per the table above. ✅
- The SDNN-vs-RMSSD HRV mismatch (cross-platform normalization blocker). ✅
- Permission-denied and revoked-after-grant behavior on both platforms, including iOS's opaque-read design and Android's idle auto-revocation. ✅

**NOT yet verified (requires physical hardware + the RN scaffold, neither present in this run):**
- ❌ A live read of real body data from a real iPhone (HealthKit) and a real Android phone with a paired wearable (Health Connect), with logged output/screenshot.
- ❌ The *actual* per-wearable granularity and history a specific device returns (e.g. does a Pixel Watch write RMSSD nightly? how many SDNN samples/day does a Series 9 produce?). The matrix documents the platform contract; only a device reveals the wearable's real behavior — and per this spike's own notes, that variance is the risk.

The remaining work is **blocked on:** (1) HEA-2 RN scaffold landing so there is an app to install, and (2) CEO providing a device path (physical devices, or a hosted device farm). Reference read implementations for both platforms are in Appendix A so that step is turnkey once unblocked.

---

## Appendix A — reference read paths (to wire in once scaffold lands; not yet device-verified)

### iOS — anchored incremental HRV read (Swift, sketch)
```swift
let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!
healthStore.requestAuthorization(toShare: [], read: [hrvType]) { ok, err in
    let q = HKAnchoredObjectQuery(type: hrvType, predicate: nil,
                                  anchor: savedAnchor, limit: HKObjectQueryNoLimit) {
        _, samples, _, newAnchor, _ in
        // samples: [HKQuantitySample]; value in .secondUnit(with: .milli) -> ms
        // persist newAnchor for gap-free incremental sync; empty result is AMBIGUOUS (see §4)
    }
    healthStore.execute(q)
}
```

### Android — Health Connect availability + granted-check + steps aggregate (Kotlin, sketch)
```kotlin
if (HealthConnectClient.getSdkStatus(ctx) != HealthConnectClient.SDK_AVAILABLE) return // §3 gate
val client = HealthConnectClient.getOrCreate(ctx)
val perms = setOf(HealthPermission.getReadPermission(StepsRecord::class))
// RE-CHECK every time — never cache (see §4)
if (!client.permissionController.getGrantedPermissions().containsAll(perms)) { /* request */ }
val total = client.aggregate(
    AggregateRequest(
        metrics = setOf(StepsRecord.COUNT_TOTAL),
        timeRangeFilter = TimeRangeFilter.between(start, end),
        dataOriginFilter = setOf(DataOrigin("com.google.android.apps.fitness")) // pin ONE origin — §3 double-count
    )
)[StepsRecord.COUNT_TOTAL]
```

---

*Sources: Apple HealthKit (`HKAnchoredObjectQuery`, `HKStatisticsQuery`, `authorizationStatus`, sleep-analysis category values), AndroidX Health Connect (`HealthConnectClient`, record type reference, `READ_HEALTH_DATA_HISTORY` / `_IN_BACKGROUND` permissions, `getChanges`). Values reflect the API contracts as of the assistant knowledge cutoff; confirm against a device during the unblocked read step.*
