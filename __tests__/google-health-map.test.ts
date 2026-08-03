import { deriveSnapshot } from '../src/health/derive';
import {
  exerciseTypeToHc,
  fetchGoogleHealthRaw,
  GoogleHealthPayloads,
  LIGHT_WINDOWS,
  mapGoogleHealthRaw,
} from '../src/health/GoogleHealthApi';

/**
 * Verifies the Google Health cloud source: that raw v4 payloads map into the
 * shared RawHealthData shape correctly (units, time, HRV algorithm, exercise
 * enum, source dedup) and flow through the real derivation layer to a coherent
 * snapshot. No network — the fetch layer is exercised with an injected stub.
 */

// A fixed "now" late in a UTC day so start-of-today windows are unambiguous.
const NOW = Date.UTC(2026, 6, 20, 18, 0, 0); // 2026-07-20T18:00:00Z

function emptyPayloads(): GoogleHealthPayloads {
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

describe('exerciseTypeToHc', () => {
  it('maps the categories derive.ts special-cases to their HC enum ints', () => {
    expect(exerciseTypeToHc('STRENGTH_TRAINING')).toBe(70);
    expect(exerciseTypeToHc('WEIGHTLIFTING')).toBe(65);
    expect(exerciseTypeToHc('PILATES')).toBe(48);
    expect(exerciseTypeToHc('YOGA')).toBe(83);
    expect(exerciseTypeToHc('WALKING')).toBe(79);
  });

  it('maps cardio + unknown types outside the non-cardio set (counts as zone-2)', () => {
    const nonCardio = new Set([70, 65, 48, 83, 79]);
    for (const t of [
      'RUNNING',
      'BIKING',
      'SWIMMING',
      'HIIT',
      'MYSTERY_SPORT',
    ]) {
      expect(nonCardio.has(exerciseTypeToHc(t))).toBe(false);
    }
    expect(exerciseTypeToHc(undefined)).toBe(0);
  });
});

describe('mapGoogleHealthRaw', () => {
  it('prefers the daily-average HRV (what the Health app shows)', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        hrv: [
          {
            dataSource: { device: { displayName: 'Pixel Watch' } },
            dailyHeartRateVariability: {
              date: { year: 2026, month: 7, day: 19 },
              averageHeartRateVariabilityMilliseconds: 40,
              deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 58,
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.hrvRmssd).toHaveLength(1);
    expect(raw.hrvRmssd[0].value).toBe(40); // daily average, not the 58 deep-sleep RMSSD
    expect(raw.hrvRmssd[0].source).toBe('Pixel Watch');
  });

  it('falls back to deep-sleep RMSSD only when the average is absent', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        hrv: [
          {
            dailyHeartRateVariability: {
              date: { year: 2026, month: 7, day: 19 },
              deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 41,
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.hrvRmssd[0].value).toBe(41);
  });

  it('parses resting HR strings to numbers', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        restingHr: [
          {
            dailyRestingHeartRate: {
              date: { year: 2026, month: 7, day: 19 },
              beatsPerMinute: '53',
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.restingHr[0].value).toBe(53);
  });

  it('maps weight (kg) and body-fat (%) samples with their sample time', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        weight: [
          {
            // Real Withings shape: grams, not kilograms.
            dataSource: { device: { manufacturer: 'Withings' } },
            weight: {
              weightGrams: 74085,
              sampleTime: { physicalTime: '2026-07-19T07:00:00Z' },
            },
          },
        ],
        bodyFat: [
          {
            bodyFat: {
              percentage: 17.2,
              sampleTime: { physicalTime: '2026-07-19T07:00:00Z' },
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.weight).toHaveLength(1);
    expect(raw.weight[0].value).toBeCloseTo(74.085);
    expect(raw.weight[0].source).toBe('Withings');
    expect(raw.weight[0].time).toBe(Date.UTC(2026, 6, 19, 7, 0, 0));
    expect(raw.bodyFat[0].value).toBe(17.2);
  });

  it('uses minutesAsleep summary for sleep duration, else the interval', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        sleep: [
          {
            sleep: {
              interval: {
                startTime: '2026-07-19T23:00:00Z',
                endTime: '2026-07-20T07:30:00Z', // 510 min of interval
              },
              summary: { minutesAsleep: '462' },
            },
          },
          {
            sleep: {
              interval: {
                startTime: '2026-07-18T23:00:00Z',
                endTime: '2026-07-19T06:00:00Z', // 420 min, no summary
              },
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.sleep[0].durationMin).toBe(462);
    expect(raw.sleep[1].durationMin).toBe(420);
  });

  it('parses step rollups and tags a single synthetic source (no double count)', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        steps: [
          {
            startTime: '2026-07-19T00:00:00Z',
            endTime: '2026-07-19T23:59:59Z',
            steps: { countSum: '8400' },
          },
          {
            startTime: '2026-07-20T00:00:00Z',
            endTime: '2026-07-20T23:59:59Z',
            steps: { countSum: '5100' },
          },
        ],
      },
      NOW,
    );
    expect(raw.steps.map(s => s.count)).toEqual([8400, 5100]);
    expect(new Set(raw.steps.map(s => s.source))).toEqual(
      new Set(['Google Health']),
    );
  });

  it('prefers active energy over total calories', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        calories: [
          {
            startTime: '2026-07-19T00:00:00Z',
            endTime: '2026-07-19T23:59:59Z',
            activeEnergyBurned: { kcalSum: 480 },
            totalCalories: { kcalSum: 2200 },
          },
        ],
      },
      NOW,
    );
    expect(raw.activeEnergy[0].kcal).toBe(480);
  });

  it('parses civil start/end times when RFC3339 startTime is absent', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        calories: [
          {
            civilStartTime: {
              date: { year: 2026, month: 8, day: 1 },
              time: {},
            },
            civilEndTime: {
              date: { year: 2026, month: 8, day: 1 },
              time: { hours: 23, minutes: 59, seconds: 59 },
            },
            totalCalories: { kcalSum: 2544.5 },
          },
        ],
      },
      NOW,
    );
    // The point has no startTime/endTime — must still map via civil times.
    expect(raw.totalEnergy).toHaveLength(1);
    expect(raw.totalEnergy[0].kcal).toBeCloseTo(2544.5);
    expect(raw.totalEnergy[0].start).toBe(Date.UTC(2026, 7, 1, 0, 0, 0));
  });

  it('maps sleep stage minutes from stagesSummary', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        sleep: [
          {
            sleep: {
              interval: {
                startTime: '2026-07-31T23:00:00Z',
                endTime: '2026-08-01T07:00:00Z',
              },
              summary: {
                minutesAsleep: '420',
                stagesSummary: [
                  { type: 'DEEP', minutes: '90' },
                  { type: 'REM', minutes: '100' },
                  { type: 'LIGHT', minutes: '210' },
                  { type: 'AWAKE', minutes: '20' },
                ],
              },
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.sleep[0].stages).toEqual({
      deepMin: 90,
      remMin: 100,
      lightMin: 210,
      awakeMin: 20,
    });
  });

  it('leaves sleep stages null when there is no stagesSummary', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        sleep: [
          {
            sleep: {
              interval: {
                startTime: '2026-07-31T23:00:00Z',
                endTime: '2026-08-01T07:00:00Z',
              },
              summary: { minutesAsleep: '420' },
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.sleep[0].stages).toBeNull();
  });

  it('maps exercise activeDuration ("Ns") to minutes and the type to HC enum', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        exercise: [
          {
            exercise: {
              interval: {
                startTime: '2026-07-19T17:00:00Z',
                endTime: '2026-07-19T18:00:00Z',
              },
              exerciseType: 'RUNNING',
              activeDuration: '2700s', // 45 min
              metricsSummary: { caloriesKcal: 420 },
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.exercise[0].durationMin).toBe(45);
    expect(raw.exercise[0].exerciseType).toBe(56);
    expect(raw.exercise[0].energyKcal).toBe(420);
  });

  it('maps the exercise displayName (localized title) through', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        exercise: [
          {
            exercise: {
              interval: {
                startTime: '2026-07-19T06:00:00Z',
                endTime: '2026-07-19T06:30:00Z',
              },
              exerciseType: 'WORKOUT',
              displayName: 'Trénink středu těla',
              activeDuration: '1800s',
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.exercise[0].displayName).toBe('Trénink středu těla');
    expect(raw.exercise[0].typeName).toBe('WORKOUT');
    expect(raw.exercise[0].exerciseType).toBe(0);
  });

  it('maps exercise HR-zone durations into per-session minutes', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        exercise: [
          {
            exercise: {
              interval: {
                startTime: '2026-07-19T06:00:00Z',
                endTime: '2026-07-19T07:00:00Z',
              },
              exerciseType: 'RUNNING',
              activeDuration: '3600s',
              metricsSummary: {
                caloriesKcal: 500,
                heartRateZoneDurations: {
                  lightTime: '600s',
                  moderateTime: '1200s',
                  vigorousTime: '300s',
                  peakTime: '0s',
                },
              },
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.exercise[0].hrZones).toEqual({
      lightMin: 10,
      moderateMin: 20,
      vigorousMin: 5,
      peakMin: 0,
    });
    expect(raw.exercise[0].energyKcal).toBe(500);
  });

  it('leaves hrZones null when the exercise has no zone durations', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        exercise: [
          {
            exercise: {
              interval: {
                startTime: '2026-07-19T06:00:00Z',
                endTime: '2026-07-19T06:30:00Z',
              },
              exerciseType: 'STRENGTH_TRAINING',
              activeDuration: '1800s',
            },
          },
        ],
      },
      NOW,
    );
    expect(raw.exercise[0].hrZones).toBeNull();
  });

  it('skips malformed / zero-length records', () => {
    const raw = mapGoogleHealthRaw(
      {
        ...emptyPayloads(),
        restingHr: [
          { dailyRestingHeartRate: { date: { year: 2026, month: 7, day: 1 } } },
        ],
        sleep: [{ sleep: { interval: { startTime: 'x', endTime: 'y' } } }],
        steps: [
          {
            startTime: '2026-07-19T00:00:00Z',
            endTime: '2026-07-19T23:59:59Z',
          },
        ],
      },
      NOW,
    );
    expect(raw.restingHr).toHaveLength(0);
    expect(raw.sleep).toHaveLength(0);
    expect(raw.steps).toHaveLength(0);
  });
});

