import notifee, { AndroidImportance, TriggerType } from '@notifee/react-native';
import { Platform } from 'react-native';

import { exerciseOrUnknown } from '../data/exerciseCatalog';
import { ActiveSession, useStrengthStore } from './useStrengthStore';

/**
 * The ongoing "workout in progress" notification. While a run is active it shows
 * a live elapsed timer (Android's own chronometer, ticked by the system from
 * `startedAt` — no JS timer, so it keeps counting while the app is backgrounded
 * or the screen is off) plus sets done / remaining, updated as sets are logged.
 * Cleared when the run finishes or is abandoned.
 *
 * Android-only for now — iOS Live Activities are a separate effort — so every
 * entry point no-ops off Android.
 */

const CHANNEL_ID = 'workout-session';
const NOTIFICATION_ID = 'workout-session';

/** Sets still to do from the cursor, inclusive of the current set. */
function remainingSets(session: ActiveSession): number {
  let n = 0;
  for (let i = session.exerciseIndex; i < session.plan.length; i++) {
    n +=
      i === session.exerciseIndex
        ? session.plan[i].targetSets - session.setIndex
        : session.plan[i].targetSets;
  }
  return n;
}

/** The notification body: "N sets done · M to go". Pure, so it's unit-tested. */
export function workoutNotificationBody(session: ActiveSession): string {
  const done = session.completed.length;
  const left = remainingSets(session);
  return `${done} ${done === 1 ? 'set' : 'sets'} done · ${left} to go`;
}

// Request permission + create the channel exactly once, lazily on the first
// workout (not at app launch — no reason to prompt before it's relevant).
let setup: Promise<void> | null = null;
function ensureSetup(): Promise<void> {
  if (!setup) {
    setup = (async () => {
      await notifee.requestPermission();
      await notifee.createChannel({
        id: CHANNEL_ID,
        name: 'Workout in progress',
        importance: AndroidImportance.LOW, // silent, no heads-up
      });
    })();
  }
  return setup;
}

let showing = false;

/** Body while resting: what's coming up so the user can ready the next weight. */
function restBody(session: ActiveSession): string {
  const def = exerciseOrUnknown(session.plan[session.exerciseIndex].exerciseId);
  return `Next: ${def.name} · set ${session.setIndex + 1}`;
}

async function show(session: ActiveSession): Promise<void> {
  await ensureSetup();
  // While resting, count the chronometer DOWN to the rest end; otherwise count
  // total elapsed UP from the session start.
  const resting = session.resting && session.restEndsAt != null;
  await notifee.displayNotification({
    id: NOTIFICATION_ID,
    title: resting ? 'Resting' : session.name || 'Workout',
    body: resting ? restBody(session) : workoutNotificationBody(session),
    android: {
      channelId: CHANNEL_ID,
      ongoing: true, // not swipe-dismissable while training
      onlyAlertOnce: true, // updates don't re-buzz
      showChronometer: true,
      chronometerDirection: resting ? 'down' : 'up',
      timestamp: resting ? session.restEndsAt! : session.startedAt,
      importance: AndroidImportance.LOW,
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' }, // tap → reopen the app
    },
  });
  showing = true;
}

async function clear(): Promise<void> {
  if (!showing) return;
  showing = false;
  await notifee.cancelNotification(NOTIFICATION_ID);
}

/** Reflect one session snapshot into the notification (show/update, or clear). */
export function syncWorkoutNotification(session: ActiveSession | null): void {
  if (Platform.OS !== 'android') return;
  if (session && session.plan.length > 0) {
    void show(session).catch(() => {});
  } else {
    void clear().catch(() => {});
  }
}

/**
 * Subscribe the ongoing notification to the strength session lifecycle. Call
 * once at app start; a no-op off Android.
 */
export function initWorkoutNotifications(): void {
  if (Platform.OS !== 'android') return;
  let prevKey = '';
  const reflect = (session: ActiveSession | null) => {
    // Only touch the notification when something it displays actually changed —
    // ignores unrelated store updates and the per-set weight/reps churn.
    const key = session
      ? [
          session.id,
          session.startedAt,
          session.completed.length,
          session.exerciseIndex,
          session.setIndex,
          session.resting ? 'r' : '',
          session.restEndsAt ?? 0,
        ].join(':')
      : '';
    if (key === prevKey) return;
    prevKey = key;
    syncWorkoutNotification(session);
  };
  reflect(useStrengthStore.getState().session);
  useStrengthStore.subscribe(state => reflect(state.session));
}

// ── Rest-over alert ──────────────────────────────────────────────────────────

const REST_CHANNEL_ID = 'rest-over';
const REST_NOTIFICATION_ID = 'rest-over';

let restChannel: Promise<string> | null = null;
function ensureRestChannel(): Promise<string> {
  if (!restChannel) {
    restChannel = notifee.createChannel({
      id: REST_CHANNEL_ID,
      name: 'Rest complete',
      importance: AndroidImportance.HIGH, // heads-up + sound
      sound: 'default',
      vibration: true,
    });
  }
  return restChannel;
}

function restNotification() {
  return {
    id: REST_NOTIFICATION_ID,
    title: 'Rest complete',
    body: 'Time for your next set.',
    android: {
      channelId: REST_CHANNEL_ID,
      importance: AndroidImportance.HIGH,
      smallIcon: 'ic_launcher',
      pressAction: { id: 'default' },
    },
  };
}

/**
 * Alert the user (sound + heads-up) when the between-sets rest ends while the
 * app is backgrounded — the in-app countdown's JS timer is frozen then, so only
 * an OS-scheduled notification can fire on time. `endsAt` is epoch ms; if it's
 * already past it fires immediately. Android-only.
 */
export async function scheduleRestOverNotification(endsAt: number): Promise<void> {
  if (Platform.OS !== 'android') return;
  await ensureRestChannel();
  const notification = restNotification();
  if (endsAt <= Date.now() + 500) {
    await notifee.displayNotification(notification);
    return;
  }
  await notifee.createTriggerNotification(notification, {
    type: TriggerType.TIMESTAMP,
    timestamp: endsAt,
    alarmManager: { allowWhileIdle: true },
  });
}

/** Cancel a pending/shown rest-over alert (the user returned before it fired). */
export async function cancelRestOverNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee.cancelTriggerNotification(REST_NOTIFICATION_ID);
  await notifee.cancelNotification(REST_NOTIFICATION_ID);
}
