import { sleepQualityScore } from '../src/health/derive';
import { SleepStages } from '../src/health/types';

/** Stages for a night of `min` minutes with the given deep/REM split. */
function night(min: number, deepPct: number, remPct: number): SleepStages {
  const deepMin = Math.round(min * deepPct);
  const remMin = Math.round(min * remPct);
  return {
    deepMin,
    remMin,
    lightMin: min - deepMin - remMin,
    awakeMin: 8,
  };
}

describe('sleepQualityScore', () => {
  it('marks a short night down even when its stage mix is normal', () => {
    // The reported bug: a sub-6h night scored 98% because the old metric was
    // efficiency (asleep ÷ in bed), which says nothing about how much you slept.
    const short = 5 * 60 + 40; // 340 min
    const score = sleepQualityScore(short, night(short, 0.2, 0.22));
    // A short night is penalised on length AND on both restorative stages at
    // once, which is the point of grading deep/REM on absolute minutes rather
    // than on their share of the night:
    //   deep        68/96  = 70.8  × 0.35 = 24.8
    //   REM         75/105.6 = 71.0 × 0.30 = 21.3
    //   continuity  8min awake, under tolerance = 100 × 0.15 = 15.0
    //   length     340/480  = 70.8  × 0.20 = 14.2
    expect(score).toBe(75);
  });

  it('scores a full night with a full night of deep and REM at 100', () => {
    expect(sleepQualityScore(480, night(480, 0.2, 0.22))).toBe(100);
  });

  it('ranks nights of equal length by their deep and REM', () => {
    const len = 7 * 60;
    const restorative = sleepQualityScore(len, night(len, 0.2, 0.22));
    const shallow = sleepQualityScore(len, night(len, 0.05, 0.08));
    expect(restorative).toBeGreaterThan(shallow);
  });

  it('ranks nights of equal stage mix by their length', () => {
    const long = sleepQualityScore(480, night(480, 0.18, 0.2));
    const brief = sleepQualityScore(300, night(300, 0.18, 0.2));
    expect(long).toBeGreaterThan(brief);
  });

  it('never leaves the 0–100 range', () => {
    // A long night with abundant deep/REM clamps at 100 rather than exceeding it.
    expect(sleepQualityScore(700, night(700, 0.3, 0.3))).toBe(100);
    expect(
      sleepQualityScore(0, { deepMin: 0, remMin: 0, lightMin: 0, awakeMin: 0 }),
    ).toBe(0);
  });

  it('does not reward a long night that was all light sleep', () => {
    const allLight: SleepStages = {
      deepMin: 0,
      remMin: 0,
      lightMin: 480,
      awakeMin: 0,
    };
    // Full length (20) and unbroken (15), but no restorative sleep at all — so
    // it cannot score anywhere near a real night. Under the old length-dominant
    // weighting this same night scored 50.
    expect(sleepQualityScore(480, allLight)).toBe(35);
  });

  it('penalises a fragmented night even at full length with good stages', () => {
    const stages = { deepMin: 96, remMin: 106, lightMin: 278, awakeMin: 0 };
    const unbroken = sleepQualityScore(480, stages);
    const fragmented = sleepQualityScore(480, { ...stages, awakeMin: 75 });
    expect(unbroken).toBe(100);
    // 75 awake = 55 past the 20min tolerance → continuity 31, costing ~10 points.
    expect(fragmented).toBe(90);
    expect(fragmented).toBeLessThan(unbroken);
  });

  it('ignores the brief arousals every normal night has', () => {
    const stages = { deepMin: 96, remMin: 106, lightMin: 278, awakeMin: 0 };
    // Anything up to the tolerance is free — wearables record these and they are
    // not a sign of a bad night.
    expect(sleepQualityScore(480, { ...stages, awakeMin: 18 })).toBe(
      sleepQualityScore(480, stages),
    );
  });
});
