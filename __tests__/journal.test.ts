import { startOfLocalDay } from '../src/health';
import {
  activeConditions,
  formatEffect,
  JournalDay,
  JournalTagKey,
  journalContextLines,
  parseJournalTags,
  pendingConditions,
  tagImpacts,
} from '../src/state/journal';

/** Local midnight of Nov `d`, 2026 (a Wednesday is the 18th). */
const day = (d: number) => new Date(2026, 10, d).getTime();
/** 9am on Nov `d`. */
const at = (d: number) => new Date(2026, 10, d, 9).getTime();

function entry(
  d: number,
  tags: JournalTagKey[],
  extra: Partial<JournalDay> = {},
): JournalDay {
  return { day: day(d), tags, ended: [], note: '', updatedAt: 0, ...extra };
}

describe('journal tags', () => {
  it('parses the stored column, dropping unknown keys', () => {
    expect(parseJournalTags('sick,alcohol,flying')).toEqual([
      'sick',
      'alcohol',
    ]);
    expect(parseJournalTags('')).toEqual([]);
  });
});

describe('pendingConditions (Today asks "Still sick?")', () => {
  it('carries yesterday’s sickness into today with its day number', () => {
    const entries = [entry(16, ['sick']), entry(17, ['sick', 'alcohol'])];
    expect(pendingConditions(entries, at(18))).toEqual([
      { key: 'sick', since: day(16), dayNumber: 3 },
    ]);
  });

  it('steps over days with no entry at all', () => {
    // Logged Monday, didn't open the app Tuesday: Wednesday is still day 3.
    expect(pendingConditions([entry(16, ['injured'])], at(18))).toEqual([
      { key: 'injured', since: day(16), dayNumber: 3 },
    ]);
  });

  it('stops asking once today answers it either way', () => {
    const sick = entry(17, ['sick']);
    expect(pendingConditions([sick, entry(18, ['sick'])], at(18))).toEqual([]);
    expect(
      pendingConditions([sick, entry(18, [], { ended: ['sick'] })], at(18)),
    ).toEqual([]);
  });

  it('is not ended by an unrelated tag today', () => {
    const entries = [entry(17, ['sick']), entry(18, ['alcohol'])];
    expect(pendingConditions(entries, at(18)).map(p => p.key)).toEqual([
      'sick',
    ]);
  });

  it('never carries tags that don’t last, or anything older than a week', () => {
    expect(
      pendingConditions([entry(17, ['stressed', 'alcohol'])], at(18)),
    ).toEqual([]);
    expect(pendingConditions([entry(10, ['sick'])], at(18))).toEqual([]);
  });
});

describe('activeConditions', () => {
  it('numbers a confirmed stretch from its first day', () => {
    const entries = [
      entry(15, ['sick']),
      entry(16, ['sick']),
      entry(17, ['sick']),
    ];
    expect(activeConditions(entries, day(17))).toEqual([
      { key: 'sick', since: day(15), dayNumber: 3 },
    ]);
  });

  it('starts over after a day that ended it', () => {
    const entries = [
      entry(14, ['sick']),
      entry(15, [], { ended: ['sick'] }),
      entry(17, ['sick']),
    ];
    expect(activeConditions(entries, day(17))[0].dayNumber).toBe(1);
  });
});

describe('tagImpacts', () => {
  /** Readiness each morning Nov 1–20: 80, except the mornings after alcohol. */
  const alcoholNights = [3, 7, 11, 15];
  const readiness = Array.from({ length: 20 }, (_, i) => {
    const d = i + 1;
    return {
      time: at(d),
      value: alcoholNights.includes(d - 1) ? 62 : 80,
    };
  });

  it('matches evening tags to the next morning', () => {
    const entries = alcoholNights.map(d => entry(d, ['alcohol']));
    const [impact] = tagImpacts(entries, {
      readiness,
      hrv: [],
      restingHr: [],
      sleepHours: [],
    });
    expect(impact.key).toBe('alcohol');
    expect(impact.count).toBe(4);
    expect(impact.effects).toEqual([
      { metric: 'recovery', delta: -18, good: false, flat: false },
    ]);
  });

  it('needs three tagged days before it says anything', () => {
    const entries = [entry(3, ['alcohol']), entry(7, ['alcohol'])];
    expect(
      tagImpacts(entries, {
        readiness,
        hrv: [],
        restingHr: [],
        sleepHours: [],
      }),
    ).toEqual([]);
  });

  it('reports HRV as a percentage and calls tiny shifts flat', () => {
    const hrv = readiness.map(p => ({ time: p.time, value: 50 }));
    const entries = [3, 7, 11].map(d => entry(d, ['stretched']));
    const [impact] = tagImpacts(entries, {
      readiness: [],
      hrv,
      restingHr: [],
      sleepHours: [],
    });
    expect(impact.effects).toEqual([
      { metric: 'hrv', delta: 0, good: false, flat: true },
    ]);
  });
});

describe('formatEffect', () => {
  it('formats each metric in its own unit with a real minus', () => {
    expect(formatEffect({ metric: 'recovery', delta: -14.2 })).toBe('−14 pts');
    expect(formatEffect({ metric: 'hrv', delta: 4.4 })).toBe('+4%');
    expect(formatEffect({ metric: 'restingHr', delta: 6 })).toBe('+6 bpm');
    expect(formatEffect({ metric: 'sleep', delta: -35 })).toBe('−0h 35m');
  });
});

describe('journalContextLines (for the coach)', () => {
  it('says what today and yesterday held, with day numbers', () => {
    const entries = [
      entry(16, ['sick']),
      entry(17, ['sick', 'alcohol']),
      entry(18, ['sick'], { note: 'sore throat' }),
    ];
    expect(journalContextLines(entries, at(18))).toEqual([
      'Journal today: sick (day 3); note: "sore throat".',
      'Journal yesterday: sick (day 2), alcohol.',
    ]);
  });

  it('mentions an open condition not yet confirmed today', () => {
    expect(journalContextLines([entry(17, ['injured'])], at(18))).toEqual([
      'Journal: logged injured since Tuesday — not yet confirmed for today.',
      'Journal yesterday: injured (day 1).',
    ]);
  });

  it('is empty with nothing recent', () => {
    expect(journalContextLines([], at(18))).toEqual([]);
    expect(startOfLocalDay(at(18))).toBe(day(18));
  });
});
