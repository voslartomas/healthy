import { deriveSnapshot } from '../src/health/derive';
import { RawHealthData } from '../src/health/types';
import { ageFromDob } from '../src/state/useProfileStore';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_754_000_000_000;

function rawWithHrv(algorithm: 'RMSSD' | 'SDNN'): RawHealthData {
  // A few daily HRV samples so the metric + baseline resolve.
  const hrvRmssd = [0, 1, 2, 3].map(d => ({
    value: 50 + d,
    time: NOW - d * DAY,
    source: 'com.fitbit.FitbitMobile',
  }));
  return {
    hrvRmssd,
    hrvAlgorithm: algorithm,
    restingHr: [],
    sleep: [],
    steps: [],
    exercise: [],
    activeEnergy: [],
    totalEnergy: [],
    nutrition: [],
    weight: [],
    bodyFat: [],
    sources: ['com.fitbit.FitbitMobile'],
    readAt: NOW,
  };
}

describe('HRV algorithm tagging flows from the raw source', () => {
  it('tags RMSSD when the source (Health Connect) measured RMSSD', () => {
    const snap = deriveSnapshot(rawWithHrv('RMSSD'), NOW);
    expect(snap.hrv?.algorithm).toBe('RMSSD');
  });

  it('tags SDNN when the source (HealthKit) measured SDNN', () => {
    const snap = deriveSnapshot(rawWithHrv('SDNN'), NOW);
    expect(snap.hrv?.algorithm).toBe('SDNN');
  });

  it('defaults to RMSSD for legacy raw data missing the field', () => {
    const raw = rawWithHrv('RMSSD');
    // Simulate an old cached row without the field.
    delete (raw as Partial<RawHealthData>).hrvAlgorithm;
    const snap = deriveSnapshot(raw, NOW);
    expect(snap.hrv?.algorithm).toBe('RMSSD');
  });
});

describe('ageFromDob', () => {
  it('computes whole years from a birth date', () => {
    const dob = Date.UTC(1990, 0, 1);
    const at = Date.UTC(2020, 0, 1);
    expect(ageFromDob(dob, at)).toBe(30);
  });
  it('returns null for missing or implausible dates', () => {
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob(Date.UTC(1800, 0, 1), NOW)).toBeNull();
  });
});
