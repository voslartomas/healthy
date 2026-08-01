# HEA-15 — iOS / HealthKit live-read runbook (deferred; turnkey when iOS is scheduled)

Status: **DEFERRED by board decision** (`defer-ios`, HEA-15 interactions `a073b167` +
`fe14b7b3`, both answered by `local-board`, 2026-08-01). The Android half of the HEA-4
"read real data from a real device" criterion is **DONE with evidence**
(`docs/spikes/HEA-13-live-read-evidence.md`). This iOS/HealthKit half is intentionally parked
until we approach iOS launch, because it cannot be built or run without hardware we do not have:

1. a **macOS + Xcode** build/sign host (HealthKit does not compile on Linux — our CI host), and
2. a **physical iPhone paired with an Apple Watch** that has real sleep/HRV history
   (the Simulator has no HealthKit sample data, so it cannot satisfy a *real* read).

This document exists so the eventual pickup is **turnkey**: the read path, the exact steps, and
the precise contract items still needing device confirmation are all captured here while the
context is fresh, instead of being reconstructed from scratch later. No personal health data is
in this repo — when the read is run, record only aggregates/counts/granularity, mirroring HEA-13.

---

## 1. Prerequisites to unblock (CEO resourcing — the deferred item)

| Need | Why | Note |
|---|---|---|
| macOS + Xcode host (physical Mac or authorized cloud-mac runner) | HealthKit frameworks + code-signing only exist on macOS. | A cloud-mac alone is **not** sufficient — it has no Watch data. |
| Physical iPhone (real device, not Simulator) | HealthKit reads return nothing on Simulator; entitlement + on-device authorization required. | Must be signed into an Apple ID with a provisioning profile. |
| Paired Apple Watch with history | Source of sleep + **SDNN** HRV + resting HR. | Needs weeks of wear so sleep/HRV samples exist to read. |

## 2. Turnkey steps (once §1 exists)

1. **Add the HealthKit capability + usage strings** to the CNG-generated `ios/` project
   (mirror how HEA-13 modified the gitignored `android/`; preserve final diffs in this doc's
   Appendix A when done):
   - `ios/HealthApp/HealthApp.entitlements`: `com.apple.developer.healthkit = true`.
   - `Info.plist`: `NSHealthShareUsageDescription` (read rationale). We request **read-only**, so
     `NSHealthUpdateUsageDescription` is not required — do **not** add write scopes (privacy boundary).
   - Enable the **HealthKit** capability in the target (Signing & Capabilities).
   - Configure via the Expo config plugin in `app.json` where possible so it survives `prebuild`
     (`expo-health`/manual plugin) rather than hand-editing the CNG output; note any hand edits here.
2. **Drop in the read probe** `ios/HealthApp/HealthReadProbe.swift` (§Appendix A below), and call
   `HealthReadProbe.run()` once from `AppDelegate.application(_:didFinishLaunchingWithOptions:)`,
   analogous to the Android `HealthReadProbe.run` from `MainActivity.onCreate`.
3. `npx expo run:ios --device` (real device), grant the authorization sheet, read the Xcode/`os_log`
   console filtered to subsystem `com.healthapp` / category `HEA15READ`.
4. **Permission-denied pass:** deny (or Settings → Privacy → Health → revoke) and re-run to confirm
   the opaque-empty behavior predicted in §4 below.
5. Fill in §3 (results) and §5 (contract confirmations) of this doc with the observed numbers, then
   flip the top status to **DONE with evidence** and close HEA-15.

## 3. Results — live read (TO BE FILLED on a real device)

Record structural metadata only (sample counts, cadence, source, history depth) — never raw
personal series (keep those in the run scratch dir, auto-removed, never committed).

| Metric | HK type | Samples (30d) | Granularity observed | History depth | Source |
|---|---|---|---|---|---|
| Sleep | `HKCategoryTypeIdentifierSleepAnalysis` | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| HRV (**SDNN**) | `HKQuantityTypeIdentifierHeartRateVariabilitySDNN` | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| Resting HR | `HKQuantityTypeIdentifierRestingHeartRate` | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| Steps | `HKQuantityTypeIdentifierStepCount` | _tbd_ | _tbd_ | _tbd_ | _tbd_ |
| Workouts | `HKObjectType.workoutType()` | _tbd_ | _tbd_ | _tbd_ | _tbd_ |

## 4. Permission-denied prediction to VERIFY (HEA-4 §4 — iOS "opaque reads")

HEA-4 §4 predicts iOS is the **opposite** of Android (Android was confirmed in HEA-13: denied read
throws `SecurityException`). For iOS the contract to confirm on-device:

- **Denied read is opaque:** a denied read type returns **no error and an empty result** — there is
  no exception, and `authorizationStatus(for:)` for a *read* type reports `.notDetermined` /
  `.sharingDenied` in a way that **cannot distinguish "denied" from "genuinely no data."** So
  `empty ≈ denied ≈ no data` and the UI must **never** claim "permission denied" from emptiness alone.
