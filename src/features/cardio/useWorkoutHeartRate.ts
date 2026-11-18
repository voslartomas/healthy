import React from 'react';

import { ActivitySummary, readWorkoutHeartRate } from '../../health';
import { resolveMaxHr } from '../../health/hrZones';
import {
  summarizeWorkoutHeartRate,
  WorkoutHeartRate,
} from '../../health/workoutDetail';
import { useHealthStore } from '../../state/useHealthStore';
import { profileAge } from '../../state/useProfileStore';

/**
 * `loading` — the read is in flight; `ready` — `hr` holds the summary;
 * `none` — the source answered but recorded fewer than two in-session readings
 * (common: Fitbit writes the session to Health Connect without its heart rate);
 * `unavailable` — no source / no permission, so we could not ask at all.
 */
export type WorkoutHrStatus = 'loading' | 'ready' | 'none' | 'unavailable';

/**
 * Read one workout's heart rate on demand and summarize it.
 *
 * Zones are binned against the HRmax the last health read used
 * (`RawHealthData.hrMax`) — the same scale the stored per-session zones, and so
 * the cardio screen, were computed on — and only fall back to resolving one
 * from these samples when that read had none. Two scales would let this screen
 * and the cardio screen disagree about the same workout.
 */
export function useWorkoutHeartRate(activity: ActivitySummary | null): {
  status: WorkoutHrStatus;
  hr: WorkoutHeartRate | null;
} {
  // Each result is tagged with the session window it was read for; anything
  // else on screen is by definition still loading. Deriving that, rather than
  // resetting state to 'loading' at the top of the effect, keeps a previous
  // workout's graph from flashing on the next one without a synchronous
  // setState inside the effect.
  const [result, setResult] = React.useState<{
    forKey: string;
    status: Exclude<WorkoutHrStatus, 'loading'>;
    hr: WorkoutHeartRate | null;
  } | null>(null);

  const start = activity?.start;
  const end = activity?.end;
  const windowKey = start != null && end != null ? `${start}-${end}` : null;
  React.useEffect(() => {
    if (start == null || end == null || windowKey == null) return;
    // Ignore a read that resolves after the screen moved on (unmount, or a
    // different workout) — it would otherwise paint the wrong session.
    let live = true;
    readWorkoutHeartRate(start, end)
      .then(samples => {
        if (!live) return;
        if (samples == null) {
          setResult({ forKey: windowKey, status: 'unavailable', hr: null });
          return;
        }
        const stored = useHealthStore.getState().cachedRaw?.hrMax ?? null;
        const hrMax = stored ?? resolveMaxHr(profileAge(), samples);
        const hr = summarizeWorkoutHeartRate(samples, start, end, hrMax);
        setResult({ forKey: windowKey, status: hr ? 'ready' : 'none', hr });
      })
      .catch(err => {
        console.warn('Workout heart-rate read failed', err);
        if (live) {
          setResult({ forKey: windowKey, status: 'unavailable', hr: null });
        }
      });
    return () => {
      live = false;
    };
  }, [start, end, windowKey]);

  if (result == null || result.forKey !== windowKey) {
    return { status: 'loading', hr: null };
  }
  return { status: result.status, hr: result.hr };
}
