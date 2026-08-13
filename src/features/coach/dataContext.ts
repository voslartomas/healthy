/**
 * A compact, human-readable summary of the user's live health data — recovery,
 * body, sleep, activity, nutrition, and goals — for the AI coach to reason over.
 *
 * Both the chat coach ({@link ../coach/CoachScreen} system prompt) and the Today
 * daily brief ({@link ../dashboard/useDailyBriefStore}) ground the model in this
 * text so it can answer questions and give advice about the user's real numbers.
 * Reads the zustand stores directly and is fully null-safe (only mentions data
 * that exists), so it never invents values.
 */

import {
  activeCalorieGoal,
  useCalorieGoalsStore,
} from '../../state/useCalorieGoalsStore';
import { goalCurrent, useGoalsStore } from '../../state/useGoalsStore';
import { useHealthStore } from '../../state/useHealthStore';

function grp(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function signed(n: number): string {
  const r = Math.round(n);
  return r < 0 ? `−${grp(Math.abs(r))}` : r > 0 ? `+${grp(r)}` : '0';
}

/** e.g. +5 / −2 for a metric delta vs its baseline. */
function delta(n: number): string {
  const r = Math.round(n);
  return r === 0 ? 'flat' : r > 0 ? `+${r}` : `−${Math.abs(r)}`;
}

/** Decimal hours → "7h 42m". */
function hoursHm(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Build the data-context block. Returns a multi-line string; each line is a
 * labelled fact. Only includes categories that have data.
 */
export function buildDataContext(): string {
  const snap = useHealthStore.getState().snapshot;
  const lines: string[] = [];

  const d = new Date();
  lines.push(
    `Today is ${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}.`,
  );

  if (!snap.live) {
    lines.push(
      'No health data is connected yet (Health Connect is not linked in Setup), so most numbers are unavailable.',
    );
  }

  if (snap.readiness) {
    lines.push(`Recovery: ${snap.readiness.pct}% — ${snap.readiness.state}.`);
  }

  const body: string[] = [];
  if (snap.hrv)
    body.push(
      `HRV ${Math.round(snap.hrv.value)}ms (${delta(snap.hrv.delta)} vs baseline)`,
    );
  if (snap.restingHr)
    body.push(
      `resting HR ${Math.round(snap.restingHr.value)}bpm (${delta(snap.restingHr.delta)})`,
    );
  const wPts = snap.trends.weight;
  if (wPts.length)
    body.push(`weight ${wPts[wPts.length - 1].value.toFixed(1)}kg`);
  const fPts = snap.trends.bodyFat;
  if (fPts.length)
    body.push(`body fat ${fPts[fPts.length - 1].value.toFixed(1)}%`);
  if (body.length) lines.push(`Body: ${body.join(', ')}.`);

  if (snap.sleep) {
    lines.push(
      `Sleep last night: ${hoursHm(snap.sleep.hours)} (${snap.sleep.performancePct}% of goal).`,
    );
  }

  const act: string[] = [];
  if (snap.stepsToday > 0 || snap.live)
    act.push(
      `${grp(snap.stepsToday)} steps today (${grp(snap.stepsThisWeek)} this week)`,
    );
  if (snap.energyBurnedToday > 0)
    act.push(`${grp(snap.energyBurnedToday)} active kcal burned today`);
  if (snap.cardio.hasZoneData)
    act.push(
      `cardio load ${snap.cardio.todayLoad} today, ${snap.cardio.weekLoad} this week`,
    );
  if (act.length) lines.push(`Activity: ${act.join(', ')}.`);

  if (snap.activities.length) {
    const recent = snap.activities
      .slice(0, 3)
      .map(a => `${a.name} (${Math.round(a.durationMin)}min)`)
      .join(', ');
    lines.push(`Recent workouts: ${recent}.`);
  }

  const n = snap.nutrition;
  if (n) {
    lines.push(
      `Nutrition today: ${grp(n.eaten)} kcal — ${Math.round(n.proteinG)}g protein, ${Math.round(n.carbsG)}g carbs, ${Math.round(n.fatG)}g fat.`,
    );
  } else {
    lines.push('Nutrition today: nothing logged yet.');
  }

  const cg = activeCalorieGoal(useCalorieGoalsStore.getState().goals);
  if (cg) lines.push(`Calorie goal: net ${signed(cg.targetNet)} kcal/day.`);

  const goals = useGoalsStore.getState().goals;
  if (goals.length) {
    const gs = goals
      .map(g => `${g.name} ${Math.round(goalCurrent(g))}/${g.target}`)
      .join('; ');
    lines.push(`Weekly goals: ${gs}.`);
  }

  return lines.join('\n');
}