describe('Google Health → deriveSnapshot end to end', () => {
  it('produces a coherent live snapshot from a realistic payload', () => {
    const payloads: GoogleHealthPayloads = {
      hrv: [3, 2, 1].map(d => ({
        dailyHeartRateVariability: {
          date: { year: 2026, month: 7, day: 20 - d },
          deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds: 55 + d,
        },
      })),
      restingHr: [3, 2, 1].map(d => ({
        dailyRestingHeartRate: {
          date: { year: 2026, month: 7, day: 20 - d },
          beatsPerMinute: String(54 + d),
        },
      })),
      sleep: [
        {
          sleep: {
            interval: {
              startTime: '2026-07-19T23:00:00Z',
              endTime: '2026-07-20T07:00:00Z',
            },
            summary: { minutesAsleep: '450' },
          },
        },
      ],
      steps: [
        {
          startTime: '2026-07-20T00:00:00Z',
          endTime: '2026-07-20T23:59:59Z',
          steps: { countSum: '9000' },
        },
      ],
      calories: [
        {
          startTime: '2026-07-20T00:00:00Z',
          endTime: '2026-07-20T23:59:59Z',
          activeEnergyBurned: { kcalSum: 500 },
        },
      ],
      exercise: [
        {
          exercise: {
            interval: {
              startTime: '2026-07-20T06:00:00Z',
              endTime: '2026-07-20T06:45:00Z',
            },
            exerciseType: 'STRENGTH_TRAINING',
            activeDuration: '2700s',
          },
        },
      ],
      nutrition: [],
    };

    const snapshot = deriveSnapshot(mapGoogleHealthRaw(payloads, NOW), NOW);

    expect(snapshot.live).toBe(true);
    expect(snapshot.hrv?.algorithm).toBe('SDNN');
    expect(snapshot.hrv?.value).toBe(56); // most recent day (d=1), deep-sleep fallback (no average)
    expect(snapshot.restingHr?.value).toBe(55);
    expect(snapshot.sleep?.hours).toBeCloseTo(7.5);
    expect(snapshot.stepsToday).toBe(9000);
    expect(snapshot.tracked.strength).toBe(1);
    expect(snapshot.tracked.calories).toBe(500);
    expect(snapshot.readiness).not.toBeNull();
  });
});

