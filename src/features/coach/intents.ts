import { IconName } from '../../components/Icon';

/**
 * An action the user can pick BEFORE typing, which obliges the model to call
 * `tool` for that message instead of deciding whether to.
 *
 * The coach is otherwise left to read intent from the wording, and it genuinely
 * cannot do that reliably: "two eggs and toast" is as much a question as a
 * request to log, so the model often just replied and nothing was written.
 * Naming the action in the UI removes the guess — the model's only job is to
 * fill in the arguments (estimating kcal and macros) from what the user
 * describes.
 *
 * The same list backs two surfaces, so they can never drift: the chips above the
 * coach composer, and the FAB's long-press context menu (which opens the chat
 * with the chosen action already armed).
 */
export interface CoachIntent {
  key: string;
  /** Chip / menu-item label. */
  label: string;
  /** Icon name from `../../components/Icon`. */
  icon: IconName;
  /** The tool the model is obliged to call. */
  tool: string;
  /** Composer placeholder while this intent is armed — it should tell the user
   * what to describe, since they no longer have to phrase it as a command. */
  placeholder: string;
}

export const COACH_INTENTS: CoachIntent[] = [
  {
    key: 'food',
    label: 'Log food',
    icon: 'nutrition',
    tool: 'log_food',
    placeholder: 'Describe what you ate…',
  },
  {
    key: 'workout',
    label: 'New workout',
    icon: 'strength',
    tool: 'create_workout',
    placeholder: 'Which muscles, how many exercises…',
  },
];

/** Look an intent up by key (e.g. from a `Coach` route param). */
export function coachIntentByKey(key?: string | null): CoachIntent | null {
  if (!key) return null;
  return COACH_INTENTS.find(i => i.key === key) ?? null;
}
