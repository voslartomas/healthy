import {
  allowanceBudget,
  bedtimeDeadline,
  DAY_MS,
  dayRange,
  dayRangeThrough,
  evaluateHabit,
  Habit,
  HabitDayContext,
  HabitDayStatus,
  habitStreak,
  habitWeeks,
  startOfDayMs,
  startOfWeek,
} from '../src/state/habits';

// Jest pins TZ=UTC (see jest.config.js), so local midnight is UTC midnight and
// a day start is a clean multiple of DAY_MS.
const TODAY = startOfDayMs(Date.UTC(2026, 8, 10, 9, 0)); // Thu 10 Sep 2026
const NOON = TODAY + 13 * 60 * 60 * 1000; // 13:00 — past the catch-up cut-off

function day(offset: number): number {
  return TODAY + offset * DAY_MS;
}

function ctx(over: Partial<HabitDayContext> = {}): HabitDayContext {
  return {
    today: TODAY,
    now: NOON,
    recorded: new Map(),
    tagDays: new Set(),
    sleepOnset: new Map(),
    ...over,
  };
}

function foodHabit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    name: 'No junk food',
    type: 'food',
    auto: true,
    allowance: 'never',
    tag: 'junk',
    createdAt: day(-30),
    ...over,
  };
}

/** Statuses for the last `n` days, oldest first. */
function run(habit: Habit, n: number, context = ctx()): HabitDayStatus[] {
  return evaluateHabit(habit, dayRange(TODAY, n), context);
}

describe('allowance', () => {
  it('forgives nothing, one, or two slips per period', () => {
    expect(allowanceBudget('never')).toBe(0);
    expect(allowanceBudget('week')).toBe(1);
    expect(allowanceBudget('month')).toBe(1);
    expect(allowanceBudget('month2')).toBe(2);
  });
});

describe('bedtimeDeadline', () => {
  it('puts an evening bedtime on the evening of the day itself', () => {
    // "Asleep before 23:00" on Thursday means 23:00 THURSDAY — the night you
    // start that evening is Thursday's night, so it only resolves on Friday.
    expect(bedtimeDeadline(TODAY, '23:00')).toBe(TODAY + 23 * 60 * 60 * 1000);
  });

  it('pushes a small-hours target to the morning after', () => {
    // 01:00 is already past midnight, but it is still the same night.
    expect(bedtimeDeadline(TODAY, '01:00')).toBe(
      TODAY + DAY_MS + 60 * 60 * 1000,
    );
  });

  it('rejects a malformed clock', () => {
    expect(bedtimeDeadline(TODAY, 'bedtime')).toBeNull();
  });
});

describe('an auto food habit', () => {
  it('passes a past day nothing was logged against, and leaves today open', () => {
    const statuses = run(foodHabit(), 3);
    expect(statuses).toEqual(['auto', 'auto', 'open']);
  });

  it('breaks the day a matching tag was logged', () => {
    const statuses = run(foodHabit(), 3, ctx({ tagDays: new Set([day(-1)]) }));
    expect(statuses).toEqual(['auto', 'miss', 'open']);
  });

  it('ignores a tag it does not watch', () => {
    // `tagDays` is built for the habit's own tag, so a habit watching sweets
    // simply never sees the junk day.
    const statuses = run(foodHabit({ tag: 'sweets' }), 3, ctx());
    expect(statuses).toEqual(['auto', 'auto', 'open']);
  });

  it('breaks today too, the moment something is logged', () => {
    const statuses = run(foodHabit(), 3, ctx({ tagDays: new Set([TODAY]) }));
    expect(statuses[2]).toBe('miss');
  });

  it('reads as no-data before the habit existed', () => {
    const statuses = run(foodHabit({ createdAt: day(-1) }), 3);
    expect(statuses).toEqual(['none', 'auto', 'open']);
  });

  it('still lets a deliberate check stand on a day before it existed', () => {
    // The strip invites "tap any past day to fix it", so a tap has to land even
    // on the days the habit did not yet cover.
    const statuses = run(
      foodHabit({ createdAt: day(-1) }),
      3,
      ctx({ recorded: new Map([[day(-2), 'held' as HabitDayStatus]]) }),
    );
    expect(statuses).toEqual(['held', 'auto', 'open']);
  });
});

