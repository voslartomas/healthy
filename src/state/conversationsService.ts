import {
  deleteConversation,
  loadConversations,
  upsertConversation,
} from '../db/conversationsRepository';
import {
  Conversation,
  currentConversation,
  StoredMessage,
  useConversationsStore,
} from './useConversationsStore';

/**
 * Orchestration between the conversations store (in-memory, for the UI) and the
 * SQLite repository (durable). The coach screen calls these instead of touching
 * either layer: every mutation updates the store synchronously (instant UI) and
 * write-throughs to SQLite are fire-and-forget so a DB hiccup never blocks chat.
 */

/** The coach's opening line, shown as the first bubble of a fresh conversation.
 * Lives here (not in CoachScreen) so new conversations can seed it. */
export const GREETING =
  "Hey! I'm your nutrition coach — ask me anything about your calories, macros, or what to eat. When you want something saved, just tell me to log it (e.g. “log 4 eggs and 2 slices of toast”) and I'll add it to Health Connect.";

let idCounter = 0;

/** Collision-resistant id without a uuid dependency. */
function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

/** A short title from the first user message. */
function deriveTitle(text: string): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > 40 ? `${clean.slice(0, 40)}…` : clean || 'New chat';
}

function persist(conv: Conversation): void {
  void upsertConversation(conv).catch(err =>
    console.warn('Failed to persist conversation', err),
  );
}

/** Load persisted conversations into the store and resume the most recent one.
 * Call once on app start. */
export async function initConversations(): Promise<void> {
  const list = await loadConversations();
  const store = useConversationsStore.getState();
  store.setConversations(list);
  store.setCurrentId(list[0]?.id ?? null);
}

/** Start a fresh conversation (seeded with the greeting) and make it current. */
export function createConversation(): Conversation {
  const now = Date.now();
  const conv: Conversation = {
    id: newId('conv'),
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    messages: [{ id: newId('m'), from: 'ai', text: GREETING }],
  };
  const store = useConversationsStore.getState();
  store.upsertLocal(conv);
  store.setCurrentId(conv.id);
  persist(conv);
  return conv;
}

/** Ensure there is a current conversation (creating one if the store is empty),
 * and return it. */
export function ensureConversation(): Conversation {
  const store = useConversationsStore.getState();
  const conv = currentConversation(store);
  return conv ?? createConversation();
}

/** Switch the active conversation. */
export function openConversation(id: string): void {
  useConversationsStore.getState().setCurrentId(id);
}

/** Append a message to the current conversation, updating its title (from the
 * first user message) and timestamp, and persist. */
export function appendMessage(
  from: StoredMessage['from'],
  text: string,
  ms?: number,
): void {
  const store = useConversationsStore.getState();
  const conv = currentConversation(store) ?? ensureConversation();
  const message: StoredMessage = { id: newId('m'), from, text };
  if (ms != null) message.ms = ms;
  const title =
    conv.title === 'New chat' && from === 'me' ? deriveTitle(text) : conv.title;
  const updated: Conversation = {
    ...conv,
    title,
    messages: [...conv.messages, message],
    updatedAt: Date.now(),
  };
  store.upsertLocal(updated);
  persist(updated);
}

/** Delete a conversation; if it was current, fall back to the newest remaining
 * one (or null). */
export async function removeConversation(id: string): Promise<void> {
  await deleteConversation(id).catch(err =>
    console.warn('Failed to delete conversation', err),
  );
  const store = useConversationsStore.getState();
  const wasCurrent = store.currentId === id;
  store.removeLocal(id);
  if (wasCurrent) {
    store.setCurrentId(
      useConversationsStore.getState().conversations[0]?.id ?? null,
    );
  }
}
