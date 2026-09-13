import { resolveMaxHr } from '../src/health/hrZones';
import { exerciseKey } from '../src/health/derive';

/**
 * HR zones are read PER SESSION (ADR-006), so recomputing twelve weeks of them on
 * every periodic deep backfill cost one native round trip per workout — for
 * history that, being in the past, cannot have changed. The reader now accepts the
 * zones the caller already holds and only pays for genuinely new sessions.
 *
 * The hazard this guards is that zones are minutes binned by %HRmax. Reusing zones
 * binned against one HRmax alongside zones binned against another silently
 * mis-grades the history, and HRmax is NOT constant: with no age on the profile it
 * is the highest bpm observed across the read, so reading fewer sessions could
 * lower it.
 */

describe('exerciseKey', () => {
  it('is stable for the same session across reads', () => {
    const session = {
      start: 1_754_000_000_000,
      typeName: 'STRENGTH_TRAINING',
      source: 'com.huami.watch.hmwatchmanager',
    };
    expect(exerciseKey(session)).toBe(exerciseKey({ ...session }));
  });

  it('separates same-instant sessions from different sources or types', () => {
    const base = { start: 1, typeName: 'RUNNING', source: 'a' };
    expect(exerciseKey(base)).not.toBe(exerciseKey({ ...base, source: 'b' }));
    expect(exerciseKey(base)).not.toBe(exerciseKey({ ...base, typeName: 'X' }));
  });
});

describe('resolveMaxHr observed floor', () => {
  const samples = (...bpm: number[]) =>
    bpm.map((b, i) => ({ time: i, bpm: b }));

  it('ignores the floor when an age is known', () => {
    // 220 − 30 = 190, and it does not depend on samples at all, so a read that
    // skipped sessions bins against exactly the same scale as one that did not.
    expect(resolveMaxHr(30, samples(150), 210)).toBe(190);
    expect(resolveMaxHr(30, [], null)).toBe(190);
  });

  it('keeps a previously-observed max from being lowered by a thinner read', () => {
    // The regression: skipping already-known sessions removes their samples, so
    // the observed max falls — and a LOWER HRmax pushes every %HRmax up, silently
    // re-grading the sessions this read did look at into harder zones.
    expect(resolveMaxHr(null, samples(150, 160), 185)).toBe(185);
  });

  it('still rises when this read genuinely saw a harder effort', () => {
    expect(resolveMaxHr(null, samples(150, 195), 185)).toBe(195);
  });

  it('falls back to the floor when this read observed nothing usable', () => {
    // 80bpm is below MIN_TRUSTED_OBSERVED_MAX, so it yields no estimate of its own.
    expect(resolveMaxHr(null, samples(80), 185)).toBe(185);
    expect(resolveMaxHr(null, [], 185)).toBe(185);
  });

  it('is unchanged with no floor supplied', () => {
    expect(resolveMaxHr(null, samples(150, 160))).toBe(160);
    expect(resolveMaxHr(null, samples(80))).toBeNull();
    expect(resolveMaxHr(null, [])).toBeNull();
  });
});
