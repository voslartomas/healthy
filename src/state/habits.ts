import { FoodTagKey } from './foodTags';

/**
 * Daily habits — the "hold the line" counterpart to weekly goals.
 *
 * A goal asks for a total by Sunday; a habit asks for a day to stay clean, every
 * day, and forgives a set number of slips. Three kinds, which differ only in who
 * decides the day held:
 *
 *   • food  — names one {@link FoodTagKey}; the day breaks the moment a food
 *     carrying that tag is logged, and otherwise passes at midnight. May also be
 *     checked by hand (`auto: false`) when the user would rather not tag food.
 *   • sleep — "asleep before 23:00"; read from the night's sleep onset.
 *   • other — the user checks it off.
 *
 * Everything in this module is pure: the statuses, streaks and weekly attainment
 * are derived from (habit, recorded checks, food tags, sleep onsets), never
 * stored as a snapshot. That keeps the Today strip, the catch-up card and the
 * Trends grid from ever disagreeing, and makes the whole thing testable without
 * a database.
 */

export type HabitType = 'food' | 'sleep' | 'other';

/** How many slips are forgiven, and over what period. */
export type HabitAllowance = 'never' | 'week' | 'month' | 'month2';

/**
 * A day's outcome.
 *   auto    — held, and nothing was asked of the user (the food log was clean,
 *             or the night's sleep onset was in time)
 *   held    — the user checked it off
 *   allowed — broken, but inside the allowance: the week still counts
 *   miss    — broken, and the allowance was already spent
 *   open    — still decidable (today, or yesterday before the noon cut-off)
 *   future  — later this week
 *   none    — before the habit existed, or no data ever reached this day
 */
export type HabitDayStatus =
  'auto' | 'held' | 'allowed' | 'miss' | 'open' | 'future' | 'none';

export interface Habit {
  id: string;
  name: string;
  type: HabitType;
  /**
   * Whether the day is decided from data rather than by the user. Food habits
   * can be either; sleep habits are always auto; 'other' is always manual.
   */
  auto: boolean;
  allowance: HabitAllowance;
  /** Food habits: the tag whose presence in today's log breaks the day. */
  tag?: FoodTagKey;
  /** Sleep habits: "23:00" — asleep before this counts as held. */
  before?: string;
  /** Epoch ms the habit was created; days before it read as 'none'. */
  createdAt: number;
}

export interface HabitTypeDef {
  key: HabitType;
  label: string;
  /** The uppercase explainer under the type picker, from the design. */
  note: string;
}

export const HABIT_TYPES: readonly HabitTypeDef[] = [
  {
    key: 'food',
    label: 'FOOD',
    note: 'READS THE TAGS ON THE FOOD YOU LOG — PASSES AT MIDNIGHT IF NOTHING MATCHED',
  },
  {
    key: 'sleep',
    label: 'SLEEP',
    note: 'READS LAST NIGHT FROM YOUR HEALTH DATA — PASSES IF YOU FELL ASLEEP IN TIME',
  },
  {
    key: 'other',
    label: 'OTHER',
    note: 'YOU CHECK IT OFF — YESTERDAY STAYS EDITABLE UNTIL NOON',
  },
] as const;

export interface AllowanceDef {
  key: HabitAllowance;
  label: string;
  /** The sentence shown next to the green check in the habit sheet. */
  word: string;
  /** The terse form appended to a habit row's detail line. */
  short: string;
}

export const ALLOWANCES: readonly AllowanceDef[] = [
  {
    key: 'never',
    label: 'NEVER',
    word: 'Every day has to hold — one miss breaks the week.',
    short: 'NO MISSES ALLOWED',
  },
  {
    key: 'week',
    label: 'ONCE A WEEK',
    word: 'One slip a week still counts as held — the week stays perfect. A second one breaks it.',
    short: '1 MISS/WEEK ALLOWED',
  },
  {
    key: 'month',
    label: 'ONCE A MONTH',
    word: 'One slip a month is forgiven. The week it happens still closes.',
    short: '1 MISS/MONTH ALLOWED',
  },
  {
    key: 'month2',
    label: 'TWICE A MONTH',
    word: 'Two slips a month are forgiven — roughly every other week.',
    short: '2 MISSES/MONTH ALLOWED',
  },
] as const;

/** Bedtimes offered by the sleep-habit picker. */
export const BEDTIMES = ['22:00', '22:30', '23:00', '23:30'] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** How many slips the allowance forgives per period. */
export function allowanceBudget(a: HabitAllowance): number {
  return a === 'never' ? 0 : a === 'month2' ? 2 : 1;
}

function allowanceDef(a: HabitAllowance): AllowanceDef {
  return ALLOWANCES.find(x => x.key === a) ?? ALLOWANCES[0];
}

export function allowanceWord(a: HabitAllowance): string {
  return allowanceDef(a).word;
}

export function allowanceShort(a: HabitAllowance): string {
  return allowanceDef(a).short;
}

