# HEA-3 — SPIKE: On-device Whisper viability on mid-range hardware

**Verdict: `GO WITH CAVEATS`** — for *batch* (record-then-transcribe) voice logging with
**base.en @ q5_0** (fallback **tiny.en @ q5_0** on the weakest targets).
The one caveat that gates the final sign-off: the latency numbers below are **measured on
an x86 desktop + anchored to published mobile data**, not yet measured on a physical
mid-range phone. See "Caveats" and the follow-up device-validation issue.

Author: Founding Mobile Engineer · Date: 2026-08-01

---

## What was actually done

- Built `whisper.cpp` (ggml 0.18.0) from source, CPU-only, and ran real inference.
- Benchmarked **tiny.en, base.en, small.en** in **f16 and q5_0** quantization.
- Latency on **jfk.wav = 11.0s of real human speech** (5 runs each, not best-case).
- Accuracy on **our vocabulary**: 10 sentences of food names, exercise names, numbers
  and units, synthesized with Piper `en_US-lessac-medium` neural TTS (45.3s total),
  scored by word-level WER + manual transcript review.
- Measured model size on disk and peak resident memory (VmHWM) per model.
- **Privacy check: the entire pipeline is local C++ inference. No network calls during
  transcription. Audio never left the machine.** Only model *weights* are fetched (HTTPS).

### Hardware this was measured on
Intel Core i7-14700K, x86_64, Arch Linux (kernel 7.1.3), AVX2/FMA, CPU-only.
**This is a flagship desktop CPU — the opposite of our target device.** It is used here
as a *controlled baseline*; mobile figures are projected from it (see below), not claimed.

---

## Measured numbers (real, this machine)

| model            | disk    | peak RSS (4T) | total, 11s clip (4T) | (8T)  | our-vocab WER |
|------------------|---------|---------------|----------------------|-------|---------------|
| tiny.en (f16)    | 74.1 MB | 177 MB        | 421 ms               | 348 ms| 18.4%         |
| tiny.en q5_0     | 28.5 MB | 130 MB        | 369 ms               |  —    | 19.1%         |
| base.en (f16)    | 141 MB  | 285 MB        | 797 ms               | 610 ms| 15.8%         |
| **base.en q5_0** | **52.7 MB** | **194 MB** | **700 ms**         |  —    | **19.1%**     |
| small.en (f16)   | 465 MB  |  —            |  —                   |  —    | 16.4%         |

Latency = whisper `total time` (encode+decode), mean of 5 runs. Per-run tiny.en 4T:
421.9 / 422.0 / 426.3 / 438.1 / 397.8 ms — tight, no outliers.
Encode-only (whisper-bench, 4T): tiny.en 200 ms, base.en 468 ms, base.en-q5_0 481 ms.

### Accuracy: the WER number understates real quality
The 16–19% WER is **dominated by desirable normalization**, not errors. Whisper
auto-digitizes numbers and units, which is exactly what food/activity logging wants:

- Reference: *"...three hundred milliliters..."* → Whisper: **"300 milliliters"**
- Reference: *"...five point two kilometers in twenty six minutes..."* → **"5.2 kilometers in 26 minutes"**
- Reference: *"...one hundred and forty kilograms..."* → **"140 kilograms"**

Every one of these counts as WER "errors" but is the output we want.

**True semantic errors with base.en were ~1–2%:** all food nouns (sourdough, quinoa,
avocado, almonds, salmon, broccoli, brown rice, greek yogurt, peanut butter) and all
exercises (deadlifts, cycling, rowing, bulgarian split squats, pull-ups, yoga) were
correct. The only real miss: **"whey protein" → "away protein"** (a homophone), plus one
spurious "50" insertion. tiny.en added more slips ("fish" hallucination; "logged"→"loved"),
which is why **base.en is the pick**.

---

## Projection to mid-range mobile (labeled, not measured on-device)

Published anchors used:
- **iPhone 13 Mini (A15), base, 4T, encode = 1091 ms** (whisper.cpp discussion #89).
  My i7 base.en encode 4T = 468 ms → **this desktop ≈ 2.3× faster than an A15.**
- **Android (unspecified SoC), tiny q8_0, 4T, batch ≈ 4.5s audio in <2s** (RTF < 0.44)
  (whisper.cpp discussion #3567).

A mid-range Android SoC (e.g. Pixel 6a/Tensor G1 mid-cores, Snapdragon 6/7-series,
Dimensity 900) is roughly **2–4× slower than an A15** on sustained NEON CPU work, i.e.
**~5–9× slower than this desktop**. Applying that band to the measured q5_0 totals:

| model (q5_0) | measured 4T, 11s clip | projected mid-range Android, ~10–11s clip |
|--------------|-----------------------|-------------------------------------------|
| tiny.en      | 369 ms                | **~2–4 s**                                |
| base.en      | 700 ms                | **~3.5–6 s**                              |

The base.en projection is consistent with, and slightly more conservative than, the
Android batch anchor above. **For a 5–15s voice note transcribed after the user stops
talking, a 2–6s spinner is acceptable UX.**

---

## Recommendation

- **Ship model:** `base.en @ q5_0` (53 MB, ~194 MB RSS, best accuracy/size).
- **Low-end fallback:** `tiny.en @ q5_0` (28.5 MB) if base is too slow on the weakest
  supported device — selectable at runtime, same interface (`packages/stt/src/index.ts`).
- **Mode:** batch only. Do **not** build live/streaming captioning — it is ~5× slower
  than real-time on Android and unnecessary for our logging flow.
- **Runtime:** `whisper.cpp` behind a native TurboModule/JSI bridge (see ADR-0001).

## Caveats (these are the risks)

1. **Latency is projected, not device-measured.** Final GO sign-off needs one run on a
   physical mid-range phone (Pixel 6a / Galaxy A5x class). Tracked as a follow-up issue.
   I do not have a device or device-farm in this environment — **escalated**.
2. **Battery / thermal over sustained use is unmeasured.** Low risk *by design* (usage is
   a few seconds, a few times/day — not continuous), but must be confirmed on-device.
3. **Accuracy tested on clean synthetic TTS.** Real accented / noisy / fast speech will be
   worse. Need a small real-recording validation set before trusting the coach loop.
4. **Homophones on domain terms** (whey→away) will need a lightweight post-correction /
   confirmation step in the food-logging UI (user can edit before it's saved).

## Reproduce
See `bench/README.md` and `bench/run.sh` — clones whisper.cpp, downloads models,
quantizes, and re-runs every number above.
