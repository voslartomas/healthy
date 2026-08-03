import { Conversation, StoredMessage } from '../state/useConversationsStore';
import { getDb } from './database';

/**
 * Persistence for AI-coach conversations. Messages are stored as a JSON blob per
 * conversation (they're only ever read/written whole), keeping the schema tiny.
 * This is the single place that knows the SQLite shape; the rest of the app
 * works with plain {@link Conversation} objects.
 */

interface ConversationRow {
  id: string;
  title: string;
  messages: string;
  created_at: number;
  updated_at: number;
}

function rowToConversation(row: ConversationRow): Conversation {
  let messages: StoredMessage[] = [];
  try {
    const parsed = JSON.parse(row.messages);
    if (Array.isArray(parsed)) messages = parsed as StoredMessage[];
  } catch {
    messages = [];
  }
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

/** Load all conversations, most recently updated first. */
export async function loadConversations(): Promise<Conversation[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ConversationRow>(
    'SELECT id, title, messages, created_at, updated_at FROM conversations ORDER BY updated_at DESC;',
  );
  return rows.map(rowToConversation);
}

/** Insert or replace a whole conversation. */
export async function upsertConversation(conv: Conversation): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO conversations (id, title, messages, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       messages = excluded.messages,
       updated_at = excluded.updated_at;`,
    conv.id,
    conv.title,
    JSON.stringify(conv.messages),
    conv.createdAt,
    conv.updatedAt,
  );
}

/** Delete a conversation by id. */
export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM conversations WHERE id = ?;', id);
}
