import { startOfLocalDay } from '../health';
import type { HealthSnapshot } from '../health/types';
import { Habit, waterTarget } from '../state/habits';
import { activeConditions, JournalDay } from '../state/journal';
import { CalorieGoal, currentCalorieGoal } from '../state/useCalorieGoalsStore';

/**
 * What the Android home-screen widget shows (ADR-010), kept pure so it can be
 * tested with fixed timestamps.
 *
 * The widget never reads health data itself: it runs as a headless JS task
 * whenever the launcher asks, often with the app closed, and Health Connect
 * reads need the app in the foreground. So the app writes a small
 * {@link WidgetData} summary to SQLite whenever a LIVE read lands (or the
 * journal / water habit / calorie goal changes), and the widget only renders
 * that summary. `asOf` is when the health numbers were read: once the local
 * day has turned over, the widget shows "—" and asks the user to open the app,
 * rather than yesterday's numbers as if they were today's (never fabricate).
 */

export type WidgetView = 'water' | 'food' | 'recovery';

/** Tap order: Water → Food → Recovery → Water. */
export const WIDGET_VIEWS: readonly WidgetView[] = [
  'water',
  'food',
  'recovery',
];

export function isWidgetView(v: unknown): v is WidgetView {
  return typeof v === 'string' && (WIDGET_VIEWS as string[]).includes(v);
}

export function nextWidgetView(v: WidgetView): WidgetView {
  return WIDGET_VIEWS[(WIDGET_VIEWS.indexOf(v) + 1) % WIDGET_VIEWS.length];
}

/** The summary persisted for the widget. Version-tagged so a future shape
 * change can ignore an old row instead of rendering garbage. */
export interface WidgetData {
  v: 1;
  /** When the health numbers below were read (epoch ms). */
  asOf: number;
  water: { ml: number | null; targetMl: number };
  food: {
    /** kcal eaten today; null when nothing is logged. */
    eaten: number | null;
    /** burned + the goal's target net; null without an active calorie goal. */
    allowance: number | null;
    goalNet: number | null;
    proteinG: number | null;
    meals: number;
  };
  recovery: {
    pct: number | null;
    state: 'Recovered' | 'Balanced' | 'Strained' | null;
    /** A sick/injured day confirmed in the journal for today. */
    condition: { key: 'sick' | 'injured'; dayNumber: number } | null;
  };
}

export function buildWidgetData(input: {
  snapshot: HealthSnapshot;
  habits: Habit[];
  calorieGoals: CalorieGoal[];
  journal: JournalDay[];
  asOf: number;
}): WidgetData {
  const { snapshot, asOf } = input;
  const goal = currentCalorieGoal(input.calorieGoals, asOf);
  const eaten = snapshot.nutrition?.eaten ?? null;
  // Sick outranks injured: it is the one that changes the advice most.
  const conditions = activeConditions(input.journal, startOfLocalDay(asOf));
  const cond =
    conditions.find(c => c.key === 'sick') ??
    conditions.find(c => c.key === 'injured') ??
    null;
  return {
    v: 1,
    asOf,
    water: {
      ml: snapshot.waterTodayMl,
      targetMl: waterTarget(input.habits).ml,
    },
    food: {
      eaten,
      allowance: goal ? snapshot.energyBurnedToday + goal.targetNet : null,
      goalNet: goal?.targetNet ?? null,
      proteinG: snapshot.nutrition ? snapshot.nutrition.proteinG : null,
      meals: snapshot.nutrition?.meals.length ?? 0,
    },
    recovery: {
      pct: snapshot.readiness?.pct ?? null,
      state: snapshot.readiness?.state ?? null,
      condition:
        cond && (cond.key === 'sick' || cond.key === 'injured')
          ? { key: cond.key, dayNumber: cond.dayNumber }
          : null,
    },
  };
}

/** Parse a stored row; anything unexpected reads as "no data yet". */
export function parseWidgetData(raw: string | null): WidgetData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<WidgetData>;
    return d && d.v === 1 && typeof d.asOf === 'number'
      ? (d as WidgetData)
      : null;
  } catch {
    return null;
  }
}

/** Which palette a view is drawn in. */
export type WidgetTone = 'water' | 'food' | 'good' | 'bad';

