import { getDb } from './database';

/**
 * Persistence for the Android home-screen widget (ADR-010): a tiny key/value
 * table. The app writes the rendered summary under {@link DATA_KEY}; each
 * placed widget remembers which view it is on under `view:<widgetId>`.
 *
 * Read from the widget's headless JS task as well as the app, which is why the
 * widget keeps its state here and not in a zustand store: the headless task
 * can run with no React tree and no hydrated stores.
 */

const DATA_KEY = 'data';
const viewKey = (widgetId: number) => `view:${widgetId}`;

async function getValue(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM widget_state WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

async function setValue(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO widget_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_at = excluded.updated_at`,
    key,
    value,
    Date.now(),
  );
}

/** The raw WidgetData JSON, or null when the app hasn't written any yet. */
export function loadWidgetDataRaw(): Promise<string | null> {
  return getValue(DATA_KEY);
}

export function saveWidgetDataRaw(json: string): Promise<void> {
  return setValue(DATA_KEY, json);
}

export function loadWidgetView(widgetId: number): Promise<string | null> {
  return getValue(viewKey(widgetId));
}

export function saveWidgetView(widgetId: number, view: string): Promise<void> {
  return setValue(viewKey(widgetId), view);
}

/** Forget a widget the user removed from the home screen. */
export async function deleteWidgetView(widgetId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM widget_state WHERE key = ?',
    viewKey(widgetId),
  );
}

const BACKGROUND_ASKED_KEY = 'backgroundAsked';

/** Whether we already asked for Health Connect's background-read grant. */
export async function wasBackgroundReadAsked(): Promise<boolean> {
  return (await getValue(BACKGROUND_ASKED_KEY)) != null;
}

export function markBackgroundReadAsked(): Promise<void> {
  return setValue(BACKGROUND_ASKED_KEY, '1');
}
