import { FoodTagRow } from '../src/db/foodTagsRepository';
import { EMPTY_SNAPSHOT } from '../src/health';
import { startOfDayMs } from '../src/state/habits';
import {
  createHabit,
  currentHabitViews,
  recordSleepOutcomes,
  setHabitChecked,
} from '../src/state/habitsService';
import { tagLoggedFood } from '../src/state/foodTagsService';
import { useFoodTagsStore } from '../src/state/useFoodTagsStore';
import { dayKey, useHabitsStore } from '../src/state/useHabitsStore';
import { useHealthStore } from '../src/state/useHealthStore';

jest.mock('../src/db/habitsRepository', () => ({
  loadHabits: jest.fn(async () => []),
  insertHabit: jest.fn(async () => undefined),
  updateHabit: jest.fn(async () => undefined),
  deleteHabit: jest.fn(async () => undefined),
  loadHabitDays: jest.fn(async () => []),
  setHabitDay: jest.fn(async () => undefined),
  clearHabitDay: jest.fn(async () => undefined),
  pruneHabitDays: jest.fn(async () => undefined),
}));

jest.mock('../src/db/foodTagsRepository', () => ({
  loadFoodTags: jest.fn(async () => []),
  insertFoodTags: jest.fn(async () => undefined),
  deleteFoodTagsForEntry: jest.fn(async () => undefined),
  pruneFoodTags: jest.fn(async () => undefined),
}));

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  useHabitsStore.setState({ habits: [], days: {}, hydrated: true });
  useFoodTagsStore.setState({ rows: [], hydrated: true });
  useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
});

describe('a food habit and the tags on a logged food', () => {
  it('holds today until a watched tag is logged, then breaks', async () => {
    const habit = await createHabit({
      name: 'No junk food',
      type: 'food',
      auto: true,
      allowance: 'never',
      tag: 'junk',
    });

    expect(currentHabitViews()[0].today).toBe('open');

    await tagLoggedFood({ name: 'Fries', tags: ['junk'], entryId: 'e1' });

    const view = currentHabitViews().find(v => v.habit.id === habit.id);
    expect(view?.today).toBe('miss');
  });

  it('leaves a habit watching a different tag alone', async () => {
    await createHabit({
      name: 'No sweets',
      type: 'food',
      auto: true,
      allowance: 'never',
      tag: 'sweets',
    });
    await tagLoggedFood({ name: 'Beer', tags: ['alcohol'], entryId: 'e2' });

    expect(currentHabitViews()[0].today).toBe('open');
  });

  it('forgives the break when the habit has an allowance left', async () => {
    await createHabit({
      name: 'No junk food',
      type: 'food',
      auto: true,
      allowance: 'week',
      tag: 'junk',
    });
    await tagLoggedFood({ name: 'Fries', tags: ['junk'], entryId: 'e3' });

    expect(currentHabitViews()[0].today).toBe('allowed');
  });
});

describe('checking a habit by hand', () => {
  it('holds the day, and un-checking releases it again', async () => {
    const habit = await createHabit({
      name: 'Stretch',
      type: 'other',
      auto: false,
      allowance: 'never',
    });
    const today = startOfDayMs(Date.now());

    await setHabitChecked(habit.id, today, true);
    expect(useHabitsStore.getState().days[dayKey(habit.id, today)]).toBe(
      'held',
    );
    expect(currentHabitViews()[0].today).toBe('held');

    await setHabitChecked(habit.id, today, false);
    expect(
      useHabitsStore.getState().days[dayKey(habit.id, today)],
    ).toBeUndefined();
    expect(currentHabitViews()[0].today).toBe('open');
  });
});

/**
 * A snapshot carrying the given nights. A night is keyed to the day it BEGAN
 * on, so `day` is the evening and the sleep runs into the next morning.
 */
function snapshotWithNights(nights: { day: number; onset: number }[]) {
  const latest = nights[nights.length - 1];
  return {
    ...EMPTY_SNAPSHOT,
    sleepNights: nights,
    sleep: latest
      ? {
          hours: 7.5,
          performancePct: 94,
          lastSessionStart: latest.onset,
          lastSessionEnd: latest.day + DAY_MS + 6 * 60 * 60 * 1000,
          stages: null,
        }
      : null,
  };
}

/** A night that began on `day`: in time by default, late when asked. */
function night(day: number, late = false) {
  return { day, onset: day + (late ? 23.7 : 22.5) * 60 * 60 * 1000 };
}