describe('the allowance', () => {
  it('absorbs the first slip of the week and charges the second', () => {
    // Mon and Tue of the current week (today is Thursday).
    const monday = startOfWeek(TODAY);
    const statuses = evaluateHabit(
      foodHabit({ allowance: 'week' }),
      dayRange(TODAY, 7),
      ctx({ tagDays: new Set([monday, monday + DAY_MS]) }),
    );
    const byDay = new Map(dayRange(TODAY, 7).map((d, i) => [d, statuses[i]]));
    expect(byDay.get(monday)).toBe('allowed');
    expect(byDay.get(monday + DAY_MS)).toBe('miss');
  });

  it('resets on the period boundary', () => {
    const monday = startOfWeek(TODAY);
    const lastWeek = monday - DAY_MS; // Sunday of the week before
    const statuses = evaluateHabit(
      foodHabit({ allowance: 'week' }),
      dayRange(TODAY, 14),
      ctx({ tagDays: new Set([lastWeek, monday]) }),
    );
    const byDay = new Map(dayRange(TODAY, 14).map((d, i) => [d, statuses[i]]));
    // One slip in each week — both forgiven, because the budget is per week.
    expect(byDay.get(lastWeek)).toBe('allowed');
    expect(byDay.get(monday)).toBe('allowed');
  });
});

describe('a manual habit', () => {
  const manual = foodHabit({ auto: false, type: 'other', tag: undefined });

  it('misses a past day that was never checked', () => {
    const statuses = run(manual, 3);
    expect(statuses).toEqual(['miss', 'miss', 'open']);
  });

  it('holds a day the user checked', () => {
    const statuses = run(
      manual,
      3,
      ctx({ recorded: new Map([[day(-1), 'held' as HabitDayStatus]]) }),
    );
    expect(statuses).toEqual(['miss', 'held', 'open']);
  });

  it('keeps yesterday open until noon, so it can still be fixed', () => {
    const beforeNoon = ctx({ now: TODAY + 9 * 60 * 60 * 1000 });
    expect(run(manual, 3, beforeNoon)).toEqual(['miss', 'open', 'open']);
    // …and closes it afterwards.
    expect(run(manual, 3)).toEqual(['miss', 'miss', 'open']);
  });
});

describe('a sleep habit', () => {
  const sleepHabit = foodHabit({
    id: 'h3',
    name: 'Asleep before 23:00',
    type: 'sleep',
    tag: undefined,
    before: '23:00',
  });

  it('holds when the night started before the deadline', () => {
    // Yesterday evening at 22:48 — yesterday's night, and so yesterday's row.
    const onset = day(-1) + 22 * 60 * 60 * 1000 + 48 * 60 * 1000;
    const statuses = run(
      sleepHabit,
      2,
      ctx({ sleepOnset: new Map([[day(-1), onset]]) }),
    );
    expect(statuses[0]).toBe('auto');
  });

  it('breaks when the night started after it', () => {
    const onset = day(-1) + 23 * 60 * 60 * 1000 + 41 * 60 * 1000;
    const statuses = run(
      sleepHabit,
      2,
      ctx({ sleepOnset: new Map([[day(-1), onset]]) }),
    );
    expect(statuses[0]).toBe('miss');
  });

  it('leaves TODAY open — tonight has not happened yet', () => {
    // The day you are living owns the night you are about to have, so it can
    // only be settled tomorrow morning. Even with last night on record.
    const onset = day(-1) + 22 * 60 * 60 * 1000;
    const statuses = run(
      sleepHabit,
      2,
      ctx({ sleepOnset: new Map([[day(-1), onset]]) }),
    );
    expect(statuses[1]).toBe('open');
  });

  it('settles a small-hours bedtime from the same night', () => {
    // "Asleep before 01:00" on Wednesday, actually asleep 00:30 Thursday.
    const lateHabit = foodHabit({
      type: 'sleep',
      tag: undefined,
      before: '01:00',
    });
    const onset = TODAY + 30 * 60 * 1000; // 00:30 today = Wednesday's night
    const statuses = run(
      lateHabit,
      2,
      ctx({ sleepOnset: new Map([[day(-1), onset]]) }),
    );
    expect(statuses[0]).toBe('auto');
  });

  it('falls back to the recorded outcome once the onset is out of reach', () => {
    // This is how history survives: the night's onset is long gone, but the
    // verdict the app wrote down at the time still stands.
    const statuses = run(
      sleepHabit,
      3,
      ctx({ recorded: new Map([[day(-2), 'auto' as HabitDayStatus]]) }),
    );
    expect(statuses[0]).toBe('auto');
    // A night nothing was ever recorded for is "no data", never a miss.
    expect(statuses[1]).toBe('none');
  });
});

