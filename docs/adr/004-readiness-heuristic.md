# ADR-004 — Readiness ("recovery") score: a transparent, non-clinical heuristic

Status: Accepted (HEA-18)
Date: 2026-08-01

## Context

The dashboard's hero element is a "Recovery" ring (0–100%). Real wearables
(Whoop, Oura, Garmin Body Battery) each compute a proprietary recovery/readiness
score from raw signals we do not have access to. Health Connect gives us the
_inputs_ — HRV (RMSSD), resting heart rate, sleep — but not a recovery number.

We must show _something_ real in that ring once connected to live data, without:

1. **Fabricating a clinical-looking number** we cannot stand behind (priority #1:
   wrong health data destroys trust permanently), or
2. **Making a medical claim** (an explicit role boundary).

## Decision

Compute readiness as a **transparent, disclosed, non-clinical heuristic** over
three directly-measured inputs, each scored **relative to the user's own 30-day
baseline** so it self-calibrates per person:

| Input                  | Weight | Rule                                                                         |
| ---------------------- | ------ | ---------------------------------------------------------------------------- |
| HRV vs baseline        | 0.50   | Higher HRV than baseline ⇒ more recovered. +15% saturates at 100, −35% at 0. |
| Resting HR vs baseline | 0.30   | Lower RHR than baseline ⇒ more recovered. −6% saturates at 100, +20% at 0.   |
| Last sleep vs 8 h need | 0.20   | Sleep duration as a % of an 8 h need — absolute, not baselined.              |

**Sitting on the baseline scores 88, not the middle of the range.** The original
revision centred both baseline-relative inputs at 65, which meant an ordinary day
— every metric exactly on its own 30-day median — rendered as "65/100" with a
two-thirds-full bar. That reads as a mediocre grade when what it means is "you are
where you always are", i.e. rested. Being at your own normal _is_ the rested
state; the score exists to flag **departures** from it. Hence the asymmetric
spans: a small gain reaches 100, while the drop toward 0 is spread over a much
wider deviation, sized per metric to its real day-to-day noise (resting HR is
stable to a couple of bpm; nightly RMSSD routinely swings 10%). See
`baselineScore` in `src/health/derive.ts`.

Sleep is deliberately **not** baselined. Self-calibration would score a chronic
six-hour sleeper as fully rested for sleeping their usual six hours — the one
input where relative-to-self actively misleads.

Weights renormalize over whatever inputs are present, so a missing metric does
not zero the score. Result buckets: **Recovered ≥ 66**, **Balanced 34–65**,
**Strained < 34**. Returns `null` (→ falls back to sample) unless at least HRV or
RHR is available. Implemented in `src/health/derive.ts::readiness`, unit-tested.

The dashboard copy under the ring is **generated from the same live signals**
(`recoveryCopy` in `DashboardScreen`) — it never asserts "HRV is up" when HRV is
below baseline. Interpretation must be as correct as the number.

## Consequences

- **Honest and inspectable.** The formula is in the repo, weights are explicit,
  and it self-calibrates to the individual. No black box, no medical claim.
- **Deliberately simple.** It is _not_ equivalent to a wearable's proprietary
  score and we do not present it as one. If we later want parity with a specific
  device's readiness, that is a separate, larger modeling effort.
- **HRV algorithm boundary respected.** The score consumes Android RMSSD today;
  when iOS/HealthKit (SDNN) lands, SDNN and RMSSD must be baselined _separately_
  (they are not numerically comparable — see HEA-4). The heuristic already works
  per-baseline, so this is a data-tagging concern, not a formula change.
- **Reversible.** Swapping the heuristic is a one-function change with tests.

## Known simplifications (tracked, not silent)

- `zone2` goal minutes = cardio _session_ minutes, not true HR-zone time (needs
  the HR series binned to the user's zones).
- `core` goal maps to pilates/yoga session types (closest Health Connect proxy).
- Cardio-load dashboard stat is still sample data — a real training-load figure
  needs its own defined formula (follow-up issue).