describe('a sleep habit created today', () => {
  it('scores the nights the platform already holds, not just tonight', async () => {
    const today = startOfDayMs(Date.now());
    // Four nights on record, ending with the one that began YESTERDAY evening.
    const nights = [4, 3, 2, 1].map(back =>
      night(today - back * DAY_MS, back === 3 || back === 1),
    );
    useHealthStore.setState({ snapshot: snapshotWithNights(nights) });

    await createHabit({
      name: 'Asleep before 23:00',
      type: 'sleep',
      auto: true,
      allowance: 'never',
      before: '23:00',
    });

    const view = currentHabitViews()[0];
    const byDay = new Map(
      view.days.map((d, i) => [d, view.statuses[i]] as const),
    );
    expect(byDay.get(nights[0].day)).toBe('auto');
    expect(byDay.get(nights[1].day)).toBe('miss');
    expect(byDay.get(nights[2].day)).toBe('auto');
    expect(byDay.get(nights[3].day)).toBe('miss');
  });

  it('leaves today open until tonight has actually happened', async () => {
    const today = startOfDayMs(Date.now());
    // Last night began YESTERDAY evening and settles yesterday, not today.
    useHealthStore.setState({
      snapshot: snapshotWithNights([night(today - DAY_MS)]),
    });

    await createHabit({
      name: 'Asleep before 23:00',
      type: 'sleep',
      auto: true,
      allowance: 'never',
      before: '23:00',
    });

    const view = currentHabitViews()[0];
    const byDay = new Map(
      view.days.map((d, i) => [d, view.statuses[i]] as const),
    );
    expect(byDay.get(today - DAY_MS)).toBe('auto');
    expect(byDay.get(today)).toBe('open');
  });

  it('leaves nights the platform never reported as no-data', async () => {
    const today = startOfDayMs(Date.now());
    useHealthStore.setState({
      snapshot: snapshotWithNights([night(today - DAY_MS)]),
    });

    await createHabit({
      name: 'Asleep before 23:00',
      type: 'sleep',
      auto: true,
      allowance: 'never',
      before: '23:00',
    });

    const view = currentHabitViews()[0];
    const byDay = new Map(
      view.days.map((d, i) => [d, view.statuses[i]] as const),
    );
    expect(byDay.get(today - DAY_MS)).toBe('auto');
    expect(byDay.get(today - 2 * DAY_MS)).toBe('none');
    expect(byDay.get(today - 5 * DAY_MS)).toBe('none');
  });
});

describe('recordSleepOutcomes', () => {
  it("writes down last night's verdict so the history survives the data window", async () => {
    const habit = await createHabit({
      name: 'Asleep before 23:00',
      type: 'sleep',
      auto: true,
      allowance: 'never',
      before: '23:00',
    });
    const yesterday = startOfDayMs(Date.now()) - DAY_MS;
    // Asleep at 22:48 yesterday evening — yesterday's night, yesterday's row.
    useHealthStore.setState({
      snapshot: snapshotWithNights([night(yesterday)]),
    });

    await recordSleepOutcomes();

    expect(useHabitsStore.getState().days[dayKey(habit.id, yesterday)]).toBe(
      'auto',
    );
  });

  it('records a miss when the night started late', async () => {
    const habit = await createHabit({
      name: 'Asleep before 23:00',
      type: 'sleep',
      auto: true,
      allowance: 'never',
      before: '23:00',
    });
    const yesterday = startOfDayMs(Date.now()) - DAY_MS;
    useHealthStore.setState({
      snapshot: snapshotWithNights([night(yesterday, true)]),
    });

    await recordSleepOutcomes();

    expect(useHabitsStore.getState().days[dayKey(habit.id, yesterday)]).toBe(
      'miss',
    );
  });

  it('freezes every readable night, so the history outlives the read window', async () => {
    const today = startOfDayMs(Date.now());
    const nights = [3, 2, 1].map(back => night(today - back * DAY_MS));
    useHealthStore.setState({ snapshot: snapshotWithNights(nights) });

    const habit = await createHabit({
      name: 'Asleep before 23:00',
      type: 'sleep',
      auto: true,
      allowance: 'never',
      before: '23:00',
    });

    await recordSleepOutcomes();

    const days = useHabitsStore.getState().days;
    for (const night of nights) {
      expect(days[dayKey(habit.id, night.day)]).toBe('auto');
    }

    // The platform forgets the older nights; the rows we wrote still score them.
    useHealthStore.setState({ snapshot: snapshotWithNights([nights[2]]) });
    const view = currentHabitViews()[0];
    const byDay = new Map(
      view.days.map((d, i) => [d, view.statuses[i]] as const),
    );
    expect(byDay.get(nights[0].day)).toBe('auto');
    expect(byDay.get(nights[1].day)).toBe('auto');
  });

  it('never overwrites a day the user resolved by hand', async () => {
    const habit = await createHabit({
      name: 'Asleep before 23:00',
      type: 'sleep',
      auto: true,
      allowance: 'never',
      before: '23:00',
    });
    const yesterday = startOfDayMs(Date.now()) - DAY_MS;
    await setHabitChecked(habit.id, yesterday, true);

    // The sensor says that night ran late; the user already said otherwise.
    useHealthStore.setState({
      snapshot: snapshotWithNights([night(yesterday, true)]),
    });

    await recordSleepOutcomes();

    expect(useHabitsStore.getState().days[dayKey(habit.id, yesterday)]).toBe(
      'held',
    );
  });
});

describe('food tag rows', () => {
  it('are keyed to the health entry so a delete can find them', async () => {
    await tagLoggedFood({
      name: 'Fries',
      tags: ['junk', 'sweets'],
      entryId: 'entry-9',
    });
    const rows: FoodTagRow[] = useFoodTagsStore.getState().rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].entryId).toBe('entry-9');
    expect(rows[0].tags).toEqual(['junk', 'sweets']);
    expect(rows[0].dayStart).toBe(startOfDayMs(Date.now()));
  });

  it('are a no-op when nothing was tagged', async () => {
    await tagLoggedFood({ name: 'Oats', tags: [] });
    expect(useFoodTagsStore.getState().rows).toHaveLength(0);
  });
});
