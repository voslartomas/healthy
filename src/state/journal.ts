import { startOfLocalDay } from '../health';
import type { TrendPoint, TrendSeries } from '../health/types';
import { DAY_MS } from './habits';

/**
 * The journal (ADR-009): one entry per local day — tags for how the day went
 * ("sick", "alcohol", "stretched") plus an optional note. Everything here is
 * pure so the carry-over rule and the impact maths are testable with fixed
 * timestamps; persistence is `journalRepository` / `journalService`.
 */

export type JournalTagKey =
  | 'sick'
  | 'injured'
  | 'sore'
  | 'stressed'
  | 'alcohol'
  | 'lateCaffeine'
  | 'lateMeal'
  | 'screens'
  | 'travel'
  | 'meditated'
  | 'stretched'
  | 'sauna';

export interface JournalTag {
  key: JournalTagKey;
  label: string;
  /** 'feel' = how you are (big tiles); 'did' = what happened (pills). */
  group: 'feel' | 'did';
  /**
   * A condition that lasts days (sick, injured). It carries over: Today asks
   * "Still sick?" each morning until the user says they're better.
   */
  carries?: boolean;
  /**
   * Which morning's numbers the tag can have moved. An evening drink shows up
   * in the NEXT morning's HRV; being sick shows up the same day.
   */
  affects: 'sameDay' | 'nextMorning';
}

export const JOURNAL_TAGS: readonly JournalTag[] = [
  {
    key: 'sick',
    label: 'Sick',
    group: 'feel',
    carries: true,
    affects: 'sameDay',
  },
  {
    key: 'injured',
    label: 'Injured',
    group: 'feel',
    carries: true,
    affects: 'sameDay',
  },
  { key: 'sore', label: 'Sore', group: 'feel', affects: 'sameDay' },
  { key: 'stressed', label: 'Stressed', group: 'feel', affects: 'nextMorning' },
  { key: 'alcohol', label: 'Alcohol', group: 'did', affects: 'nextMorning' },
  {
    key: 'lateCaffeine',
    label: 'Late caffeine',
    group: 'did',
    affects: 'nextMorning',
  },
  { key: 'lateMeal', label: 'Late meal', group: 'did', affects: 'nextMorning' },
  {
    key: 'screens',
    label: 'Screens in bed',
    group: 'did',
    affects: 'nextMorning',
  },
  { key: 'travel', label: 'Travel', group: 'did', affects: 'nextMorning' },
  {
    key: 'meditated',
    label: 'Meditated',
    group: 'did',
    affects: 'nextMorning',
  },
  {
    key: 'stretched',
    label: 'Stretched',
    group: 'did',
    affects: 'nextMorning',
  },
  { key: 'sauna', label: 'Sauna', group: 'did', affects: 'nextMorning' },
];

const BY_KEY = new Map(JOURNAL_TAGS.map(t => [t.key, t]));

export function journalTag(key: JournalTagKey): JournalTag {
  return BY_KEY.get(key)!;
}

export function isJournalTagKey(s: string): s is JournalTagKey {
  return BY_KEY.has(s as JournalTagKey);
}

/** Comma-separated column → known keys (unknown ones from a newer build are
 * dropped rather than crashing an older one). */
export function parseJournalTags(
  s: string | null | undefined,
): JournalTagKey[] {
  if (!s) return [];
  return s.split(',').filter(isJournalTagKey);
}

export interface JournalDay {
  /** Local midnight of the day the entry is about. */
  day: number;
  tags: JournalTagKey[];
  /**
   * Conditions the user said were over on this day ("I'm better"). Kept apart
   * from `tags` so an entry that only says "alcohol" doesn't silently end a
   * sickness — only an explicit answer does.
   */
  ended: JournalTagKey[];
  note: string;
  updatedAt: number;
}

/** True when an entry carries nothing worth keeping (it can be deleted). */
export function isEmptyJournalDay(
  d: Pick<JournalDay, 'tags' | 'ended' | 'note'>,
): boolean {
  return d.tags.length === 0 && d.ended.length === 0 && d.note.trim() === '';
}

export function entryFor(
  entries: readonly JournalDay[],
  day: number,
): JournalDay | undefined {
  return entries.find(e => e.day === day);
}

/** How far back an open condition is still asked about. After a week of
 * silence it is assumed over — a stale "Still sick?" is worse than none. */
export const CARRY_LOOKBACK_DAYS = 7;

export interface OpenCondition {
  key: JournalTagKey;
  /** Local midnight of the first day of this stretch. */
  since: number;
  /** Which day `day` would be, counting `since` as day 1. */
  dayNumber: number;
}

