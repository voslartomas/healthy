/**
 * Live native-header content for each screen. Instead of a plain title, every
 * screen's header shows a mono "eyebrow" (left) plus a live status stat (right)
 * — the metadata that used to sit in-content. These components read the zustand
 * stores directly, so the header stays reactive as data lands.
 */
import React from 'react';
import { Text } from 'react-native';

import { M } from '../../components/brief';
import { buildMetrics } from '../../features/trends/metrics';
import {
  activeCalorieGoal,
  useCalorieGoalsStore,
} from '../../state/useCalorieGoalsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useStrengthStore } from '../../state/useStrengthStore';
import { useTrendsStore } from '../../state/useTrendsStore';
import { useTheme } from '../../theme/theme';

const DAYS = [
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

/** "Sunday · Aug 2" for today. */
function dateLabel(): string {
  const d = new Date();
  return `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function grp(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function signed(n: number): string {
  if (n < 0) return `−${grp(Math.abs(n))}`;
  if (n > 0) return `+${grp(n)}`;
  return '0';
}

/** The left eyebrow — uppercase mono context. */
function Eyebrow({ text }: { text: string }) {
  const c = useTheme().colors;
  return (
    <Text
      numberOfLines={1}
      style={M(700, 11, { ls: 1.4, upper: true, color: c.ink })}
    >
      {text}
    </Text>
  );
}

/** The right status — uppercase mono stat, coloured. */
function Status({ text, color }: { text: string; color: string }) {
  return (
    <Text
      numberOfLines={1}
      style={[
        M(700, 10.5, { ls: 1.4, upper: true, color }),
        { marginRight: 16 },
      ]}
    >
      {text}
    </Text>
  );
}

// ── Today ────────────────────────────────────────────────────────────────────
export const TodayTitle = () => <Eyebrow text={dateLabel()} />;
export function TodayRight() {
  const c = useTheme().colors;
  const live = useHealthStore(s => s.snapshot.live);
  return (
    <Status text={live ? 'Live' : 'No data'} color={live ? c.acc : c.fnt} />
  );
}

// ── Fuel ─────────────────────────────────────────────────────────────────────
export const FuelTitle = () => <Eyebrow text={dateLabel()} />;
export function FuelRight() {
  const c = useTheme().colors;
  const snap = useHealthStore(s => s.snapshot);
  const goals = useCalorieGoalsStore(s => s.goals);
  const goal = activeCalorieGoal(goals);
  const eaten = snap.nutrition?.eaten ?? null;
  const burned = snap.energyBurnedToday;
  const hasNet = eaten != null || burned > 0;
  const net = (eaten ?? 0) - burned;
  if (hasNet) {
    return (
      <Status text={`Net ${signed(net)}`} color={net < 0 ? c.grn : c.ink} />
    );
  }
  if (goal)
    return <Status text={`Goal ${signed(goal.targetNet)}`} color={c.acc} />;
  return <Status text="No goal" color={c.fnt} />;
}

// ── Strength ─────────────────────────────────────────────────────────────────
export const StrengthTitle = () => <Eyebrow text="Strength" />;
export function StrengthRight() {
  const c = useTheme().colors;
  const count = useStrengthStore(s => s.workouts.length);
  if (count > 0) {
    return (
      <Status
        text={`${count} ${count === 1 ? 'Workout' : 'Workouts'}`}
        color={c.acc}
      />
    );
  }
  return <Status text="No workouts" color={c.fnt} />;
}

export const WorkoutBuilderTitle = () => <Eyebrow text="Build workout" />;
export const WorkoutRunTitle = () => <Eyebrow text="In progress" />;
export const WorkoutSummaryTitle = () => <Eyebrow text="Session complete" />;

/** Live "exercise x/N" progress in the runner header. */
export function WorkoutRunRight() {
  const c = useTheme().colors;
  const session = useStrengthStore(s => s.session);
  if (!session || session.plan.length === 0) {
    return <Status text="—" color={c.fnt} />;
  }
  return (
    <Status
      text={`Set ${session.exerciseIndex + 1}/${session.plan.length}`}
      color={c.acc}
    />
  );
}

// ── Trends ───────────────────────────────────────────────────────────────────
export function TrendsTitle() {
  const rangeDays = useTrendsStore(s => s.rangeDays);
  return <Eyebrow text={`Last ${rangeDays} days`} />;
}
export function TrendsRight() {
  const c = useTheme().colors;
  const trends = useHealthStore(s => s.snapshot.trends);
  const activeKey = useTrendsStore(s => s.activeKey);
  const rangeDays = useTrendsStore(s => s.rangeDays);
  const metrics = buildMetrics(trends, rangeDays);
  const active = metrics.find(m => m.key === activeKey) ?? metrics[0];
  if (active.delta) return <Status text={active.delta} color={c.acc} />;
  return <Status text="—" color={c.fnt} />;
}

// ── Setup ────────────────────────────────────────────────────────────────────
export const SetupTitle = () => <Eyebrow text="Coach & sources" />;
export function SetupRight() {
  const c = useTheme().colors;
  const live = useHealthStore(s => s.snapshot.live);
  return (
    <Status
      text={live ? 'Connected' : 'Not connected'}
      color={live ? c.grn : c.fnt}
    />
  );
}

// ── Recovery ─────────────────────────────────────────────────────────────────
export const RecoveryTitle = () => <Eyebrow text="Readiness" />;
export function RecoveryRight() {
  const c = useTheme().colors;
  const readiness = useHealthStore(s => s.snapshot.readiness);
  if (readiness) return <Status text={readiness.state} color={c.acc} />;
  return <Status text="No data" color={c.fnt} />;
}

// ── Cardio ───────────────────────────────────────────────────────────────────
export const CardioTitle = () => <Eyebrow text="Cardio load" />;
export function CardioRight() {
  const c = useTheme().colors;
  const cardio = useHealthStore(s => s.snapshot.cardio);
  if (cardio.hasZoneData) {
    return <Status text={`Week ${cardio.weekLoad}`} color={c.acc} />;
  }
  return <Status text="No data" color={c.fnt} />;
}