/**
 * The local day start before / after `dayStart`.
 *
 * Stepping by a bare DAY_MS drifts on the two days a year a local day is 23 or
 * 25 hours long, so step past the boundary and re-normalise instead.
 */
export function nextDay(dayStart: number): number {
  return startOfDayMs(dayStart + DAY_MS + 6 * 60 * 60 * 1000);
}

export function prevDay(dayStart: number): number {
  return startOfDayMs(dayStart - 6 * 60 * 60 * 1000);
}

/** Monday 00:00 (local) of the week a day belongs to. */
export function startOfWeek(dayStart: number): number {
  // getDay(): 0 = Sunday. Shift so Monday is 0.
  let offset = (new Date(dayStart).getDay() + 6) % 7;
  let d = dayStart;
  while (offset > 0) {
    d = prevDay(d);
    offset -= 1;
  }
  return d;
}

/** Sunday 00:00 (local) of the week a day belongs to. */
export function endOfWeek(dayStart: number): number {
  let d = startOfWeek(dayStart);
  for (let i = 0; i < 6; i += 1) d = nextDay(d);
  return d;
}

/** The bucket a slip is charged to, so the budget resets on the right boundary. */
function periodKey(a: HabitAllowance, dayStart: number): string {
  if (a === 'week') return `w${startOfWeek(dayStart)}`;
  const d = new Date(dayStart);
  return `m${d.getFullYear()}-${d.getMonth()}`;
}

