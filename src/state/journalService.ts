import {
  deleteJournalDay,
  loadJournal,
  upsertJournalDay,
} from '../db/journalRepository';
import { startOfLocalDay } from '../health';
import {
  entryFor,
  isEmptyJournalDay,
  JournalDay,
  JournalTagKey,
} from './journal';
import { useJournalStore } from './useJournalStore';

/**
 * Write-through between the journal store and SQLite (ADR-009). The UI calls
 * these, never the repository.
 */

/** Load every entry into the store. Call once on app start. */
export async function initJournal(): Promise<void> {
  useJournalStore.getState().setEntries(await loadJournal());
}

/**
 * Save one day's entry. An entry with no tags, no answered conditions and no
 * note is deleted instead, so clearing a day leaves nothing behind.
 */
export async function saveJournalDay(input: {
  day: number;
  tags: JournalTagKey[];
  ended?: JournalTagKey[];
  note?: string;
}): Promise<void> {
  const day = startOfLocalDay(input.day);
  const entry: JournalDay = {
    day,
    // De-duplicated; an answered condition can't also be a current tag.
    tags: [...new Set(input.tags)],
    ended: [...new Set(input.ended ?? [])].filter(k => !input.tags.includes(k)),
    note: input.note ?? '',
    updatedAt: Date.now(),
  };
  if (isEmptyJournalDay(entry)) {
    await deleteJournalDay(day);
    useJournalStore.getState().removeLocal(day);
    return;
  }
  await upsertJournalDay(entry);
  useJournalStore.getState().upsertLocal(entry);
}

function today(now: number): { day: number; cur: JournalDay | undefined } {
  const day = startOfLocalDay(now);
  return { day, cur: entryFor(useJournalStore.getState().entries, day) };
}

/** Flip one tag on today's entry (the Today card's quick chips). */
export async function toggleTodayTag(
  key: JournalTagKey,
  now: number = Date.now(),
): Promise<void> {
  const { day, cur } = today(now);
  const tags = cur?.tags ?? [];
  await saveJournalDay({
    day,
    tags: tags.includes(key) ? tags.filter(k => k !== key) : [...tags, key],
    ended: (cur?.ended ?? []).filter(k => k !== key),
    note: cur?.note,
  });
}

/** "Still sick" — carry the condition into today. */
export async function confirmCondition(
  key: JournalTagKey,
  now: number = Date.now(),
): Promise<void> {
  const { day, cur } = today(now);
  const tags = cur?.tags ?? [];
  if (tags.includes(key)) return;
  await saveJournalDay({
    day,
    tags: [...tags, key],
    ended: (cur?.ended ?? []).filter(k => k !== key),
    note: cur?.note,
  });
}

/** "I'm better" — the condition ended; Today stops asking. */
export async function endCondition(
  key: JournalTagKey,
  now: number = Date.now(),
): Promise<void> {
  const { day, cur } = today(now);
  await saveJournalDay({
    day,
    tags: (cur?.tags ?? []).filter(k => k !== key),
    ended: [...(cur?.ended ?? []), key],
    note: cur?.note,
  });
}
