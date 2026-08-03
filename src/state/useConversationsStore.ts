import { create } from 'zustand';

/**
 * In-memory store for AI-coach conversations. The {@link conversationsService}
 * layer keeps this in sync with SQLite (durable history); reducers here stay
 * pure/synchronous so the UI updates instantly and they're testable without a
 * native database.
 */

/** One chat bubble. `system` rows are inline notes (e.g. "Logged: …"); `ms` is
 * the model's response time for an `ai` reply. */
export interface StoredMessage {
  id: string;
  from: 'ai' | 'me' | 'system';
  text: string;
  ms?: number;
}

export interface Conversation {
  id: string;
  /** Derived from the first user message; "New chat" until one is sent. */
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

interface ConversationsState {
  /** All conversations, most-recently-updated first. */
  conversations: Conversation[];
  /** The conversation currently shown in the coach screen. */
  currentId: string | null;
  hydrated: boolean;
  /** Replace the whole list (hydration from SQLite). */
  setConversations: (list: Conversation[]) => void;
  setCurrentId: (id: string | null) => void;
  /** Insert or replace a conversation, keeping the list sorted newest-first. */
  upsertLocal: (conv: Conversation) => void;
  removeLocal: (id: string) => void;
}

export const useConversationsStore = create<ConversationsState>(set => ({
  conversations: [],
  currentId: null,
  hydrated: false,
  setConversations: list =>
    set({ conversations: sortByUpdated(list), hydrated: true }),
  setCurrentId: id => set({ currentId: id }),
  upsertLocal: conv =>
    set(state => ({
      conversations: sortByUpdated([
        conv,
        ...state.conversations.filter(c => c.id !== conv.id),
      ]),
    })),
  removeLocal: id =>
    set(state => ({
      conversations: state.conversations.filter(c => c.id !== id),
    })),
}));

function sortByUpdated(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** The active conversation, or null if none is selected/loaded. */
export function currentConversation(state: {
  conversations: Conversation[];
  currentId: string | null;
}): Conversation | null {
  return state.conversations.find(c => c.id === state.currentId) ?? null;
}