/** Parse "23:00" → minutes past midnight; null when malformed. */
export function parseClock(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * The instant "asleep before `before`" refers to for the day `dayStart`.
 *
 * A day owns the night that STARTS on its own evening: going to bed at 22:30 on
 * Sunday is Sunday's doing, so Sunday's deadline is 23:00 on Sunday and the day
 * only resolves the next morning, once there is a night to read. A small-hours
 * target ("01:00") is already past midnight, so it falls on the morning after —
 * still the same night.
 *
 * (The obvious alternative — crediting the night to the morning you wake on —
 * puts Sunday night's bedtime on Monday's row, which is not how anyone talks
 * about their own bedtime.)
 */
export function bedtimeDeadline(
  dayStart: number,
  before: string,
): number | null {
  const minutes = parseClock(before);
  if (minutes == null) return null;
  const evening = minutes >= 12 * 60;
  return (evening ? dayStart : nextDay(dayStart)) + minutes * 60_000;
}

/** What the raw data says about a day, before the allowance is applied. */
type RawDay = 'future' | 'none' | 'held' | 'pass' | 'break' | 'open';

export interface HabitDayContext {
  /** Local midnight of today. */
  today: number;
  /** Now, for the "fix yesterday until noon" grace. */
  now: number;
  /** Statuses explicitly recorded for this habit, keyed by local day start.
   * 'held' is a user check; 'auto'/'miss' are accrued sleep outcomes. */
  recorded: ReadonlyMap<number, HabitDayStatus>;
  /** Local day starts on which a food carrying this habit's tag was logged. */
  tagDays: ReadonlySet<number>;
  /** Sleep onset (epoch ms) for the night belonging to each local day start. */
  sleepOnset: ReadonlyMap<number, number>;
}

/** Yesterday stays editable until this hour, so a habit checked off late still
 * counts (the design's "FIX YESTERDAY UNTIL NOON"). */
export const CATCHUP_HOUR = 12;

function rawDay(habit: Habit, dayStart: number, ctx: HabitDayContext): RawDay {
  if (dayStart > ctx.today) return 'future';

  // A recorded outcome always wins over what the data would say — including
  // over "this is before the habit existed". That is what makes the week strip
  // editable in both directions: a tap can check a day the log knows nothing
  // about (the days either side of creating the habit included), and it can also
  // break a day the log thought was clean, because you ate the thing and simply
  // didn't log it.
  const recorded = ctx.recorded.get(dayStart);
  if (recorded === 'held') return 'held';
  if (recorded === 'miss') return 'break';

  // Sleep is judged BEFORE the "did the habit exist yet" cut-off, because those
  // nights are a real measurement the platform already holds: a bedtime habit
  // created today can show — and score — the weeks it has on record, rather than
  // filling in one night at a time from now on.
  if (habit.type === 'sleep') {
    const onset = ctx.sleepOnset.get(dayStart);
    if (onset == null) {
      // Recorded outcomes are how that history survives: a night's onset is only
      // readable while the platform's window still reaches it, so the verdict is
      // frozen at the time (see habitsService.recordSleepOutcomes).
      if (recorded === 'auto') return 'pass';
      return dayStart === ctx.today ? 'open' : 'none';
    }
    const deadline = habit.before
      ? bedtimeDeadline(dayStart, habit.before)
      : null;
    if (deadline == null) return 'none';
    return onset <= deadline ? 'pass' : 'break';
  }

  // Food and manual habits have no such record to look back on — a day before
  // the habit existed is a day nobody was tagging or checking anything.
  if (dayStart < startOfDayMs(habit.createdAt)) return 'none';

  if (habit.type === 'food' && habit.auto) {
    if (ctx.tagDays.has(dayStart)) return 'break';
    // An auto food habit passes at midnight — today is still open because a
    // later meal can still break it.
    return dayStart === ctx.today ? 'open' : 'pass';
  }

  // Manual: the user checks it off. Today is open all day, and yesterday stays
  // open until noon so a forgotten check can still be fixed.
  if (dayStart === ctx.today) return 'open';
  if (
    dayStart === ctx.today - DAY_MS &&
    new Date(ctx.now).getHours() < CATCHUP_HOUR
  )
    return 'open';
  return 'break';
}

/** Local midnight of the day a timestamp falls in. Mirrors the health layer's
 * `startOfLocalDay` without importing the derivation module into pure state. */
export function startOfDayMs(time: number): number {
  const offsetMs = new Date(time).getTimezoneOffset() * 60_000;
  return Math.floor((time - offsetMs) / DAY_MS) * DAY_MS + offsetMs;
}

/** A contiguous run of local day starts, oldest first, ending at `end`. */
export function dayRange(end: number, count: number): number[] {
  const days: number[] = [end];
  for (let i = 1; i < count; i += 1) days.unshift(prevDay(days[0]));
  return days;
}

/** Every local day start from `from` through `to`, inclusive. */
export function dayRangeThrough(from: number, to: number): number[] {
  const days: number[] = [];
  for (let d = from; d <= to; d = nextDay(d)) days.push(d);
  return days;
}

/**
 * Resolve a habit's status for each day in `days` (sorted ascending, contiguous).
 *
 * Pass the WHOLE window you care about in one call: the allowance is spent in
 * day order, so evaluating a slice on its own would hand later days a budget
 * that earlier ones had already used.
 */
export function evaluateHabit(
  habit: Habit,
  days: number[],
  ctx: HabitDayContext,
): HabitDayStatus[] {
  const budget = allowanceBudget(habit.allowance);
  const spent = new Map<string, number>();
  return days.map(day => {
    const raw = rawDay(habit, day, ctx);
    if (raw === 'break') {
      const key = periodKey(habit.allowance, day);
      const used = spent.get(key) ?? 0;
      if (used < budget) {
        spent.set(key, used + 1);
        return 'allowed';
      }
      return 'miss';
    }
    if (raw === 'pass') return 'auto';
    return raw;
  });
}

/** Whether a day counts as held (the streak and the week both read this). */
export function isHeld(status: HabitDayStatus): boolean {
  return status === 'auto' || status === 'held' || status === 'allowed';
}

/**
 * Consecutive held days ending today. Today counts only once it has actually
 * held — an 'open' today neither breaks the streak nor extends it, so a habit
 * that has run clean for 18 days still reads "18d" at breakfast.
 *
 * `todayIndex` is where today sits in `statuses`; the evaluated window now runs
 * past today to the end of the week (so the Today strip can show Mon→Sun), and
 * those future days must not be counted.
 */
export function habitStreak(
  days: number[],
  statuses: HabitDayStatus[],
  todayIndex: number = statuses.length - 1,
): number {
  let i = todayIndex;
  if (i >= 0 && statuses[i] === 'open') i -= 1;
  let streak = 0;
  for (; i >= 0; i -= 1) {
    if (!isHeld(statuses[i])) break;
    streak += 1;
  }
  return streak;
}

export interface HabitWeek {
  weekStart: number;
  /** Days held out of the days this week that could be judged. */
  held: number;
  judged: number;
  /** True when nothing in the week was an outright miss. */
  met: boolean;
  /** False when no day in the week could be judged at all — render "no data",
   * never a miss. */
  covered: boolean;
  /** True when this is the week in progress. */
  current: boolean;
}

/**
 * Roll per-day statuses up into weeks (Mon–Sun). A week is "met" when it holds
 * no outright miss — an allowed slip is exactly what the allowance is for, so it
 * must not paint the week red.
 */
export function habitWeeks(
  days: number[],
  statuses: HabitDayStatus[],
  today: number,
): HabitWeek[] {
  const byWeek = new Map<number, HabitDayStatus[]>();
  days.forEach((day, i) => {
    const key = startOfWeek(day);
    const list = byWeek.get(key);
    if (list) list.push(statuses[i]);
    else byWeek.set(key, [statuses[i]]);
  });
  const currentWeek = startOfWeek(today);
  return [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekStart, list]) => {
      const judged = list.filter(
        s => s !== 'future' && s !== 'none' && s !== 'open',
      );
      const held = judged.filter(isHeld).length;
      return {
        weekStart,
        held,
        judged: judged.length,
        met: judged.length > 0 && judged.every(isHeld),
        covered: judged.length > 0,
        current: weekStart === currentWeek,
      };
    });
}
