/**
 * The "Today" daily brief — a short, AI-written paragraph about how the user is
 * doing, generated from their live health data ({@link buildDataContext}) via
 * the configured coach provider (on-device Gemma or a cloud model).
 *
 * Generated at most once per calendar day (guarded by date) so it doesn't re-run
 * on every Today visit, with a manual refresh. The date + text are persisted, so
 * it generates once on the first app open of the day and is then reused on later
 * launches that same day — not regenerated on every cold start. Degrades silently
 * — if no provider is set up (no model downloaded / no API key), it stays idle and
 * the card hides itself.
 */

import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useAppStore } from '../../state/useAppStore';
import { whenHealthFresh } from '../../state/useHealthStore';
import { CoachError, runCoach } from '../coach/aiClient';
import { buildDataContext } from '../coach/dataContext';
import { languageDirective } from '../coach/languages';
import { useModelStore } from '../coach/ondevice/useModelStore';

/** Non-secret local cache for the once-a-day brief (date + text). Reuses the
 * SecureStore backend the app already ships with — the payload is one short
 * sentence, well within its size limits. */
const briefStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

/** Resolves once persisted state has been read (or failed to). `ensure()` awaits
 * this so it reuses today's stored brief instead of regenerating before the
 * async storage read lands on a cold start. */
let markHydrated: () => void = () => {};
const hydrated = new Promise<void>(resolve => {
  markHydrated = resolve;
});

/** `syncing` = waiting on today's health read before we can write anything
 * truthful; `loading` = the model is actually generating. */
export type BriefStatus = 'idle' | 'syncing' | 'loading' | 'ready' | 'error';

/** Local date key (YYYY-M-D) used to generate the brief at most once per day. */
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Whether the selected coach provider is usable right now. */
function canGenerate(): boolean {
  const { aiProvider, apiKey } = useAppStore.getState();
  if (aiProvider === 'ondevice') {
    return useModelStore.getState().status === 'ready';
  }
  return apiKey.trim().length > 0;
}

/** Ask the coach model for one short paragraph, grounded in the live data. */
async function generateBrief(): Promise<string> {
  const startedAt = Date.now();
  const { apiKey, model, aiProvider } = useAppStore.getState();
  const system = [
    "You are the user's health coach writing today's one-line dashboard note.",
    languageDirective(useAppStore.getState().coachLanguage),
    'Using ONLY the data below, write ONE very short line (max ~8 words) on how they are doing today, with a light nudge if useful.',
    'Reference one real number (e.g. recovery %, sleep, protein, or steps). No lists, no markdown, no heading, no trailing period — just the short line.',
    'Example style: "Recovery solid at 78% — room to add load"',
    '',
    "=== The user's current health data ===",
    buildDataContext(),
  ].join('\n');
  const reply = await runCoach(
    { provider: aiProvider, model, apiKey },
    {
      system,
      history: [{ role: 'user', content: 'Write my brief for today.' }],
      tools: [],
      exec: async () => '',
    },
  );
  // The on-device model dominates this call (the data context is built from the
  // in-memory snapshot). Logged so a slow brief can be attributed to inference
  // rather than to the health read. Tag: HEA-BRIEF.
  console.log(`[HEA-BRIEF] generated in ${Date.now() - startedAt}ms`);
  return reply.trim();
}

interface DailyBriefState {
  /** Date key the current text was generated for. */
  date: string;
  text: string;
  status: BriefStatus;
  error: string | null;
  /** Generate today's brief if not already done (called on Today mount). */
  ensure: () => Promise<void>;
  /** Force a fresh brief, ignoring the once-per-day guard. */
  regenerate: () => Promise<void>;
}

export const useDailyBriefStore = create<DailyBriefState>()(
  persist(
    (set, get) => {
      const run = async () => {
        if (get().status === 'loading' || get().status === 'syncing') return;
        // For the on-device provider, sync model status from disk first so the
        // brief generates on a fresh launch even before Settings initialised it.
        if (useAppStore.getState().aiProvider === 'ondevice') {
          await useModelStore.getState().check();
        }
        if (!canGenerate()) {
          set({ status: 'idle' });
          return;
        }
        set({ status: 'loading', error: null });
        try {
          const text = await generateBrief();
          set({ date: todayKey(), text, status: text ? 'ready' : 'idle' });
        } catch (err) {
          set({
            status: 'error',
            error:
              err instanceof CoachError
                ? err.message
                : "Couldn't generate today's brief.",
          });
        }
      };

      return {
        date: '',
        text: '',
        status: 'idle',
        error: null,
        ensure: async () => {
          // Wait for the persisted brief to load before deciding, so today's
          // stored brief from an earlier launch is reused, not regenerated.
          await hydrated;
          if (get().date === todayKey() && get().text) {
            if (get().status !== 'ready') set({ status: 'ready' });
            return;
          }
          // Sync the on-device model's status from disk before deciding — on a
          // cold launch the store hasn't checked yet and would read "not ready"
          // for a model that is in fact downloaded. (`run` repeats this; it is
          // idempotent and cheap.)
          if (useAppStore.getState().aiProvider === 'ondevice') {
            await useModelStore.getState().check();
          }
          if (!canGenerate()) {
            set({ status: 'idle' });
            return;
          }
          // First open of the day: the snapshot on screen is still the SQLite
          // cache — yesterday's sleep, yesterday's HRV. Generating now would
          // write a brief about the wrong day and then cache it until midnight.
          // Wait for a live read (bounded, so offline still degrades cleanly).
          set({ status: 'syncing', error: null });
          await whenHealthFresh();
          // Hand back to `run`, whose in-flight guard rejects 'syncing'.
          set({ status: 'idle' });
          await run();
        },
        regenerate: async () => {
          set({ date: '', text: '' });
          await run();
        },
      };
    },
    {
      name: 'daily-brief',
      storage: createJSONStorage(() => briefStorage),
      // Only the day's content is worth keeping; status/error are transient.
      partialize: state => ({ date: state.date, text: state.text }),
      // Fires after hydration finishes (with state, or on failure) — either way
      // release ensure()'s gate so a fresh install still generates.
      onRehydrateStorage: () => () => markHydrated(),
    },
  ),
);
