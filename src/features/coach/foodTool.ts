/**
 * Food-logging tools the AI coach can call, bridged to Google Health via
 * {@link useHealthStore}. The model estimates calories + macros from a natural
 * description ("Breakfast — 4 eggs, 2 slices of bread") and calls `log_food`.
 *
 * To correct a mistake it can `list_food_log` (today's entries with their ids,
 * sourced from the live snapshot), then `update_food_log`/`delete_food_log` by
 * id. Update is a delete-old + create-new (the v4 nutrition API has no in-place
 * update we rely on), and delete uses the batchDelete method. Because ids come
 * from the refreshed snapshot, this works for entries logged in any session —
 * not just the current chat.
 */

import { FoodEntryInput } from '../../health';
import { addCommonFood } from '../../state/commonFoodsService';
import { useHealthStore } from '../../state/useHealthStore';
import { ToolExecutor, ToolSpec } from './aiClient';

const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'];

const ENTRY_FIELDS = {
  name: {
    type: 'string',
    description:
      'Short meal description, e.g. "Breakfast — 4 eggs, 2 slices of bread".',
  },
  kcal: { type: 'number', description: 'Total calories for this entry.' },
  proteinG: { type: 'number', description: 'Protein in grams.' },
  carbsG: { type: 'number', description: 'Carbohydrates in grams.' },
  fatG: { type: 'number', description: 'Fat in grams.' },
  mealType: { type: 'string', enum: MEAL_TYPES },
};

export const FOOD_TOOLS: ToolSpec[] = [
  {
    name: 'log_food',
    description:
      'Log one or more foods the user ate to their Google Health nutrition log. ' +
      'Estimate calories (kcal) and macros (protein, carbs, fat in grams) from the ' +
      'description using standard nutrition data. Combine items the user mentions as ' +
      'one meal into a single entry with summed totals, unless they clearly describe ' +
      'separate meals. Call this whenever the user reports eating something.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          description: 'One entry per meal to log.',
          items: {
            type: 'object',
            properties: ENTRY_FIELDS,
            required: ['name', 'kcal'],
          },
        },
      },
      required: ['entries'],
    },
  },
  {
    name: 'save_common_food',
    description:
      "Save a food to the user's Common Foods list so they can tap to log it again " +
      'later. Use when the user asks to save or remember a food (e.g. "save this to ' +
      'common foods"). Estimate calories and macros the same way as log_food. This ' +
      'does NOT log the food for today — it only saves it for quick re-use.',
    parameters: {
      type: 'object',
      properties: ENTRY_FIELDS,
      required: ['name', 'kcal'],
    },
  },
  {
    name: 'list_food_log',
    description:
      'List the food entries already logged for today, each with its `id`, name, ' +
      'calories and time. Call this before updating or deleting an entry so you can ' +
      'reference it by id.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'update_food_log',
    description:
      'Correct a logged entry (e.g. wrong quantity or macros). First call ' +
      'list_food_log to get the entry `id`. Provide the corrected FULL values (not ' +
      'deltas) — the entry is replaced with exactly what you pass.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description:
            'The entry id from list_food_log (or a prior log_food result).',
        },
        ...ENTRY_FIELDS,
      },
      required: ['id', 'name', 'kcal'],
    },
  },
  {
    name: 'delete_food_log',
    description:
      'Delete a logged entry the user wants removed. First call list_food_log to get ' +
      'the entry `id`.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description:
            'The entry id from list_food_log (or a prior log_food result).',
        },
      },
      required: ['id'],
    },
  },
];

/** Coerce a loose tool-arg object into a typed FoodEntryInput. */
function toInput(raw: Record<string, unknown>): FoodEntryInput {
  const num = (v: unknown): number | undefined => {
    const n = Number(v);
    return v != null && v !== '' && Number.isFinite(n) ? n : undefined;
  };
  const input: FoodEntryInput = {
    name: String(raw.name ?? 'Food'),
    kcal: num(raw.kcal) ?? 0,
  };
  if (raw.mealType) input.mealType = String(raw.mealType);
  const p = num(raw.proteinG);
  const c = num(raw.carbsG);
  const f = num(raw.fatG);
  if (p != null) input.proteinG = p;
  if (c != null) input.carbsG = c;
  if (f != null) input.fatG = f;
  return input;
}

/** Short human summary for a confirmation bubble, e.g.
 * "Oatmeal — 320 kcal · 12P · 54C · 6F". */
