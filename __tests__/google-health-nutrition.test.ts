import { nutritionToday } from '../src/health/derive';
import {
  buildNutritionLogPayload,
  FetchLike,
  mapGoogleHealthRaw,
  writeFoodEntry,
} from '../src/health/GoogleHealthApi';
import { NutritionEntry } from '../src/health/types';

/**
 * Nutrition read mapping, today-summary derivation, and the food WRITE payload.
 * The write endpoint is not contract-verified against a live sample (the
 * reference dashboard is read-only), so these lock down the SHAPE we send and
 * the graceful-failure behaviour — the parts we control without credentials.
 */

const NOW = Date.UTC(2026, 6, 20, 18, 0, 0); // 2026-07-20T18:00:00Z
const DAY = 24 * 60 * 60 * 1000;

function emptyPayloads() {
  return {
    hrv: [],
    restingHr: [],
    sleep: [],
    steps: [],
    calories: [],
    exercise: [],
    nutrition: [],
  };
}

describe('nutrition read mapping', () => {
  it('maps a nutrition-log point, reading protein from either shape', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        nutrition: [
          {
            dataSource: { application: { packageName: 'com.myfitnesspal' } },
            nutritionLog: {
              interval: {
                startTime: '2026-07-20T12:30:00Z',
                endTime: '2026-07-20T12:30:00Z',
              },
              foodDisplayName: 'Chicken bowl',
              mealType: 'LUNCH',
              energy: { kcal: 640 },
              totalCarbohydrate: { grams: 78 },
              totalFat: { grams: 14 },
              // protein only via the generic nutrients[] array:
              nutrients: [{ nutrient: 'PROTEIN', quantity: { grams: 46 } }],
            },
          },
        ],
      },
      NOW,
    );

    expect(raw.nutrition).toHaveLength(1);
    const e = raw.nutrition[0];
    expect(e.name).toBe('Chicken bowl');
    expect(e.mealType).toBe('LUNCH');
    expect(e.kcal).toBe(640);
    expect(e.proteinG).toBe(46);
    expect(e.carbsG).toBe(78);
    expect(e.fatG).toBe(14);
    expect(e.source).toBe('com.myfitnesspal');
    // The nutrition source is folded into the snapshot's source list.
    expect(raw.sources).toContain('com.myfitnesspal');
  });
});

describe('nutritionToday', () => {
  const entry = (start: number, kcal: number, name: string): NutritionEntry => ({
    start,
    end: start,
    name,
    mealType: null,
    kcal,
    proteinG: 10,
    carbsG: 20,
    fatG: 5,
    source: 'x',
  });

  it('sums only today and sorts meals by time; null when nothing today', () => {
    const startOfToday = NOW - (NOW % DAY);
    const summary = nutritionToday(
      [
        entry(startOfToday - DAY, 999, 'yesterday'), // excluded
        entry(startOfToday + 8 * 3600_000, 300, 'breakfast'),
        entry(startOfToday + 13 * 3600_000, 640, 'lunch'),
      ],
      NOW,
    );
    expect(summary).not.toBeNull();
    expect(summary!.eaten).toBe(940);
    expect(summary!.proteinG).toBe(20);
    expect(summary!.meals.map(m => m.name)).toEqual(['breakfast', 'lunch']);

    expect(nutritionToday([entry(startOfToday - DAY, 500, 'old')], NOW)).toBeNull();
  });
});

describe('food write payload + writeFoodEntry', () => {
  it('builds a nutrition-log body, omitting macros that are absent', () => {
    const body = buildNutritionLogPayload(
      { name: 'Apple', kcal: 95, at: NOW },
      NOW,
    );
    const log = body.dataPoint.nutritionLog as Record<string, unknown>;
    expect(log.foodDisplayName).toBe('Apple');
    expect(log.energy).toEqual({ kcal: 95 });
    expect(log.interval).toEqual({
      startTime: '2026-07-20T18:00:00.000Z',
      endTime: '2026-07-20T18:00:00.000Z',
    });
    // no macros provided → keys absent (not null)
    expect(log).not.toHaveProperty('totalProtein');
    expect(log).not.toHaveProperty('mealType');
  });

  it('includes macros + mealType when provided', () => {
    const body = buildNutritionLogPayload(
      { name: 'Shake', kcal: 220, mealType: 'SNACK', proteinG: 30, carbsG: 8, fatG: 3 },
      NOW,
    );
    const log = body.dataPoint.nutritionLog as Record<string, unknown>;
    expect(log.mealType).toBe('SNACK');
    expect(log.totalProtein).toEqual({ grams: 30 });
    expect(log.totalCarbohydrate).toEqual({ grams: 8 });
    expect(log.totalFat).toEqual({ grams: 3 });
  });

  it('POSTs to the nutrition-log endpoint and returns true on ok', async () => {
    let seenUrl = '';
    let seenMethod = '';
    let seenAuth = '';
    let seenBody = '';
    const fetchStub: FetchLike = async (url, init) => {
      seenUrl = url;
      seenMethod = init?.method ?? '';
      seenAuth = init?.headers?.Authorization ?? '';
      seenBody = init?.body ?? '';
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    };

    const ok = await writeFoodEntry('tok-123', { name: 'Egg', kcal: 78 }, NOW, fetchStub);
    expect(ok).toBe(true);
    expect(seenUrl).toBe(
      'https://health.googleapis.com/v4/users/me/dataTypes/nutrition-log/dataPoints',
    );
    expect(seenMethod).toBe('POST');
    expect(seenAuth).toBe('Bearer tok-123');
    expect(JSON.parse(seenBody).dataPoint.nutritionLog.foodDisplayName).toBe('Egg');
  });

  it('returns false on a non-ok response and never throws on network error', async () => {
    const denied: FetchLike = async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
      text: async () => 'denied',
    });
    expect(await writeFoodEntry('t', { name: 'x', kcal: 1 }, NOW, denied)).toBe(false);

    const boom: FetchLike = async () => {
      throw new Error('network down');
    };
    expect(await writeFoodEntry('t', { name: 'x', kcal: 1 }, NOW, boom)).toBe(false);
  });
});
