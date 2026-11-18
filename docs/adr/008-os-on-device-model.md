# ADR 008: The coach runs on the OS's own model (Gemini Nano / Apple Intelligence)

Date: 2026-11-18
Status: Accepted

## Context

The on-device coach ran Gemma 3 4B through `llama.rn`:

- every user had to download a ~2.7 GB GGUF from Hugging Face before the coach
  or the daily brief worked (with a resumable-download subsystem to support it);
- `llama.rn` had to be compiled from source (`rnllamaBuildFromSource`), ~2,000
  C++ translation units at `-O3 -flto`. It made every native build slow and, on
  a machine with many cores and little free RAM, made release builds fail with
  compilers killed for memory;
- the model was held in app memory while the coach was open.

Both mobile platforms now ship a capable on-device model as part of the OS:

- **Android:** Gemini Nano, served by the AICore system service, reachable
  through the ML Kit GenAI **Prompt API** (`com.google.mlkit:genai-prompt`).
- **iOS:** the Apple Intelligence system model, through the **Foundation Models**
  framework (iOS 26+).

The owner's phone (Xiaomi 17, Android 17) has AICore.

## Decision

1. The coach and the daily brief use the OS model only, through one local Expo
   module, `modules/system-llm` (Kotlin + Swift, autolinked from `modules/`, so
   CNG stays intact). It exposes the same stateless contract on both
   platforms: `status`, `download` (Android only), `warmup`,
   `generate(system, prompt, options)`. JS reaches it lazily through
   `src/features/coach/ondevice/systemLlm.ts`.
2. **No fallback model.** Phones without Gemini Nano / Apple Intelligence (most
   mid-range Androids, iPhones before 15 Pro, iOS < 26, Apple Intelligence off)
   show the coach as unavailable, with the reason. Keeping llama.rn as a fallback
   would have kept both of its costs (the build and the 2.7 GB download) for
   exactly the devices least able to afford them.
3. The JSON "action" protocol stays (`models.ts`): tool calls and replies are a
   single JSON object. The OS models expose no grammar constraint, so it is now
   carried by the system instructions; `parseAction` extracts the first balanced
   JSON object from prose/code fences, and the runner keeps its one corrective
   retry for forced tool calls.
4. Both OS models take under ~4K input tokens. `renderTranscript` trims the
   conversation to a character budget, oldest turns first, never the newest.
5. `llama.rn`, its config plugin (`withRnllamaGradleProps`) and the Gemma model
   registry are removed. The old GGUF is deleted from users' devices once
   (`removeLegacyModelFiles` — exact files only; the Whisper voice model shares
   the `models/` directory).

## Consequences

- **Privacy is unchanged or better.** Inference stays on the device; the app no
  longer downloads any language-model weights itself (AICore / iOS manage the
  OS model). Privacy invariant 1 holds.
- **Device coverage shrinks** to phones with an OS model. This is deliberate
  (decision 2).
- **Kotlin 2.3 for the whole Android build.** Every `genai-prompt` release
  (with its `genai-common` and `kotlin-stdlib` 2.3 dependencies) is compiled
  with Kotlin 2.3, while React Native 0.86's template resolves the compiler to
  2.1.20, which refuses to read 2.3 metadata. A per-module
  `-Xskip-metadata-version-check` was tried and does not hold: AGP aligns every
  module's compile classpath with the app's runtime classpath, so the 2.3 stdlib
  reaches all modules (Expo's own failed). The build therefore runs on Kotlin
  2.3.20 throughout (the newest version Expo's `pika-compiler` plugin is
  published for): `kotlinVersion` in `expo-build-properties` (library
  versions, KSP, Compose) plus `plugins/withKotlinCompiler.js`, which pins the
  root buildscript's `kotlin-gradle-plugin` (the compiler) to the same version.
  Remove the plugin once React Native's template ships Kotlin ≥ 2.3.
- **iOS** can only be built and verified on a Mac with Xcode 26; every
  FoundationModels use is behind `canImport` + `@available(iOS 26, *)`, and the
  framework is weak-linked, so older SDKs build and report "unavailable".
- **Languages:** the coach-language list was sized for Gemma (140+ languages);
  the OS models support fewer, so uncommon choices may get weaker replies.
- Voice input still uses the downloaded Whisper model (separate decision); the
  platforms' on-device speech recognisers are the natural next step.

## Making Gemini Nano dependable (field notes)

Tested on a Xiaomi 17 (nano-v2). The model is fast enough (≈ 9–20 s a turn)
but much weaker at the JSON tool protocol than Gemma was, so correctness is
enforced in code rather than hoped for from the prompt. Each item below is a
failure seen on the phone; the fix lives in `ondevice/runner.ts`,
`ondevice/models.ts` or `foodTool.ts`, with a test.

- **Writes end the turn.** A write tool returns its own `confirm` sentence and
  the runner returns it — no second model round (it re-called `log_food`,
  duplicating entries, or replied garbled).
- **Entries are named, not id'd.** Asked to remove the banana, the model
  copied the bread's id out of `list_food_log` (and invented ids like `"1"`).
  `update_food_log` / `delete_food_log` take the food's name, which
  `resolveEntry` matches against today's entries (diacritics/inflection
  tolerant); an id only counts when its entry matches the name. Today's entry
  names are in the data context, so "smaž ty vejce" can become "Eggs".
- **Claims without a tool call are caught.** "Okay, I've deleted the banana"
  with no call at all: `claimsAction` (English + Czech) and a delete request
  answered in words get one corrective round, then an honest "nothing was
  changed". Asked to delete but calling `update_food_log` is refused before it
  writes.
- **History is background, not transcript.** Replayed as live
  `Assistant: {"reply": …}` lines, earlier answers were copied verbatim as the
  answer to new messages. Earlier turns now render as a marked prose block;
  false claims and garbled output are dropped; a forced turn (Log food / New
  workout) sees only its own message; an answer repeating an earlier one gets
  one correction, then the failed tool's own user-facing `say`.
- **Tolerant parsing:** code fences, a ` ```tool ` fence with
  `name` + `args: {…}`, and a reply wrapping another reply are all read.
- **Language:** the reply-language rule is repeated at the end of the prompt;
  in the instructions alone it was ignored.
- **The UI is the reliable path.** Every logged food in the chat (and every
  "Eaten today" row) opens a slider sheet to adjust calories/macros or delete
  the entry, so a wrong estimate never needs the model to fix it.
