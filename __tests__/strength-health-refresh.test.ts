jest.mock('../src/db/strengthRepository');

// Defined INSIDE the factory: `jest.mock` is hoisted above module initialisers,
// so a factory closing over `const` mocks declared below would capture them
// before they exist. The handles are pulled back off the mocked module instead.
jest.mock('../src/health', () => ({
  ...jest.requireActual('../src/health'),
  logExerciseSession: jest.fn(async () => ({ ok: true, id: 'hc-1' })),
  removeExerciseSession: jest.fn(async () => true),
}));

/* eslint-disable import/first -- jest.mock must be hoisted above imports */
import { logExerciseSession, removeExerciseSession } from '../src/health';
import { syncSession, unsyncSession } from '../src/state/strengthService';
import { useHealthStore } from '../src/state/useHealthStore';
import { SessionSummary } from '../src/state/useStrengthStore';

/**
 * Finishing a workout writes it to the OS exercise store, and the health snapshot
 * is derived from that store — so the write has to be followed by a re-read.
 * Without it the dashboard's cardio load, the week's strength-goal count and the
 * activities list all kept their pre-workout values until some later app
 * foreground happened to refresh (throttled to once per 30s in App.tsx), which is
 * the "after logging exercise we do not refresh data" report.
 */

const logExercise = logExerciseSession as jest.MockedFunction<
  typeof logExerciseSession
>;
const removeExercise = removeExerciseSession as jest.MockedFunction<
  typeof removeExerciseSession
>;

function summary(o: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: 's1',
    workoutId: null,
    name: 'Push',
    kind: 'strength',
    startedAt: 1_754_000_000_000,
    endedAt: 1_754_003_600_000,
    durationSec: 3600,
    totalVolumeKg: 1200,
    setsCompleted: 12,
    totalReps: 96,
    sets: [],
    ...o,
  };
}

const refresh = jest.fn(async () => {});
const realRefresh = useHealthStore.getState().refresh;

beforeEach(() => {
  logExercise.mockClear().mockResolvedValue({ ok: true, id: 'hc-1' });
  removeExercise.mockClear().mockResolvedValue(true);
  refresh.mockClear().mockResolvedValue(undefined);
  useHealthStore.setState({ refresh });
});

afterEach(() => {
  useHealthStore.setState({ refresh: realRefresh });
});

describe('mirroring a session to the OS store refreshes the snapshot', () => {
  it('re-reads health after a successful exercise write', async () => {
    await expect(syncSession(summary())).resolves.toBe(true);
    expect(logExercise).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not re-read when the write failed — there is nothing new to see', async () => {
    logExercise.mockResolvedValue({ ok: false, id: null });
    await expect(syncSession(summary())).resolves.toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('re-reads after removing a mirrored session, so it drops out', async () => {
    await expect(unsyncSession(summary({ healthId: 'hc-1' }))).resolves.toBe(
      true,
    );
    expect(removeExercise).toHaveBeenCalledWith('hc-1');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not re-read for a session that was never mirrored', async () => {
    await expect(unsyncSession(summary())).resolves.toBe(false);
    expect(removeExercise).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('reports the sync as successful even if the follow-up read fails', async () => {
    // The local session is authoritative; an unavailable source must not make a
    // completed sync look like a failure.
    refresh.mockRejectedValue(new Error('not connected'));
    await expect(syncSession(summary())).resolves.toBe(true);
  });
});
