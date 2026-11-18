/**
 * Food-logging tools the AI coach can call, bridged to Health Connect via
 * {@link useHealthStore}. The model estimates calories + macros from a natural
 * description ("Breakfast — 4 eggs, 2 slices of bread") and calls `log_food`.
 *
 * To correct a mistake it calls `update_food_log`/`delete_food_log` with the
 * entry's NAME, resolved against today's entries by {@link resolveEntry} (an id
 * from `list_food_log` also works). Names, because Gemini Nano could not copy
 * the right id out of a list: asked to "remove the banana" it deleted the bread.
 * Update goes through {@link replaceFoodEntry} (delete-old + create-new,
 * keeping the entry's time, meal type and habit tags). Because ids come from the
 * refreshed snapshot, this works for entries logged in any session — not just
 * the current chat.
 *
 * Every successful WRITE returns a `confirm` sentence. The on-device runner ends
 * the turn with it instead of asking the model to phrase the confirmation (see
 * runner.ts): a second model round was slow and was where the small OS models
 * went wrong — re-calling log_food (a duplicate entry) or replying garbled.
 */

import { FoodEntryInput } from '../../health';
import { addCommonFood } from '../../state/commonFoodsService';
import { deleteFoodEntry, replaceFoodEntry } from '../../state/foodLogService';
import type { LoggedFood } from '../../state/useConversationsStore';
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

/** Units a saved food's portion can be measured in. 'g'/'ml'/'piece' scale the
 * kcal/macros when logged; anything else is treated as a whole serving. */
const SERVING_UNITS = ['g', 'ml', 'piece', 'serving'];

/** Extra fields only `save_common_food` accepts: the reference portion the
 * kcal/macros describe, so the user can later slide the amount up or down. */
const SERVING_FIELDS = {
  servingSize: {
    type: 'number',
    description:
      'The reference portion the kcal/macros describe, e.g. 100 for per-100 g ' +
      'values or 1 for a single piece. Omit for a whole-serving favourite.',
  },
  servingUnit: {
    type: 'string',
    enum: SERVING_UNITS,
    description:
      "Unit for servingSize: 'g' or 'ml' (with a size like 100), 'piece' for " +
      "countable items, or 'serving' when it's just one portion. Prefer 'g' " +
      'with per-100 g values when you know them.',
  },
};

export const FOOD_TOOLS: ToolSpec[] = [
  {
    name: 'log_food',
    description:
      'Log one or more foods the user ate to their Health Connect nutrition log. ' +
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
      'common foods"). Estimate calories and macros the same way as log_food. When ' +
      'you know a natural portion, set servingSize + servingUnit (e.g. 100 g, or 1 ' +
      'piece) and give the kcal/macros PER THAT portion — the app then lets the user ' +
      'slide the amount when logging. This does NOT log the food for today.',
    parameters: {
      type: 'object',
      properties: { ...ENTRY_FIELDS, ...SERVING_FIELDS },
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
      'Correct a food logged today (e.g. wrong quantity or macros). Identify it by ' +
      "`name`, as it appears in today's food log. Provide the corrected FULL values " +
      '(not deltas) — the entry is replaced with exactly what you pass.',
    parameters: {
      type: 'object',
      properties: {
        ...ENTRY_FIELDS,
        id: {
          type: 'string',
          description: 'Optional: the entry id from list_food_log.',
        },
      },
      required: ['name', 'kcal'],
    },
  },
  {
    name: 'delete_food_log',
    description:
      'Delete a food logged today that the user wants removed. Identify it by ' +
      "`name`, as the user calls it or as it appears in today's food log.",
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The food to delete, e.g. "banana".',
        },
        id: {
          type: 'string',
          description: 'Optional: the entry id from list_food_log.',
        },
      },
      required: ['name'],
    },
  },
];

/** First non-empty string (or number, as text) among `keys` of `obj`. */
function pickText(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

/** Lower-case, diacritics stripped, split into words of 3+ letters. */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3);
}

/** Same word, allowing inflection: "banan"/"banana", "rohlik"/"rohliky". */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return (
    n >= 4 && a.slice(0, Math.max(4, n - 1)) === b.slice(0, Math.max(4, n - 1))
  );
}

/** How many of `query`'s words appear in `name`. */
function nameScore(name: string, query: string): number {
  const nw = words(name);
  return words(query).filter(q => nw.some(w => sameWord(q, w))).length;
}

export interface ResolvableMeal {
  id?: string | null;
  name: string;
  kcal: number;
  time: number;
}

/**
 * Which of today's entries the model means. The NAME decides: a small model
 * names the food reliably but picks ids badly (it passed the bread's id, and a
 * made-up "1", when asked to remove the banana). So an id is honoured only
 * when its entry also matches the name — or when no entry matches the name
 * (a renamed correction, "it was an apple, not a pear"). Several matches → the
 * most recent. Returns null when nothing fits.
 */