describe('fetchGoogleHealthRaw (injected fetch)', () => {
  it('hits list + rollup endpoints with the bearer token and maps the result', async () => {
    const calls: string[] = [];
    const stubFetch = async (
      url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      calls.push(url);
      expect(init?.headers?.Authorization).toBe('Bearer test-token');
      const body: Record<string, unknown> = url.includes(':dailyRollUp')
        ? {
            rollupDataPoints: url.includes('/steps/')
              ? [
                  {
                    startTime: '2026-07-20T00:00:00Z',
                    endTime: '2026-07-20T23:59:59Z',
                    steps: { countSum: '7200' },
                  },
                ]
              : [],
          }
        : {
            dataPoints: url.includes('daily-resting-heart-rate')
              ? [
                  {
                    dailyRestingHeartRate: {
                      date: { year: 2026, month: 7, day: 20 },
                      beatsPerMinute: '52',
                    },
                  },
                ]
              : [],
          };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      };
    };

    const raw = await fetchGoogleHealthRaw(
      'test-token',
      NOW,
      stubFetch as never,
    );

    expect(raw.steps[0].count).toBe(7200);
    expect(raw.restingHr[0].value).toBe(52);
    // 7 GET lists (hrv, rhr, sleep, exercise [1 page — stub returns no
    // nextPageToken], nutrition, weight, body-fat) + 1 steps rollup + 6
    // total-calories rollup windows (84 days / 14-day API cap) = 14 calls.
    expect(calls.length).toBe(14);
    expect(calls.some(u => u.includes('/weight/'))).toBe(true);
    expect(calls.some(u => u.includes('/body-fat/'))).toBe(true);
    expect(
      calls.some(u => u.includes('exercise') && u.includes('filter=')),
    ).toBe(true);
    expect(calls.some(u => u.includes(':dailyRollUp'))).toBe(true);
    expect(calls.some(u => u.includes('nutrition-log'))).toBe(true);
  });

  it('assembles total-calories across 14-day windows and dedupes the boundary day', async () => {
    const DAY = 86_400_000;
    // Each total-calories window emits its start + end day; window i and i+1
    // therefore share the boundary day NOW−(i+1)·14d — the dedupe must collapse
    // it so no day's burned total is double-counted.
    let calWindow = 0;
    const stubFetch = async (
      url: string,
      _init?: { headers?: Record<string, string> },
    ) => {
      let body: Record<string, unknown> = {
        dataPoints: [],
        rollupDataPoints: [],
      };
      if (url.includes(':dailyRollUp') && url.includes('total-calories')) {
        const i = calWindow++;
        const dayA = new Date(NOW - i * 14 * DAY).toISOString();
        const dayB = new Date(NOW - (i + 1) * 14 * DAY).toISOString();
        body = {
          rollupDataPoints: [
            {
              startTime: dayA,
              endTime: dayA,
              totalCalories: { kcalSum: 2500 },
            },
            {
              startTime: dayB,
              endTime: dayB,
              totalCalories: { kcalSum: 2400 },
            },
          ],
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => JSON.stringify(body),
      };
    };

    const raw = await fetchGoogleHealthRaw('t', NOW, stubFetch as never);

    const days = new Set(raw.totalEnergy.map(e => Math.floor(e.start / DAY)));
    // One record per distinct day — the shared boundary days are not duplicated.
    expect(raw.totalEnergy.length).toBe(days.size);
    // History reaches ~12 weeks back, not just the single 14-day window.
    const minStart = Math.min(...raw.totalEnergy.map(e => e.start));
    expect(NOW - minStart).toBeGreaterThan(80 * DAY);
  });

  it('makes far fewer requests on a light (recent-slice) fetch', async () => {
    const calls: string[] = [];
    const stubFetch = async (url: string) => {
      calls.push(url);
      // Return a step point so getSteps doesn't fall back to a 2nd request;
      // everything else empty. Isolates the request-count of a light fetch.
      const body: Record<string, unknown> =
        url.includes(':dailyRollUp') && url.includes('/steps/')
          ? {
              rollupDataPoints: [
                {
                  startTime: '2026-07-20T00:00:00Z',
                  endTime: '2026-07-20T23:59:59Z',
                  steps: { countSum: '5000' },
                },
              ],
            }
          : { dataPoints: [], rollupDataPoints: [] };
      return {
        ok: true,
        status: 200,
        json: async () => body,
        text: async () => '{}',
      };
    };
    await fetchGoogleHealthRaw('t', NOW, stubFetch as never, LIGHT_WINDOWS);
    // 7 GET lists + 1 steps rollup + 1 single 14-day calorie window = 9,
    // vs 14 for the full deep pull (6 calorie windows).
    expect(calls.length).toBe(9);
  });

  it('degrades a failing metric to empty instead of throwing', async () => {
    const stubFetch = async (url: string) => {
      if (url.includes('daily-resting-heart-rate')) {
        return {
          ok: false,
          status: 403,
          json: async () => ({}),
          text: async () => 'denied',
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ dataPoints: [], rollupDataPoints: [] }),
        text: async () => '{}',
      };
    };
    const raw = await fetchGoogleHealthRaw('t', NOW, stubFetch as never);
    expect(raw.restingHr).toHaveLength(0);
    expect(raw.readAt).toBe(NOW);
  });
});