/**
 * The first day of the stretch of `key` that includes `day`: walks back over
 * entries carrying the tag, stepping over days without an entry (the user
 * didn't open the app — still sick), and stopping at an entry without it.
 */
export function stretchStart(
  entries: readonly JournalDay[],
  key: JournalTagKey,
  day: number,
): number {
  // Step by local midnights, not by DAY_MS: across a DST change a day is 23
  // or 25 hours and `day - DAY_MS` would miss the previous entry's key.
  const prevDay = (d: number) => startOfLocalDay(d - 1);
  let start = day;
  let cursor = prevDay(day);
  let gap = 0;
  while (gap < CARRY_LOOKBACK_DAYS) {
    const e = entryFor(entries, cursor);
    if (e) {
      if (!e.tags.includes(key) || e.ended.includes(key)) break;
      start = cursor;
      gap = 0;
    } else {
      gap += 1;
    }
    cursor = prevDay(cursor);
  }
  return start;
}

/** Day N of a stretch that began on `since` (1-based, DST-safe by rounding). */
export function dayNumber(since: number, day: number): number {
  return Math.round((day - since) / DAY_MS) + 1;
}

/**
 * Carrying conditions logged recently that today's entry hasn't answered yet —
 * what the Today card asks about ("Still sick? · day 3").
 */
export function pendingConditions(
  entries: readonly JournalDay[],
  now: number,
): OpenCondition[] {
  const today = startOfLocalDay(now);
  const todays = entryFor(entries, today);
  // The most recent earlier entry within the lookback.
  let last: JournalDay | undefined;
  for (const e of entries) {
    if (e.day >= today || e.day < today - CARRY_LOOKBACK_DAYS * DAY_MS)
      continue;
    if (!last || e.day > last.day) last = e;
  }
  if (!last) return [];
  const out: OpenCondition[] = [];
  for (const key of last.tags) {
    if (!journalTag(key).carries || last.ended.includes(key)) continue;
    if (todays && (todays.tags.includes(key) || todays.ended.includes(key))) {
      continue;
    }
    const since = stretchStart(entries, key, last.day);
    out.push({ key, since, dayNumber: dayNumber(since, today) });
  }
  return out;
}

/** Carrying conditions confirmed for `day` itself, with their day numbers. */
export function activeConditions(
  entries: readonly JournalDay[],
  day: number,
): OpenCondition[] {
  const e = entryFor(entries, day);
  if (!e) return [];
  return e.tags
    .filter(k => journalTag(k).carries)
    .map(key => {
      const since = stretchStart(entries, key, day);
      return { key, since, dayNumber: dayNumber(since, day) };
    });
}

/* ── What the tags did to the user's numbers ───────────────────────────── */

export type ImpactMetric = 'recovery' | 'hrv' | 'restingHr' | 'sleep';

export interface MetricEffect {
  metric: ImpactMetric;
  /** Tagged mean minus the mean of the other days, in the metric's unit
   * (recovery points, HRV %, bpm, sleep minutes). */
  delta: number;
  /** Whether the shift is in the good direction for that metric. */
  good: boolean;
  /** Too small to call a change (see {@link NOISE}). */
  flat: boolean;
}

export interface TagImpact {
  key: JournalTagKey;
  /** Tagged days that had numbers to compare. */
  count: number;
  effects: MetricEffect[];
}

/** Minimum days on each side before a comparison is shown. */
export const MIN_TAGGED_DAYS = 3;
export const MIN_OTHER_DAYS = 3;

/** Shifts smaller than these read as "no change" — day-to-day noise. */
const NOISE: Record<ImpactMetric, number> = {
  recovery: 3,
  hrv: 4,
  restingHr: 1.5,
  sleep: 15,
};

