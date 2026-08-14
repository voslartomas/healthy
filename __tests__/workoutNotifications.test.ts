import notifee from '@notifee/react-native';
import { Platform } from 'react-native';

import { ActiveSession, PlannedExercise } from '../src/state/useStrengthStore';
import {
  cancelRestOverNotification,
  scheduleRestOverNotification,
  syncWorkoutNotification,
  workoutNotificationBody,
} from '../src/state/workoutNotifications';

const ex = (targetSets: number): PlannedExercise => ({
  id: 'e',
  exerciseId: 'x',
  targetSets,
  targetReps: 10,
  targetWeightKg: null,
  restSec: 60,
});

const done = (n: number) =>
  new Array(n).fill({}) as ActiveSession['completed'];

function session(o: Partial<ActiveSession>): ActiveSession {
  return {
    id: 's',
    workoutId: null,
    name: 'Push',
    startedAt: o.startedAt ?? 1000,
    plan: o.plan ?? [ex(3)],
    exerciseIndex: o.exerciseIndex ?? 0,
    setIndex: o.setIndex ?? 0,
    resting: o.resting ?? false,
    restEndsAt: o.restEndsAt ?? null,
    completed: o.completed ?? done(0),
    weightKg: null,
    reps: 10,
  };
}

const flush = () => new Promise<void>(res => setImmediate(() => res()));

describe('workoutNotificationBody', () => {
  it('counts one set done and the rest to go', () => {
    expect(
      workoutNotificationBody(
        session({ plan: [ex(3), ex(3)], setIndex: 1, completed: done(1) }),
      ),
    ).toBe('1 set done · 5 to go');
  });

  it('pluralises and spans across exercises', () => {
    expect(
      workoutNotificationBody(
        session({
          plan: [ex(3), ex(2)],
          exerciseIndex: 1,
          setIndex: 0,
          completed: done(3),
        }),
      ),
    ).toBe('3 sets done · 2 to go');
  });
});

describe('syncWorkoutNotification (Android)', () => {
  const orig = Platform.OS;
  beforeAll(() => {
    (Platform as { OS: string }).OS = 'android';
  });
  afterAll(() => {
    (Platform as { OS: string }).OS = orig;
  });
  beforeEach(() => jest.clearAllMocks());

  it('shows an ongoing chronometer notification for an active run', async () => {
    syncWorkoutNotification(session({ plan: [ex(2)], startedAt: 5000 }));
    await flush();
    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    const arg = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(arg.android.ongoing).toBe(true);
    expect(arg.android.showChronometer).toBe(true);
    expect(arg.android.timestamp).toBe(5000);
    expect(arg.body).toBe('0 sets done · 2 to go');
  });

  it('clears the notification when the run ends', async () => {
    syncWorkoutNotification(session({ plan: [ex(2)] }));
    await flush();
    syncWorkoutNotification(null);
    await flush();
    expect(notifee.cancelNotification).toHaveBeenCalled();
  });

  it('shows a down-counting rest chronometer while resting', async () => {
    const restEndsAt = Date.now() + 60_000;
    syncWorkoutNotification(
      session({
        plan: [ex(3), ex(2)],
        exerciseIndex: 1,
        setIndex: 0,
        resting: true,
        restEndsAt,
      }),
    );
    await flush();
    const arg = (notifee.displayNotification as jest.Mock).mock.calls[0][0];
    expect(arg.title).toBe('Resting');
    expect(arg.android.chronometerDirection).toBe('down');
    expect(arg.android.timestamp).toBe(restEndsAt);
  });
});

describe('syncWorkoutNotification (off Android)', () => {
  it('does nothing on iOS', async () => {
    jest.clearAllMocks();
    (Platform as { OS: string }).OS = 'ios';
    syncWorkoutNotification(session({ plan: [ex(2)] }));
    await flush();
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });
});

describe('scheduleRestOverNotification (Android)', () => {
  beforeAll(() => {
    (Platform as { OS: string }).OS = 'android';
  });
  afterAll(() => {
    (Platform as { OS: string }).OS = 'ios';
  });
  beforeEach(() => jest.clearAllMocks());

  it('schedules a timestamp trigger for a future rest end', async () => {
    const endsAt = Date.now() + 60_000;
    await scheduleRestOverNotification(endsAt);
    expect(notifee.createTriggerNotification).toHaveBeenCalledTimes(1);
    const [notif, trigger] = (
      notifee.createTriggerNotification as jest.Mock
    ).mock.calls[0];
    expect(trigger.timestamp).toBe(endsAt);
    expect(notif.android.channelId).toBe('rest-over');
    expect(notifee.displayNotification).not.toHaveBeenCalled();
  });

  it('fires immediately when the rest has already ended', async () => {
    await scheduleRestOverNotification(Date.now() - 1000);
    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('cancel clears both the pending trigger and any shown alert', async () => {
    await cancelRestOverNotification();
    expect(notifee.cancelTriggerNotification).toHaveBeenCalledWith('rest-over');
    expect(notifee.cancelNotification).toHaveBeenCalledWith('rest-over');
  });
});