/** Everything the widget layout needs, already worded. */
export interface WidgetModel {
  view: WidgetView;
  label: string;
  tone: WidgetTone;
  big: string;
  unit: string;
  sub: string;
  /** 0–1 fill of the glass (water) or bar (food, recovery). */
  fill: number;
  /** The water view draws a glass; the others a bar. */
  glass: boolean;
  /** True when there is nothing current to show: the big number is "—". */
  empty: boolean;
  foot: string;
  a11y: string;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function clock(t: number): string {
  const d = new Date(t);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 1240 → "1 240", like the Food screen. */
export function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** ml → "1.25" (litres, two decimals max). */
function litres(ml: number): string {
  return String(Number((ml / 1000).toFixed(2)));
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Word one view. `data` null = the app hasn't written anything yet (just
 * installed, or never opened since the widget was added).
 */
export function widgetModel(
  data: WidgetData | null,
  view: WidgetView,
  now: number,
): WidgetModel {
  const stale = !data || startOfLocalDay(data.asOf) !== startOfLocalDay(now);
  const nextLabel = nextWidgetView(view);
  let foot: string;
  if (!data) foot = 'Not updated yet';
  else if (!stale) foot = `Updated ${clock(data.asOf)} · tap for ${nextLabel}`;
  else {
    const daysAgo = Math.round(
      (startOfLocalDay(now) - startOfLocalDay(data.asOf)) / 86_400_000,
    );
    foot = `Last updated ${daysAgo === 1 ? 'yesterday' : WEEKDAY[new Date(data.asOf).getDay()]} ${clock(data.asOf)}`;
  }
  const blank = (label: string, tone: WidgetTone, glass: boolean) => ({
    view,
    label,
    tone,
    big: '—',
    unit: '',
    sub: data ? 'Open Healthy to refresh today' : 'Open Healthy to set up',
    fill: 0,
    glass,
    empty: true,
    foot,
    a11y: `${label}: no data for today. Tap to switch.`,
  });

  if (view === 'water') {
    if (stale) return blank('Water', 'water', true);
    const { ml, targetMl } = data.water;
    const target = `${litres(targetMl)} L`;
    if (ml == null) {
      return {
        ...blank('Water', 'water', true),
        unit: `of ${target}`,
        sub: 'No water logged yet',
        a11y: `Water: none logged yet of ${target}. Tap to switch.`,
      };
    }
    const left = targetMl - ml;
    return {
      view,
      label: 'Water',
      tone: 'water',
      big: litres(ml),
      unit: `of ${target}`,
      sub: left > 0 ? `${litres(left)} L to go` : 'Target reached',
      fill: clamp01(ml / targetMl),
      glass: true,
      empty: false,
      foot,
      a11y: `Water: ${litres(ml)} of ${target}. Tap to switch.`,
    };
  }

  if (view === 'food') {
    if (stale) return blank('Food', 'food', false);
    const f = data.food;
    if (f.eaten == null) {
      return {
        ...blank('Food', 'food', false),
        sub: 'No food logged yet',
        a11y: 'Food: nothing logged yet. Tap to switch.',
      };
    }
    const protein =
      f.proteinG != null ? `Protein ${Math.round(f.proteinG)} g · ` : '';
    const meals = `${f.meals} ${f.meals === 1 ? 'meal' : 'meals'}`;
    if (f.allowance != null) {
      const left = Math.round(f.allowance - f.eaten);
      const over = left < 0;
      return {
        view,
        label: 'Food',
        tone: over ? 'bad' : 'food',
        big: groupThousands(Math.abs(left)),
        unit: over ? 'kcal over' : 'kcal left',
        sub: `${protein}${meals}`,
        fill: f.allowance > 0 ? clamp01(f.eaten / f.allowance) : 1,
        glass: false,
        empty: false,
        foot,
        a11y: `Food: ${Math.abs(left)} kcal ${over ? 'over' : 'left'}. Tap to switch.`,
      };
    }
    // No calorie goal: what was eaten, with an empty bar (no made-up target).
    return {
      view,
      label: 'Food',
      tone: 'food',
      big: groupThousands(f.eaten),
      unit: 'kcal eaten',
      sub: `${protein}${meals}`,
      fill: 0,
      glass: false,
      empty: false,
      foot,
      a11y: `Food: ${Math.round(f.eaten)} kcal eaten. Tap to switch.`,
    };
  }

  if (stale) return blank('Recovery', 'good', false);
  const r = data.recovery;
  const cond = r.condition;
  const condLine = cond
    ? cond.key === 'sick'
      ? `Sick${cond.dayNumber > 1 ? ` · day ${cond.dayNumber}` : ''} — rest comes first`
      : `Injured${cond.dayNumber > 1 ? ` · day ${cond.dayNumber}` : ''} — train around it`
    : null;
  if (r.pct == null) {
    return {
      ...blank('Recovery', cond ? 'bad' : 'good', false),
      sub: condLine ?? 'No recovery data yet',
      a11y: `Recovery: no data yet. Tap to switch.`,
    };
  }
  return {
    view,
    label: 'Recovery',
    tone: cond || r.state === 'Strained' ? 'bad' : 'good',
    big: String(Math.round(r.pct)),
    unit: '%',
    sub: condLine ?? r.state ?? '',
    fill: clamp01(r.pct / 100),
    glass: false,
    empty: false,
    foot,
    a11y: `Recovery ${Math.round(r.pct)} percent${condLine ? `, ${condLine}` : r.state ? `, ${r.state}` : ''}. Tap to switch.`,
  };
}