function byMorning(points: readonly TrendPoint[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of points) m.set(startOfLocalDay(p.time), p.value);
  return m;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * For each tag with enough history, how the mornings it could have affected
 * compare with every other morning in the series. Evening tags ('nextMorning')
 * are matched to the following morning's numbers; conditions to the same day.
 *
 * This is a plain difference of means over the user's own data — no model, no
 * claim of cause. The UI says so (privacy invariant 4 / ADR-004).
 */
export function tagImpacts(
  entries: readonly JournalDay[],
  trends: Pick<TrendSeries, 'readiness' | 'hrv' | 'restingHr' | 'sleepHours'>,
): TagImpact[] {
  const series: [ImpactMetric, Map<number, number>, boolean][] = [
    ['recovery', byMorning(trends.readiness), true],
    ['hrv', byMorning(trends.hrv), true],
    ['restingHr', byMorning(trends.restingHr), false],
    ['sleep', byMorning(trends.sleepHours), true],
  ];
  const out: TagImpact[] = [];
  for (const tag of JOURNAL_TAGS) {
    const mornings = new Set<number>();
    for (const e of entries) {
      if (!e.tags.includes(tag.key)) continue;
      mornings.add(tag.affects === 'nextMorning' ? e.day + DAY_MS : e.day);
    }
    if (mornings.size < MIN_TAGGED_DAYS) continue;
    // Snap to a local midnight from mid-day: across DST `day + DAY_MS` can be
    // an hour either side of the next midnight.
    const snapped = new Set(
      [...mornings].map(d => startOfLocalDay(d + DAY_MS / 2)),
    );
    const effects: MetricEffect[] = [];
    let count = 0;
    for (const [metric, values, upIsGood] of series) {
      const tagged: number[] = [];
      const other: number[] = [];
      for (const [day, v] of values)
        (snapped.has(day) ? tagged : other).push(v);
      if (tagged.length < MIN_TAGGED_DAYS || other.length < MIN_OTHER_DAYS) {
        continue;
      }
      count = Math.max(count, tagged.length);
      const base = mean(other);
      let delta = mean(tagged) - base;
      if (metric === 'hrv') delta = base > 0 ? (delta / base) * 100 : 0;
      if (metric === 'sleep') delta *= 60;
      effects.push({
        metric,
        delta,
        good: upIsGood ? delta > 0 : delta < 0,
        flat: Math.abs(delta) < NOISE[metric],
      });
    }
    if (effects.length) out.push({ key: tag.key, count, effects });
  }
  // Most evidence first.
  return out.sort((a, b) => b.count - a.count);
}

/** "−14 pts" / "+4%" / "+6 bpm" / "−0h 35m" with a real minus glyph. */
export function formatEffect(
  e: Pick<MetricEffect, 'metric' | 'delta'>,
): string {
  const sign = e.delta < 0 ? '−' : '+';
  const abs = Math.abs(e.delta);
  switch (e.metric) {
    case 'recovery':
      return `${sign}${Math.round(abs)} pts`;
    case 'hrv':
      return `${sign}${Math.round(abs)}%`;
    case 'restingHr':
      return `${sign}${Math.round(abs)} bpm`;
    case 'sleep': {
      const m = Math.round(abs);
      return `${sign}${Math.floor(m / 60)}h ${(m % 60).toString().padStart(2, '0')}m`;
    }
  }
}

export const METRIC_LABEL: Record<ImpactMetric, string> = {
  recovery: 'Recovery',
  hrv: 'HRV',
  restingHr: 'Resting HR',
  sleep: 'Sleep',
};

/* ── For the coach ─────────────────────────────────────────────────────── */

const WEEKDAY = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * The journal lines for the coach's data context: today's entry (with day
 * numbers for conditions), anything still open from earlier, and yesterday.
 * Empty when there's nothing recent — the coach shouldn't hear "no journal".
 */
export function journalContextLines(
  entries: readonly JournalDay[],
  now: number,
): string[] {
  const today = startOfLocalDay(now);
  const lines: string[] = [];
  const describe = (e: JournalDay, day: number) =>
    e.tags
      .map(k => {
        const t = journalTag(k);
        if (!t.carries) return t.label.toLowerCase();
        const since = stretchStart(entries, k, day);
        return `${t.label.toLowerCase()} (day ${dayNumber(since, day)})`;
      })
      .join(', ');
  const todays = entryFor(entries, today);
  if (todays && (todays.tags.length || todays.note.trim())) {
    const parts: string[] = [];
    if (todays.tags.length) parts.push(describe(todays, today));
    if (todays.note.trim()) parts.push(`note: "${todays.note.trim()}"`);
    lines.push(`Journal today: ${parts.join('; ')}.`);
  }
  if (todays?.ended.length) {
    lines.push(
      `Journal: recovered today from ${todays.ended.map(k => journalTag(k).label.toLowerCase()).join(', ')}.`,
    );
  }
  const pending = pendingConditions(entries, now);
  if (pending.length) {
    lines.push(
      `Journal: logged ${pending
        .map(
          p =>
            `${journalTag(p.key).label.toLowerCase()} since ${WEEKDAY[new Date(p.since).getDay()]}`,
        )
        .join(', ')} — not yet confirmed for today.`,
    );
  }
  const yesterday = entryFor(entries, startOfLocalDay(today - DAY_MS / 2));
  if (yesterday && yesterday.tags.length) {
    lines.push(`Journal yesterday: ${describe(yesterday, yesterday.day)}.`);
  }
  return lines;
}
