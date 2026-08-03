/**
 * On-device speech-to-text (Whisper) model registry.
 *
 * This module is deliberately PURE — no `whisper.rn` and no `expo-file-system`
 * imports — so it can be pulled into UI/state and unit-tested without dragging
 * the native runtime in. The filesystem/path side lives in
 * {@link ./useWhisperStore}; the inference side in {@link ./whisperEngine}.
 *
 * Mirrors the Gemma {@link ./models} registry. A single multilingual model
 * keeps setup to one tap and matches the coach's multi-language support.
 */

import { AUTOMATIC } from '../languages';

/** One downloadable GGML Whisper build. `sizeBytes` is the approximate download
 * size, used for UI copy and as a fallback denominator before the server
 * reports a content length. */
export interface WhisperModel {
  id: string;
  /** Shown on the voice-input download card. */
  label: string;
  /** Direct Hugging Face GGML resolve URL. */
  url: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Whisper small, q5_1 quantized, multilingual (from the canonical whisper.cpp
 * GGML repo). The sweet spot for phone STT: solid accuracy on food names,
 * numbers and non-English speech at ~190 MB — trivial next to the 2.7 GB coach
 * model. `.en` variants are deliberately avoided since the coach is multilingual.
 */
export const WHISPER_MODEL: WhisperModel = {
  id: 'whisper-small-q5_1',
  label: 'Whisper Small',
  url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
  filename: 'ggml-small-q5_1.bin',
  sizeBytes: 190_085_487,
};

/**
 * Map a stored coach-language English name (see {@link ../languages}) to the
 * ISO-639-1 code Whisper expects. "Automatic" and anything unmapped fall back
 * to `'auto'`, letting Whisper detect the spoken language itself (it is good at
 * this), so the transcription language tracks whatever the user actually speaks.
 */
const WHISPER_LANG: Record<string, string> = {
  English: 'en',
  Spanish: 'es',
  Portuguese: 'pt',
  French: 'fr',
  German: 'de',
  Italian: 'it',
  Dutch: 'nl',
  Czech: 'cs',
  Slovak: 'sk',
  Polish: 'pl',
  Ukrainian: 'uk',
  Russian: 'ru',
  Romanian: 'ro',
  Hungarian: 'hu',
  Bulgarian: 'bg',
  Croatian: 'hr',
  Serbian: 'sr',
  Slovenian: 'sl',
  Greek: 'el',
  Swedish: 'sv',
  Norwegian: 'no',
  Danish: 'da',
  Finnish: 'fi',
  Icelandic: 'is',
  Lithuanian: 'lt',
  Latvian: 'lv',
  Estonian: 'et',
  Catalan: 'ca',
  Turkish: 'tr',
  Arabic: 'ar',
  Hebrew: 'he',
  Persian: 'fa',
  Hindi: 'hi',
  Bengali: 'bn',
  Urdu: 'ur',
  Tamil: 'ta',
  Telugu: 'te',
  Marathi: 'mr',
  Gujarati: 'gu',
  Kannada: 'kn',
  Malayalam: 'ml',
  Punjabi: 'pa',
  Nepali: 'ne',
  Sinhala: 'si',
  Indonesian: 'id',
  Malay: 'ms',
  Vietnamese: 'vi',
  Thai: 'th',
  Khmer: 'km',
  Lao: 'lo',
  Burmese: 'my',
  Filipino: 'tl',
  'Chinese (Simplified)': 'zh',
  'Chinese (Traditional)': 'zh',
  Japanese: 'ja',
  Korean: 'ko',
  Mongolian: 'mn',
  Kazakh: 'kk',
  Georgian: 'ka',
  Armenian: 'hy',
  Azerbaijani: 'az',
  Albanian: 'sq',
  Macedonian: 'mk',
  Belarusian: 'be',
  Swahili: 'sw',
  Afrikaans: 'af',
  Welsh: 'cy',
  Irish: 'ga',
};

/** Whisper language code for a stored coach-language name, or `'auto'`. */
export function whisperLangCode(coachLanguage: string): string {
  if (!coachLanguage || coachLanguage === AUTOMATIC) return 'auto';
  return WHISPER_LANG[coachLanguage] ?? 'auto';
}