export function resolveEntry<M extends ResolvableMeal>(
  meals: M[],
  id: string | undefined,
  name: string | undefined,
): M | null {
  const editable = meals.filter(m => m.id);
  const byId = id ? editable.find(m => m.id === id) : undefined;
  if (!name || !name.trim()) return byId ?? null;
  if (byId && nameScore(byId.name, name) > 0) return byId;
  let best: M | null = null;
  let bestScore = 0;
  for (const m of editable) {
    const sc = nameScore(m.name, name);
    if (
      sc > bestScore ||
      (sc === bestScore && sc > 0 && best && m.time > best.time)
    ) {
      best = m;
      bestScore = sc;
    }
  }
  return best ?? byId ?? null;
}

/** "Today you have: Banana, 2 eggs." — for a not-found error the model can use. */
function todayNames(meals: ResolvableMeal[]): string {
  const names = meals.filter(m => m.id).map(m => m.name);
  return names.length
    ? `Today's entries: ${names.join(', ')}.`
    : 'Nothing is logged today.';
}

/** First finite number among `keys` of `obj` (strings like "12 g" count). */
function pick(
  obj: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Coerce a loose tool-arg object into a typed FoodEntryInput.
 *
 * Tolerant on purpose. The schema asks for `kcal` / `proteinG` / `carbsG` /
 * `fatG`, but the small on-device model (Gemini Nano, observed on a real phone)
 * invents its own field names — `calories`, `protein`, `carbohydrates`, macros
 * nested under `nutrients` — and sometimes omits calories entirely while giving
 * macros. Rejecting that cost a whole extra model round and usually ended in a
 * confused reply, when the meaning was perfectly clear. So read the common
 * aliases, and when calories are missing derive them from the macros
 * (4 kcal/g protein & carbs, 9 kcal/g fat).
 */
function toInput(raw: Record<string, unknown>): FoodEntryInput {
  const nested =
    raw.nutrients && typeof raw.nutrients === 'object'
      ? (raw.nutrients as Record<string, unknown>)
      : raw.macros && typeof raw.macros === 'object'
        ? (raw.macros as Record<string, unknown>)
        : {};
  const all = { ...nested, ...raw };
  const p = pick(all, ['proteinG', 'protein', 'protein_g', 'proteins']);
  const c = pick(all, [
    'carbsG',
    'carbs',
    'carbohydrates',
    'carbs_g',
    'carbohydratesG',
  ]);
  const f = pick(all, ['fatG', 'fat', 'fat_g', 'fats']);
  const fromMacros =
    p != null || c != null || f != null
      ? Math.round((p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9)
      : undefined;
  const kcal =
    pick(all, ['kcal', 'calories', 'energy', 'kcals', 'energyKcal']) ??
    fromMacros ??
    0;
  const name = String(raw.name ?? raw.food ?? raw.item ?? 'Food');
  const input: FoodEntryInput = { name, kcal };
  const meal = raw.mealType ?? raw.meal;
  if (typeof meal === 'string' && meal) input.mealType = meal.toUpperCase();
  if (p != null) input.proteinG = p;
  if (c != null) input.carbsG = c;
  if (f != null) input.fatG = f;
  return input;
}

/** The entries of a log_food call, whatever the model called the array (or a
 * single object passed directly as the args). */
function entryList(args: Record<string, unknown>): Record<string, unknown>[] {
  for (const key of ['entries', 'food', 'foods', 'items', 'meals']) {
    const v = args[key];
    if (Array.isArray(v)) {
      return v.filter(
        (x): x is Record<string, unknown> => !!x && typeof x === 'object',
      );
    }
  }
  return typeof args.name === 'string' ? [args] : [];
}

/** Short human summary for a confirmation bubble, e.g.
 * "Oatmeal — 320 kcal · 12P · 54C · 6F". Exported for the food editor, which
 * rewrites the note after an edit. */
export function summarizeFood(input: FoodEntryInput): string {
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
    return "Couldn't reach Health Connect — open Settings and connect Health Connect, then try again.";
  }
  return (
    `Health Connect rejected the request (${err}). ` +
    'Your nutrition write permission may be missing — reconnect Health Connect in Settings and allow nutrition access.'
  );
}

export interface FoodToolset {
  tools: ToolSpec[];
  exec: ToolExecutor;
}

/** The entry as the chat note stores it, so tapping the note can edit it. */
function loggedFood(input: FoodEntryInput, id: string | null): LoggedFood {
  return {
    entryId: id,
    name: input.name,
    kcal: input.kcal,
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    mealType: input.mealType,
  };
}

/**
 * Build the food-logging toolset for one chat session. `onLog` is called with a
 * short human summary each time an entry is written, updated, or deleted so the
 * screen can render a confirmation line — plus, for a written entry, the entry
 * itself, which makes the line tappable (food editor). All writes go through
 * {@link useHealthStore}, which refreshes the snapshot on success.
 */
export function makeFoodToolset(
  onLog: (summary: string, food?: LoggedFood) => void,
): FoodToolset {
  const exec: ToolExecutor = async (name, args) => {
    const store = useHealthStore.getState();

    if (name === 'log_food') {
      // Entries without any calories (none given, none derivable) can't be
      // logged meaningfully; they fall through to the "no entries" error.
      const entries = entryList(args).filter(e => toInput(e).kcal > 0);
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
          onLog(
            `Logged: ${summarizeFood(input)}`,
            loggedFood(input, res.name ?? null),
          );
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
      const done = results.filter(r => r.ok) as (FoodEntryInput & {
        ok: true;
      })[];
      const kcal = Math.round(done.reduce((sum, r) => sum + (r.kcal ?? 0), 0));
      return JSON.stringify({
        ok: true,
        results,
        confirm:
          done.length === 1
            ? `Logged ${done[0].name} — ${kcal} kcal. Tap it above to adjust the numbers.`
            : `Logged ${done.length} foods — ${kcal} kcal in total. Tap one above to adjust it.`,
        hint: 'To change or remove an entry later, call list_food_log to get its id.',
      });
    }

    if (name === 'save_common_food') {
      const input = toInput(args);
      // Only g/ml/piece carry a scalable size; 'serving'/absent stays unitless
      // (a plain multiplier at log time). Mirrors the manual form's rule.
      const rawUnit =
        typeof args.servingUnit === 'string'
          ? args.servingUnit.toLowerCase()
          : '';
      const isUnit = rawUnit === 'g' || rawUnit === 'ml' || rawUnit === 'piece';
      const rawSize = Number(args.servingSize);
      const servingUnit = isUnit ? rawUnit : null;
      const servingSize = isUnit
        ? Number.isFinite(rawSize) && rawSize > 0
          ? rawSize
          : 1
        : null;
      const saved = { ...input, servingSize, servingUnit };
      try {
        await addCommonFood({
          name: input.name,
          kcal: input.kcal,
          proteinG: input.proteinG ?? null,
          carbsG: input.carbsG ?? null,
          fatG: input.fatG ?? null,
          mealType: input.mealType ?? null,
          servingSize,
          servingUnit,
        });
        const portion =
          servingUnit != null ? ` · per ${servingSize} ${servingUnit}` : '';
        onLog(`Saved to Common Foods: ${summarizeFood(input)}${portion}`);
        return JSON.stringify({
          ok: true,
          saved,
          confirm: `Saved ${input.name} to your quick-add foods.`,
        });
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
      const meals = store.snapshot.nutrition?.meals ?? [];
      const gone = resolveEntry(
        meals,
        pickText(args, ['id', 'entryId']),
        pickText(args, ['name', 'food', 'item']),
      );
      if (!gone?.id) {
        return JSON.stringify({
          ok: false,
          error: `No matching food logged today. ${todayNames(meals)} Call delete_food_log with one of these names.`,
          // Shown to the user if the model can't recover from this itself.
          say: `I couldn't find that in today's food log. ${todayNames(meals)}`,
        });
      }
      const id = gone.id;
      const ok = await deleteFoodEntry(id);
      if (!ok) {
        return JSON.stringify({
          ok: false,
          error:
            'Delete failed — the entry may no longer exist, or Health Connect is not connected.',
        });
      }
      const label = `${gone.name} (${Math.round(gone.kcal)} kcal)`;
      onLog(`Deleted: ${label}.`);
      return JSON.stringify({
        ok: true,
        confirm: `Deleted ${label} from today's food log.`,
      });
    }

    if (name === 'update_food_log') {
      const meals = store.snapshot.nutrition?.meals ?? [];
      const target = resolveEntry(
        meals,
        pickText(args, ['id', 'entryId']),
        pickText(args, ['name', 'food', 'item']),
      );
      if (!target?.id) {
        return JSON.stringify({
          ok: false,
          error: `No matching food logged today. ${todayNames(meals)} Call update_food_log with one of these names.`,
          // Shown to the user if the model can't recover from this itself.
          say: `I couldn't find that in today's food log. ${todayNames(meals)}`,
        });
      }
      const id = target.id;
      const asked = toInput(args);
      // The model names the food loosely ("Eggs" for "2 eggs"); that is how it
      // FOUND the entry, not a rename — keep the original name then. A name that
      // doesn't match the entry at all ("it was an apple") is a real rename.
      const updated =
        nameScore(target.name, asked.name) > 0
          ? { ...asked, name: target.name }
          : asked;
      // Delete-old + create-new, keeping the entry's time, meal and tags.
      const res = await replaceFoodEntry(id, updated);
      if (!res.ok) {
        return JSON.stringify({ ok: false, error: res.error });
      }
      onLog(`Updated: ${summarizeFood(updated)}`, loggedFood(updated, res.id));
      return JSON.stringify({
        ok: true,
        id: res.id,
        ...updated,
        confirm: `Updated ${updated.name} — ${Math.round(updated.kcal)} kcal.`,
      });
    }

    return JSON.stringify({ ok: false, error: `Unknown tool ${name}.` });
  };

  return { tools: FOOD_TOOLS, exec };
}
