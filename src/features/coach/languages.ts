/**
 * Languages the on-device Gemma coach can converse in. Gemma 3 is trained on
 * 140+ languages; this is a broad, practical subset covering the widely-spoken
 * ones (the model handles them well). The stored value is the English `name`;
 * the picker shows the `native` label. "Automatic" makes the coach reply in
 * whatever language the user writes in.
 */

export interface CoachLanguage {
  /** English name — stored in settings and used in the prompt directive. */
  name: string;
  /** Endonym shown in the picker. */
  native: string;
}

export const AUTOMATIC = 'Automatic';

export const COACH_LANGUAGES: CoachLanguage[] = [
  { name: AUTOMATIC, native: 'Automatic — reply in my language' },
  { name: 'English', native: 'English' },
  { name: 'Spanish', native: 'Español' },
  { name: 'Portuguese', native: 'Português' },
  { name: 'French', native: 'Français' },
  { name: 'German', native: 'Deutsch' },
  { name: 'Italian', native: 'Italiano' },
  { name: 'Dutch', native: 'Nederlands' },
  { name: 'Czech', native: 'Čeština' },
  { name: 'Slovak', native: 'Slovenčina' },
  { name: 'Polish', native: 'Polski' },
  { name: 'Ukrainian', native: 'Українська' },
  { name: 'Russian', native: 'Русский' },
  { name: 'Romanian', native: 'Română' },
  { name: 'Hungarian', native: 'Magyar' },
  { name: 'Bulgarian', native: 'Български' },
  { name: 'Croatian', native: 'Hrvatski' },
  { name: 'Serbian', native: 'Српски' },
  { name: 'Slovenian', native: 'Slovenščina' },
  { name: 'Greek', native: 'Ελληνικά' },
  { name: 'Swedish', native: 'Svenska' },
  { name: 'Norwegian', native: 'Norsk' },
  { name: 'Danish', native: 'Dansk' },
  { name: 'Finnish', native: 'Suomi' },
  { name: 'Icelandic', native: 'Íslenska' },
  { name: 'Lithuanian', native: 'Lietuvių' },
  { name: 'Latvian', native: 'Latviešu' },
  { name: 'Estonian', native: 'Eesti' },
  { name: 'Catalan', native: 'Català' },
  { name: 'Turkish', native: 'Türkçe' },
  { name: 'Arabic', native: 'العربية' },
  { name: 'Hebrew', native: 'עברית' },
  { name: 'Persian', native: 'فارسی' },
  { name: 'Hindi', native: 'हिन्दी' },
  { name: 'Bengali', native: 'বাংলা' },
  { name: 'Urdu', native: 'اردو' },
  { name: 'Tamil', native: 'தமிழ்' },
  { name: 'Telugu', native: 'తెలుగు' },
  { name: 'Marathi', native: 'मराठी' },
  { name: 'Gujarati', native: 'ગુજરાતી' },
  { name: 'Kannada', native: 'ಕನ್ನಡ' },
  { name: 'Malayalam', native: 'മലയാളം' },
  { name: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { name: 'Nepali', native: 'नेपाली' },
  { name: 'Sinhala', native: 'සිංහල' },
  { name: 'Indonesian', native: 'Bahasa Indonesia' },
  { name: 'Malay', native: 'Bahasa Melayu' },
  { name: 'Vietnamese', native: 'Tiếng Việt' },
  { name: 'Thai', native: 'ไทย' },
  { name: 'Khmer', native: 'ខ្មែរ' },
  { name: 'Lao', native: 'ລາວ' },
  { name: 'Burmese', native: 'မြန်မာ' },
  { name: 'Filipino', native: 'Filipino' },
  { name: 'Chinese (Simplified)', native: '简体中文' },
  { name: 'Chinese (Traditional)', native: '繁體中文' },
  { name: 'Japanese', native: '日本語' },
  { name: 'Korean', native: '한국어' },
  { name: 'Mongolian', native: 'Монгол' },
  { name: 'Kazakh', native: 'Қазақша' },
  { name: 'Georgian', native: 'ქართული' },
  { name: 'Armenian', native: 'Հայերեն' },
  { name: 'Azerbaijani', native: 'Azərbaycan' },
  { name: 'Albanian', native: 'Shqip' },
  { name: 'Macedonian', native: 'Македонски' },
  { name: 'Belarusian', native: 'Беларуская' },
  { name: 'Swahili', native: 'Kiswahili' },
  { name: 'Afrikaans', native: 'Afrikaans' },
  { name: 'Welsh', native: 'Cymraeg' },
  { name: 'Irish', native: 'Gaeilge' },
];

/** The endonym for a stored language name (falls back to the name itself). */
export function languageLabel(name: string): string {
  return COACH_LANGUAGES.find(l => l.name === name)?.native ?? name;
}

/** The system-prompt line that pins the coach's reply language. */
export function languageDirective(name: string): string {
  if (name === AUTOMATIC || !name) {
    return 'Reply in the same language the user writes in.';
  }
  return `Always reply in ${name}, even if the user writes in another language. Keep food/number formats natural for that language.`;
}