- **Confirm** that after user grant, reads succeed; after revoke in Settings, reads silently go empty
  again (no thrown error), and that `HKAnchoredObjectQuery` anchors still advance without signaling denial.

**Design implication already recorded (HEA-4 §4):** the cross-platform `HealthPermissionState`
abstraction must normalize into `{ granted | denied | unknown-empty | provider-unavailable }`, and
iOS emptiness maps to `unknown-empty`, never `denied`.

## 5. Contract items still device-unverified (HEA-4 §5) — confirm during the read

- ❌ **Actual per-wearable SDNN cadence** on a specific Apple Watch (HEA-4 §2 says "sporadic /
  opportunistic — a handful of samples/day, sometimes zero on a normal day"). Confirm real
  samples/day on, e.g., a Series 9/10; a zero-SDNN day is **normal, not an error**.
- ❌ **Sleep granularity** actually returned (stage-level category samples vs. in-bed/asleep only)
  and how far back history goes on-device.
- ❌ **SDNN units** round-trip: value read in `HKUnit.secondUnit(with: .milli)` → `ms`, matching the
  HEA-4 mapping — and that we keep iOS-**SDNN** distinct from Android-**RMSSD** (HEA-4 §1 landmine:
  the two HRV algorithms are **not** numerically comparable; never trend them as one series).
- ❌ Whether workouts arrive de-duplicated or whether multiple sources (e.g. a third-party ring app
  also writing to HealthKit) require the same source-priority dedup we proved necessary on Android.

## Appendix A — reference read probe (Swift; from HEA-4 Appendix A, fleshed out; not device-verified)

Spike probe — **not** production. Mirrors the Android `HealthReadProbe.kt`: each type read in its own
error path so one denied/empty type does not abort the others; logs aggregates only.

```swift
// ios/HealthApp/HealthReadProbe.swift  (spike probe; not production)
import HealthKit
import os

enum HealthReadProbe {
    static let log = Logger(subsystem: "com.healthapp", category: "HEA15READ")
    static let store = HKHealthStore()

    static func run() {
        guard HKHealthStore.isHealthDataAvailable() else {
            log.error("HealthKit unavailable on this device"); return   // §1: iPad/Sim etc.
        }
        let read: Set<HKObjectType> = [
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,   // §5: SDNN, ms
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.workoutType(),
        ]
        // Read-only: share set is empty (privacy boundary — we never write health data).
        store.requestAuthorization(toShare: [], read: read) { ok, err in
            if let err = err { log.error("auth error: \(err.localizedDescription)") }
            log.info("auth returned ok=\(ok)")   // NB §4: ok=true even when user denied a read type
            let end = Date(); let start = Calendar.current.date(byAdding: .day, value: -30, to: end)!
            let pred = HKQuery.predicateForSamples(withStart: start, end: end)

            // HRV (SDNN) — anchored incremental read; empty result is AMBIGUOUS (see §4).
            let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!
            let q = HKAnchoredObjectQuery(type: hrv, predicate: pred,
                                          anchor: nil, limit: HKObjectQueryNoLimit) {
                _, samples, _, _, qErr in
                if let qErr = qErr { log.error("HRV query err: \(qErr.localizedDescription)") }
                let s = (samples as? [HKQuantitySample]) ?? []
                let unit = HKUnit.secondUnit(with: .milli)   // ms
                log.info("SDNN samples=\(s.count) (empty may = denied OR no data — §4)")
                if let f = s.first { log.info("SDNN e.g. \(f.quantity.doubleValue(for: unit)) ms @ \(f.startDate)") }
            }
            store.execute(q)

            // Steps — daily statistics (dashboard uses aggregates, not raw samples).
            let steps = HKQuantityType.quantityType(forIdentifier: .stepCount)!
            let sq = HKStatisticsCollectionQuery(quantityType: steps, quantitySamplePredicate: pred,
                        options: .cumulativeSum, anchorDate: start,
                        intervalComponents: DateComponents(day: 1))
            sq.initialResultsHandler = { _, results, _ in
                var days = 0
                results?.enumerateStatistics(from: start, to: end) { st, _ in
                    if st.sumQuantity() != nil { days += 1 }
                }
                log.info("steps: \(days) days with data in window")
            }
            store.execute(sq)

            // Sleep, resting HR, workouts: analogous HKSampleQuery per type, each logging count only.
        }
    }
}
```

*Sources: Apple HealthKit — `HKHealthStore.requestAuthorization`, `HKAnchoredObjectQuery`,
`HKStatisticsCollectionQuery`, `HKCategoryValueSleepAnalysis`, `authorizationStatus(for:)`.
Values reflect the API contract as of the assistant knowledge cutoff; confirm §3/§4/§5 against a
real device with an Apple Watch during the unblocked read step.*