describe('habitStreak', () => {
  const days = dayRange(TODAY, 5);

  it('does not let an open today break the run', () => {
    expect(habitStreak(days, ['auto', 'auto', 'auto', 'auto', 'open'])).toBe(4);
  });

  it('counts today once it has held', () => {
    expect(habitStreak(days, ['auto', 'auto', 'auto', 'auto', 'held'])).toBe(5);
  });

  it('stops at the first miss', () => {
    expect(habitStreak(days, ['auto', 'miss', 'auto', 'auto', 'open'])).toBe(2);
  });

  it('counts an allowed slip as held — that is what the allowance is for', () => {
    expect(habitStreak(days, ['auto', 'allowed', 'auto', 'auto', 'open'])).toBe(
      4,
    );
  });
});

describe('habitWeeks', () => {
  it('meets a week with an allowed slip but not one with a miss', () => {
    const days = dayRange(TODAY, 14);
    const statuses: HabitDayStatus[] = days.map((d, i) =>
      i === 1 ? 'allowed' : i === 9 ? 'miss' : 'auto',
    );
    const weeks = habitWeeks(days, statuses, TODAY);
    expect(weeks.length).toBeGreaterThanOrEqual(2);
    const withAllowed = weeks.find(w => w.weekStart === startOfWeek(days[1]));
    const withMiss = weeks.find(w => w.weekStart === startOfWeek(days[9]));
    expect(withAllowed?.met).toBe(true);
    expect(withMiss?.met).toBe(false);
  });

  it('marks a week nothing could be judged in as uncovered', () => {
    const days = dayRange(TODAY, 7);
    const weeks = habitWeeks(
      days,
      days.map(() => 'none'),
      TODAY,
    );
    expect(weeks.every(w => !w.covered)).toBe(true);
    expect(weeks.every(w => !w.met)).toBe(true);
  });

  it('flags the week in progress', () => {
    const days = dayRange(TODAY, 14);
    const weeks = habitWeeks(
      days,
      days.map(() => 'auto'),
      TODAY,
    );
    expect(weeks[weeks.length - 1].current).toBe(true);
    expect(weeks[weeks.length - 2].current).toBe(false);
  });
});

describe('the current week, evaluated Monday → Sunday', () => {
  it('marks the days after today as future', () => {
    const monday = startOfWeek(TODAY); // TODAY is a Thursday
    const week = dayRangeThrough(monday, monday + 6 * DAY_MS);
    expect(week).toHaveLength(7);

    const statuses = evaluateHabit(foodHabit(), week, ctx());
    // Mon–Wed passed on their own, Thursday (today) is still open, and the rest
    // of the week has not happened yet.
    expect(statuses).toEqual([
      'auto',
      'auto',
      'auto',
      'open',
      'future',
      'future',
      'future',
    ]);
  });

  it('does not let those future days extend the streak', () => {
    const monday = startOfWeek(TODAY);
    const week = dayRangeThrough(monday, monday + 6 * DAY_MS);
    const statuses = evaluateHabit(foodHabit(), week, ctx());
    const todayIndex = week.indexOf(TODAY);
    expect(habitStreak(week, statuses, todayIndex)).toBe(3);
  });
});

describe('dayRangeThrough', () => {
  it('walks whole local days, inclusive of both ends', () => {
    const days = dayRangeThrough(day(-2), TODAY);
    expect(days).toEqual([day(-2), day(-1), TODAY]);
  });

  it('agrees with dayRange walking the other way', () => {
    expect(dayRangeThrough(day(-6), TODAY)).toEqual(dayRange(TODAY, 7));
  });
});
