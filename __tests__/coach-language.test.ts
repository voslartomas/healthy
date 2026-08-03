import {
  AUTOMATIC,
  COACH_LANGUAGES,
  languageDirective,
  languageLabel,
} from '../src/features/coach/languages';

describe('coach languages', () => {
  it('lists Automatic first and a broad, unique language set', () => {
    expect(COACH_LANGUAGES[0].name).toBe(AUTOMATIC);
    const names = COACH_LANGUAGES.map(l => l.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Czech');
    expect(names.length).toBeGreaterThan(30);
  });

  it('mirrors the user for Automatic and pins a specific language otherwise', () => {
    expect(languageDirective(AUTOMATIC)).toMatch(/same language the user/i);
    expect(languageDirective('Czech')).toMatch(/reply in Czech/i);
  });

  it('labels a language by its endonym, falling back to the name', () => {
    expect(languageLabel('Czech')).toBe('Čeština');
    expect(languageLabel('Made-up')).toBe('Made-up');
  });
});
