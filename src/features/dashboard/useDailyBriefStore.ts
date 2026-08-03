/**
 * The "Today" daily brief — a short, AI-written paragraph about how the user is
 * doing, generated from their live health data ({@link buildDataContext}) via
 * the configured coach provider (on-device Gemma or a cloud model).
 *
 * Generated at most once per day (guarded by date) so it doesn't re-run on every
 * Today visit, with a manual refresh. In-memory only: it re-generates once on a
 * fresh app launch, which keeps the wiring simple and avoids showing a stale
 * brief. Degrades silently — if no provider is set up (no model downloaded / no
 * API key), it stays idle and the card hides itself.
 */

import { create } from 'zustand';

import { useAppStore } from '../../state/useAppStore';
import { CoachError, runCoach } from '../coach/aiClient';
import { buildDataContext } from '../coach/dataContext';
import { languageDirective } from '../coach/languages';
import { useModelStore } from '../coach/ondevice/useModelStore';

export type BriefStatus = 'idle' | 'loading' | 'ready' | 'error';

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
  const { apiKey, model, aiProvider } = useAppStore.getState();
  const system = [
    "You are the user's health coach writing today's one-line dashboard note.",
    languageDirective(useAppStore.getState().coachLanguage),
    'Using ONLY the data below, write ONE short, plain sentence (max ~15 words) about how they are doing today and, if useful, a nudge.',
    'Reference one real number (e.g. recovery %, sleep, protein, or steps). No lists, no markdown, no heading — just the single sentence.',
    'Example style: "Recovery is solid at 78% — a good day to add some load."',
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

export const useDailyBriefStore = create<DailyBriefState>((set, get) => {
  const run = async () => {
    if (get().status === 'loading') return;
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
      if (get().date === todayKey() && get().text) {
        if (get().status !== 'ready') set({ status: 'ready' });
        return;
      }
      await run();
    },
    regenerate: async () => {
      set({ date: '', text: '' });
      await run();
    },
  };
});