function summarize(input: FoodEntryInput): string {
  const macros = [
    input.proteinG != null ? `${Math.round(input.proteinG)}P` : null,
    input.carbsG != null ? `${Math.round(input.carbsG)}C` : null,
    input.fatG != null ? `${Math.round(input.fatG)}F` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return `${input.name} — ${Math.round(input.kcal)} kcal${macros ? ` · ${macros}` : ''}`;
}

/** Turn a raw write-failure reason into a clear, user-facing sentence. */
function describeError(err?: string): string {
  if (!err || err === 'not-connected' || err === 'not-signed-in') {
    return "Couldn't reach Google Health — open Settings and connect Google Health, then try again.";
  }
  return (
    `Google Health rejected the request (${err}). ` +
    'Your nutrition write permission may be missing — reconnect Google Health in Settings and allow nutrition access.'
  );
}

export interface FoodToolset {
  tools: ToolSpec[];
  exec: ToolExecutor;
}

/**
 * Build the food-logging toolset for one chat session. `onLog` is called with a
 * short human summary each time an entry is written, updated, or deleted so the
 * screen can render a confirmation line. All writes go through
 * {@link useHealthStore}, which refreshes the snapshot on success.
 */
export function makeFoodToolset(onLog: (summary: string) => void): FoodToolset {
  const exec: ToolExecutor = async (name, args) => {
    const store = useHealthStore.getState();

    if (name === 'log_food') {
      const entries = Array.isArray(args.entries)
        ? (args.entries as Record<string, unknown>[])
        : [];
      if (entries.length === 0) {
        return JSON.stringify({
          ok: false,
          error:
            'No entries provided. Call log_food again with args.entries as a non-empty array, each item having at least "name" and "kcal", e.g. {"entries":[{"name":"oatmeal","kcal":300,"proteinG":10}]}.',
        });
      }
      const results = [];
      for (const raw of entries) {
        const input = toInput(raw);
        const res = await store.logFoodEntry(input);
        if (res.ok) {
          onLog(`Logged: ${summarize(input)}`);
          results.push({ ok: true, id: res.name ?? null, ...input });
        } else {
          results.push({ ok: false, error: res.error, ...input });
        }
      }
      if (!results.some(r => r.ok)) {
        const reason = results
          .map(r => (r as { error?: string }).error)
          .find(Boolean);
        const human = describeError(reason);
        onLog(human);
        return JSON.stringify({ ok: false, error: human, results });
      }
      return JSON.stringify({
        ok: true,
        results,
        hint: 'To change or remove an entry later, call list_food_log to get its id.',
      });
    }

    if (name === 'save_common_food') {
      const input = toInput(args);
      try {
        await addCommonFood({
          name: input.name,
          kcal: input.kcal,
          proteinG: input.proteinG ?? null,
          carbsG: input.carbsG ?? null,
          fatG: input.fatG ?? null,
          mealType: input.mealType ?? null,
        });
        onLog(`Saved to Common Foods: ${summarize(input)}`);
        return JSON.stringify({ ok: true, saved: input });
      } catch (err) {
        return JSON.stringify({
          ok: false,
          error: String((err as Error)?.message ?? err),
        });
      }
    }

    if (name === 'list_food_log') {
      const meals = store.snapshot.nutrition?.meals ?? [];
      const entries = meals.map(m => ({
        id: m.id ?? null,
        name: m.name,
        kcal: m.kcal,
        mealType: m.mealType,
        time: new Date(m.time).toISOString(),
      }));
      return JSON.stringify({
        ok: true,
        entries,
        note: entries.some(e => !e.id)
          ? 'Entries without an id cannot be edited or deleted.'
          : undefined,
      });
    }

    if (name === 'delete_food_log') {
      const id = String(args.id ?? '');
      if (!id) {
        return JSON.stringify({
          ok: false,
          error: 'Missing id — call list_food_log first to get the entry id.',
        });
      }
      const ok = await store.removeFoodEntry(id);
      if (!ok) {
        return JSON.stringify({
          ok: false,
          error:
            'Delete failed — the entry may no longer exist, or Google Health is not connected.',
        });
      }
      onLog('Deleted a food entry.');
      return JSON.stringify({ ok: true });
    }

    if (name === 'update_food_log') {
      const id = String(args.id ?? '');
      if (!id) {
        return JSON.stringify({
          ok: false,
          error: 'Missing id — call list_food_log first to get the entry id.',
        });
      }
      const updated = toInput(args);
      // No in-place update we rely on: delete the old data point, create anew.
      const removed = await store.removeFoodEntry(id);
      if (!removed) {
        return JSON.stringify({
          ok: false,
          error: 'Could not remove the old entry to update it.',
        });
      }
      const res = await store.logFoodEntry(updated);
      if (!res.ok) {
        return JSON.stringify({
          ok: false,
          error: `Removed the old entry but failed to write the corrected one${res.error ? ` (${res.error})` : ''}.`,
        });
      }
      onLog(`Updated: ${summarize(updated)}`);
      return JSON.stringify({ ok: true, id: res.name ?? null, ...updated });
    }

    return JSON.stringify({ ok: false, error: `Unknown tool ${name}.` });
  };

  return { tools: FOOD_TOOLS, exec };
}
