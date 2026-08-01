# ADR-005 — Google Health cloud API as a cross-platform data source

Status: Accepted (HEA-18) — CEO-directed
Date: 2026-08-01

## Context

HEA-18 shipped the dashboard wired to **on-device Android Health Connect**
(`modules/health-connect`, Kotlin; ADR from HEA-13). On the reopened issue the
CEO directed us to use the **Google Health cloud API** instead, pointing at an
accepted reference dashboard (`voslartomas/google-health-web-dashboard`).

That reference reads from `https://health.googleapis.com/v4` — Google's cloud
Health API — using OAuth2 + PKCE with `googlehealth.*.readonly` scopes (sleep,
health metrics & measurements, activity & fitness, nutrition). It is a REST API,
so it works identically from React Native, iOS, Android, and web. This is
fundamentally different from Health Connect, which is on-device and Android-only.

Two things are in tension:

1. **Correctness of health data (priority #1).** The v4 field shapes and enums
   differ from Health Connect's. HRV in particular is a landmine (see below).
2. **The privacy positioning.** Our pitch is "your body data does not go to an
   advertising company." Reading from Google's cloud is a departure from the
   strictly-local on-device read.

## Decision

Add the Google Health cloud API as a **source behind the existing
`RawHealthData` boundary**, not as a replacement of the derivation layer.

- `src/health/GoogleHealthApi.ts` fetches each metric from v4 and maps it into
  the same `RawHealthData` shape the native module produces. **All of
  `derive.ts` (dedup, baselines, readiness, auto-tracking) is reused unchanged**
  and stays fully unit-tested (`__tests__/google-health-map.test.ts`, 26 tests).
- `readSnapshot` tries the cloud source **first when a token provider is
  registered**, then falls back to on-device Health Connect, then to the sample
  snapshot. The cloud path is **additive**: with no provider registered,
  behaviour is byte-identical to before, so this cannot regress the Android path.
- The source is **read-only**. We never write the user's health data (unlike the
  reference dashboard's `createExercise`, which we deliberately did not port).

### Correctness decisions (non-obvious, deliberately made)

- **HRV algorithm.** `derive.ts` tags all HRV as **RMSSD** (Android convention;
  RMSSD ≠ SDNN and the two are not numerically comparable — HEA-4 landmine). The
  v4 response exposes an explicit RMSSD field
  (`deepSleep…RootMeanSquareOfSuccessiveDifferencesMilliseconds`) *and* a generic
  `averageHeartRateVariabilityMilliseconds`. We **prefer the RMSSD field** to keep
  the tag honest, and only fall back to the average when RMSSD is absent — a
  documented approximation, not a silent one.
- **Exercise types.** v4 returns STRING enums; `derive.ts` categorizes on the
  Health Connect NUMERIC enum ints. `EXERCISE_TYPE_TO_HC` bridges them so a
  Google-sourced strength/yoga/walk is bucketed identically to a native one.
- **Active calories.** Prefer `activeEnergyBurned` over `totalCalories` (the
  latter includes BMR and would inflate the "active calories" goal).
- **Rollups** (steps, calories) are server-aggregated and arrive pre-deduped, so
  we tag them a single synthetic `'Google Health'` source — the dedup layer then
  cannot cross-origin double count them.

## Privacy boundary (explicit, not softened)

This route reads body data from **Google's cloud**, which is a real change from
the on-device read. The mitigating facts, and why this stays inside our privacy
promise:

- The data flows **device ↔ Google directly** over TLS with explicit user OAuth
  consent. It **never** passes through any HealthApp backend (we have none) and
  no third party beyond Google — with whom the user already chose to store this
  data — ever sees it.
- **No new data is sent to Google.** We only read the user's own existing data
  back. We send nothing but an authenticated GET/rollup query.
- The **audio / speech privacy boundary is untouched** — that remains 100% local.
- On-device Health Connect remains available and is the strictly-more-private
  option (works even for non-Google wearables writing locally). Keeping both lets
  a privacy-maximalist user stay fully local while others get cross-platform
  coverage. The in-app "Synced via …" line discloses the active source.

This is a **product-positioning** call (cloud vs strictly-local), which is the
CEO's to make; the CEO made it on the HEA-18 thread. This ADR records the
tradeoff and the guardrails so the choice is reversible and auditable.

## Remaining wiring (not in this change)

The mapper + fetch layer are done and tested offline. **Live end-to-end is not
yet verified** because it needs:

1. A **Google OAuth client ID** for the app (provisioned in Google Cloud with the
   `googlehealth.*.readonly` scopes) — a credential only the CEO/owner can create.
   The reference web app's `client_secret` must **not** ship in a mobile client;
   we use PKCE (public client), no secret.
2. The **OAuth/PKCE flow + keychain token storage** (`expo-auth-session` +
   `expo-secure-store`, both Expo first-party). It registers a token getter via
   `setGoogleHealthTokenProvider`; until then the cloud path is inert.
3. A **Google Health account with data** to verify a real read on device.

Items 1 and 3 are owner-provided; item 2 is a follow-up implementation task.

## Consequences

- One REST integration serves both platforms (and web), vs two native bridges —
  less native surface to maintain, at the cost of a cloud dependency.
- Requires the user's data to be in Google Health; users whose wearable only
  writes to local Health Connect are still served by the on-device path.
- Sensitive-scope OAuth apps require Google verification before public release —
  a release-gating item to track.
