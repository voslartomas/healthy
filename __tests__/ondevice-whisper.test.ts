import { AUTOMATIC, COACH_LANGUAGES } from '../src/features/coach/languages';
import {
  deviceWhisperLang,
  resolveVoiceLang,
  WHISPER_MODEL,
  whisperLangCode,
} from '../src/features/coach/ondevice/whisperModels';

describe('whisper model registry', () => {
  it('points at a multilingual GGML build on Hugging Face (not an English-only one)', () => {
    expect(WHISPER_MODEL.url).toMatch(/^https:\/\/huggingface\.co\/.+\.bin$/);
    expect(WHISPER_MODEL.filename).toMatch(/\.bin$/);
    expect(WHISPER_MODEL.filename).not.toMatch(/\.en/);
    expect(WHISPER_MODEL.sizeBytes).toBeGreaterThan(0);
  });
});

describe('whisperLangCode', () => {
  it('maps known coach languages to ISO codes', () => {
    expect(whisperLangCode('English')).toBe('en');
    expect(whisperLangCode('Czech')).toBe('cs');
    expect(whisperLangCode('Chinese (Simplified)')).toBe('zh');
  });

  it('falls back to auto for Automatic, empty, or unknown languages', () => {
    expect(whisperLangCode(AUTOMATIC)).toBe('auto');
    expect(whisperLangCode('')).toBe('auto');
    expect(whisperLangCode('Klingon')).toBe('auto');
  });

  it('resolves every coach language to auto or a short ISO code', () => {
    for (const { name } of COACH_LANGUAGES) {
      const code = whisperLangCode(name);
      expect(code === 'auto' || /^[a-z]{2}$/.test(code)).toBe(true);
    }
  });
});

describe('resolveVoiceLang', () => {
  it('always yields a 2-letter code or auto', () => {
    expect(deviceWhisperLang()).toMatch(/^([a-z]{2}|auto)$/);
  });

  it('prefers the explicit coach language over the device language', () => {
    expect(resolveVoiceLang('Czech')).toBe('cs');
    expect(resolveVoiceLang('German')).toBe('de');
  });

  it('falls back to the device language (never leaves it as auto-detect when known)', () => {
    // In the Node/Jest runtime Intl resolves a locale, so Automatic pins to that
    // device language rather than Whisper's per-clip auto-detect.
    const auto = resolveVoiceLang(AUTOMATIC);
    expect(auto).toMatch(/^([a-z]{2}|auto)$/);
    expect(auto).toBe(deviceWhisperLang());
  });
});
