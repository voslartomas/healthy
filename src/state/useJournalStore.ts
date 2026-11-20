import { create } from 'zustand';

import { JournalDay } from './journal';

interface JournalState {
  /** Every entry, oldest first. */
  entries: JournalDay[];
  hydrated: boolean;
  setEntries: (entries: JournalDay[]) => void;
  /** Insert or replace the entry for its day, keeping day order. */
  upsertLocal: (entry: JournalDay) => void;
  removeLocal: (day: number) => void;
}

/**
 * In-memory mirror of `journal_days` (ADR-009). Pure, synchronous reducers;
 * `journalService` writes through to SQLite first.
 */
export const useJournalStore = create<JournalState>(set => ({
  entries: [],
  hydrated: false,
  setEntries: entries =>
    set({
      entries: [...entries].sort((a, b) => a.day - b.day),
      hydrated: true,
    }),
  upsertLocal: entry =>
    set(state => ({
      entries: [...state.entries.filter(e => e.day !== entry.day), entry].sort(
        (a, b) => a.day - b.day,
      ),
    })),
  removeLocal: day =>
    set(state => ({ entries: state.entries.filter(e => e.day !== day) })),
}));
