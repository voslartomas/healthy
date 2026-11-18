import React from 'react';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { renderWithProviders } from '../jest/renderWithProviders';
import { makeFoodToolset, resolveEntry } from '../src/features/coach/foodTool';
import {
  asksToDelete,
  claimsAction,
  isToolConfirmation,
  runOnDevice,
} from '../src/features/coach/ondevice/runner';
import { SystemModelEngine } from '../src/features/coach/ondevice/systemLlm';
import { useModelStore } from '../src/features/coach/ondevice/useModelStore';
import {
  FoodEditSheet,
  macroKcal,
  scaleValues,
} from '../src/features/nutrition/FoodEditSheet';
import { EMPTY_SNAPSHOT } from '../src/health';
import { replaceFoodEntry } from '../src/state/foodLogService';
import { useFoodTagsStore } from '../src/state/useFoodTagsStore';
import { useHealthStore } from '../src/state/useHealthStore';

const BREAKFAST_AT = new Date(2026, 10, 18, 8, 5).getTime();

/** A health store whose writes are scripted: entries get ids new-1, new-2, … */
function stubHealthStore() {
  let n = 0;
  const logFoodEntry = jest.fn(async () => ({ ok: true, name: `new-${++n}` }));
  const removeFoodEntry = jest.fn(async () => true);
  useHealthStore.setState({
    logFoodEntry,
    removeFoodEntry,
    snapshot: {
      ...EMPTY_SNAPSHOT,
      nutrition: {
        eaten: 300,
        proteinG: 10,
        carbsG: 40,
        fatG: 10,
        meals: [
          {
            id: 'old-1',
            name: 'Toast',
            mealType: 'BREAKFAST',
            kcal: 300,
            time: BREAKFAST_AT,
          },
        ],
      },
    },
  } as never);
  return { logFoodEntry, removeFoodEntry };
}

afterEach(() => {
  useHealthStore.setState({ snapshot: EMPTY_SNAPSHOT });
  useFoodTagsStore.setState({ rows: [] });
});

describe('replaceFoodEntry', () => {
  it('keeps the original time and meal, and moves the habit tags', async () => {
    const { logFoodEntry, removeFoodEntry } = stubHealthStore();
    useFoodTagsStore.setState({
      rows: [
        {
          id: 't1',
          entryId: 'old-1',
          dayStart: 0,
          name: 'Toast',
          tags: ['junk'],
          loggedAt: BREAKFAST_AT,
        },
      ],
    });

    const res = await replaceFoodEntry('old-1', { name: 'Toast', kcal: 220 });

    expect(res).toEqual({ ok: true, id: 'new-1' });
    expect(removeFoodEntry).toHaveBeenCalledWith('old-1');
    // Re-created at breakfast time, as breakfast — not "now".
    expect(logFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        kcal: 220,
        at: BREAKFAST_AT,
        mealType: 'BREAKFAST',
      }),
    );
    // The junk tag follows the entry to its new id, so food habits still see it.
    const rows = useFoodTagsStore.getState().rows;
    expect(rows.map(r => r.entryId)).toEqual(['new-1']);
    expect(rows[0].tags).toEqual(['junk']);
  });
});

describe('log_food from the coach', () => {
  it('hands the chat the entry (to edit later) and a confirmation', async () => {
    stubHealthStore();
    const onLog = jest.fn();
    const { exec } = makeFoodToolset(onLog);
    const out = JSON.parse(
      await exec('log_food', {
        entries: [{ name: 'Chleba s máslem', kcal: 340, proteinG: 9 }],
      }),
    );
    expect(out.ok).toBe(true);
    expect(out.confirm).toMatch(/Logged Chleba s máslem — 340 kcal/);
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('Logged: Chleba s máslem'),
      expect.objectContaining({ entryId: 'new-1', kcal: 340, proteinG: 9 }),
    );
  });
});

describe('on-device runner after a write tool', () => {
  const engine = (script: string[]) => {
    const calls: string[] = [];
    let i = 0;
    const e: SystemModelEngine = {
      status: async () => ({ status: 'available', modelName: 'Gemini Nano' }),
      download: async () => undefined,
      warmup: async () => undefined,
      generate: async (_s, prompt) => {
        calls.push(prompt);
        return script[i++] ?? '{"reply":"(end)"}';
      },
    };
    return { e, calls };
  };

  beforeEach(() => {
    useModelStore.setState({ status: 'ready', modelName: 'Gemini Nano' });
  });

  /**
   * The bug from the phone: after log_food the model got a second round to
   * phrase the confirmation — slow, and where Gemini Nano re-called log_food or
   * replied garbled. The tool's own confirmation now ends the turn.
   */
  it('ends the turn with the tool confirmation — one model call', async () => {
    const { e, calls } = engine([
      '{"tool":"log_food","args":{"entries":[{"name":"toast","kcal":90}]}}',
      '{"tool":"log_food","args":{"entries":[{"name":"toast","kcal":90}]}}',
    ]);
    const exec = jest.fn(async () =>
      JSON.stringify({ ok: true, confirm: 'Logged toast — 90 kcal.' }),
    );
    const reply = await runOnDevice(
      { provider: 'ondevice', model: 'On-device AI', apiKey: '' },
      {
        system: 's',
        history: [{ role: 'user', content: 'toast' }],
        tools: [],
        exec,
        toolChoice: { force: 'log_food' },
      },
      e,
    );
    expect(reply).toBe('Logged toast — 90 kcal.');
    expect(calls).toHaveLength(1);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('never re-runs an identical tool call within a turn', async () => {
    const { e } = engine([
      '{"tool":"list_food_log","args":{}}',
      '{"tool":"list_food_log","args":{}}',
      '{"reply":"You had toast."}',
    ]);
    const exec = jest.fn(async () => JSON.stringify({ ok: true, entries: [] }));
    const reply = await runOnDevice(
      { provider: 'ondevice', model: 'On-device AI', apiKey: '' },
      {
        system: 's',
        history: [{ role: 'user', content: 'what did I eat?' }],
        tools: [],
        exec,
      },
      e,
    );
    expect(exec).toHaveBeenCalledTimes(1);
    expect(reply).toBe('You had toast.');
  });
});

describe('a reply that claims a change it never made', () => {
  const engine = (script: string[]) => {
    let i = 0;
    const e: SystemModelEngine = {
      status: async () => ({ status: 'available', modelName: 'Gemini Nano' }),
      download: async () => undefined,
      warmup: async () => undefined,
      generate: async () => script[i++] ?? '{"reply":"(end)"}',
    };
    return e;
  };
  const run = (e: SystemModelEngine, exec: jest.Mock) =>
    runOnDevice(
      { provider: 'ondevice', model: 'On-device AI', apiKey: '' },
      {
        system: 's',
        history: [{ role: 'user', content: 'delete the banana' }],
        tools: [{ name: 'delete_food_log', description: 'd', parameters: {} }],
        exec,
      },
      e,
    );

  beforeEach(() => {
    useModelStore.setState({ status: 'ready', modelName: 'Gemini Nano' });
  });

  it('recognises first-person claims, in English and Czech', () => {
    expect(claimsAction("Okay, I've deleted the banana from your log.")).toBe(
      true,
    );
    expect(claimsAction('Smazal jsem banán.')).toBe(true);
    expect(claimsAction('Smazané.')).toBe(true);
    expect(claimsAction('Mám to smazat?')).toBe(false);
    expect(claimsAction('Zkus upravený jídelníček.')).toBe(false);
    expect(claimsAction('The entry has been removed.')).toBe(true);
    // Seen on the phone after the first-person form was caught.
    expect(
      claimsAction(
        'Removed Banana from your food log. It is now in Common Foods.',
      ),
    ).toBe(true);
    // The tools' own confirmations are true and stay in the history.
    expect(isToolConfirmation('Logged Banana — 105 kcal. Tap it above.')).toBe(
      true,
    );
    expect(isToolConfirmation("Okay, I've deleted the banana.")).toBe(false);
    // A plain answer about what the user did is not a claim.
    expect(claimsAction('You logged 2 eggs and a banana today.')).toBe(false);
  });

  /** The bug from the phone: "I've deleted the banana", no tool call at all. */
  it('makes the model actually call the tool', async () => {
    const exec = jest.fn(async () =>
      JSON.stringify({ ok: true, confirm: 'Deleted Banana.' }),
    );
    const reply = await run(
      engine([
        '{"reply":"Okay, I\'ve deleted the banana."}',
        '{"tool":"delete_food_log","args":{"id":"b1"}}',
      ]),
      exec,
    );
    expect(exec).toHaveBeenCalledTimes(1);
    expect(reply).toBe('Deleted Banana.');
  });

  it('says honestly that nothing changed when it keeps only talking', async () => {
    const exec = jest.fn();
    const reply = await run(
      engine([
        '{"reply":"Okay, I\'ve deleted the banana."}',
        '{"reply":"Done, I have removed it."}',
      ]),
      exec,
    );
    expect(exec).not.toHaveBeenCalled();
    expect(reply).toMatch(/nothing was changed/);
  });
});

describe('asked to delete', () => {
  beforeEach(() => {
    useModelStore.setState({ status: 'ready', modelName: 'Gemini Nano' });
  });

  it('recognises a delete request in English and Czech', () => {
    expect(asksToDelete('delete the banana from my food log')).toBe(true);
    expect(asksToDelete('smaž ten banán')).toBe(true);
    expect(asksToDelete('make the banana 120 kcal')).toBe(false);
  });

  it('makes a delete request answered in words try the tools', async () => {
    const script = [
      '{"reply":"Sure thing, the banana is gone now."}',
      '{"tool":"delete_food_log","args":{"id":"b1"}}',
    ];
    let i = 0;
    const e: SystemModelEngine = {
      status: async () => ({ status: 'available', modelName: 'Gemini Nano' }),
      download: async () => undefined,
      warmup: async () => undefined,
      generate: async () => script[i++] ?? '{"reply":"(end)"}',
    };
    const exec = jest.fn(async () =>
      JSON.stringify({ ok: true, confirm: 'Deleted Banana.' }),
    );
    const reply = await runOnDevice(
      { provider: 'ondevice', model: 'On-device AI', apiKey: '' },
      {
        system: 's',
        history: [{ role: 'user', content: 'remove the banana' }],
        tools: [{ name: 'delete_food_log', description: 'd', parameters: {} }],
        exec,
      },
      e,
    );
    expect(exec).toHaveBeenCalledWith('delete_food_log', { id: 'b1' });
    expect(reply).toBe('Deleted Banana.');
  });

  /** The phone bug: "delete the banana" → update_food_log with its own values. */
  it('steers update_food_log to delete_food_log, and drops a false claim from history', async () => {
    const prompts: string[] = [];
    const script = [
      '{"tool":"update_food_log","args":{"id":"b1","name":"Banana","kcal":105}}',
      '{"tool":"delete_food_log","args":{"id":"b1"}}',
    ];
    let i = 0;
    const e: SystemModelEngine = {
      status: async () => ({ status: 'available', modelName: 'Gemini Nano' }),
      download: async () => undefined,
      warmup: async () => undefined,
      generate: async (_s, prompt) => {
        prompts.push(prompt);
        return script[i++] ?? '{"reply":"(end)"}';
      },
    };
    const exec = jest.fn(async () =>
      JSON.stringify({ ok: true, confirm: 'Deleted Banana.' }),
    );
    const reply = await runOnDevice(
      { provider: 'ondevice', model: 'On-device AI', apiKey: '' },
      {
        system: 's',
        history: [
          { role: 'user', content: 'delete the banana' },
          { role: 'assistant', content: "Okay, I've deleted the banana." },
          { role: 'user', content: 'delete the banana from my food log' },
        ],
        tools: [
          { name: 'update_food_log', description: 'u', parameters: {} },
          { name: 'delete_food_log', description: 'd', parameters: {} },
        ],
        exec,
      },
      e,
    );
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith('delete_food_log', { id: 'b1' });
    expect(reply).toBe('Deleted Banana.');
    expect(prompts[0]).not.toContain("I've deleted");
  });
});

describe('resolveEntry — which food the model means', () => {
  const meals = [
    { id: 'bread', name: '2 krajice chleba s maslem', kcal: 250, time: 1 },
    { id: 'eggs', name: '2 eggs', kcal: 345, time: 2 },
    { id: 'banana', name: 'Banana', kcal: 105, time: 3 },
  ];

  /** The phone bug: "remove the banana" → the bread's id was passed. */
  it('trusts the name over a wrong id', () => {
    expect(resolveEntry(meals, 'bread', 'banana')?.id).toBe('banana');
    expect(resolveEntry(meals, '1', 'banana')?.id).toBe('banana');
  });

  it('matches across case, diacritics and Czech inflection', () => {
    expect(resolveEntry(meals, undefined, 'banán')?.id).toBe('banana');
    expect(resolveEntry(meals, undefined, 'chleba')?.id).toBe('bread');
    expect(resolveEntry(meals, undefined, 'the eggs')?.id).toBe('eggs');
  });

  it('keeps a matching id, and falls back to it for a renamed correction', () => {
    expect(resolveEntry(meals, 'eggs', '2 eggs')?.id).toBe('eggs');
    expect(resolveEntry(meals, 'eggs', 'omelette')?.id).toBe('eggs');
  });

  it('finds nothing rather than guessing', () => {
    expect(resolveEntry(meals, undefined, 'pizza')).toBeNull();
  });

  it('updates by a loose name and keeps the original name', async () => {
    const { logFoodEntry } = stubHealthStore();
    const { exec } = makeFoodToolset(jest.fn());
    const out = JSON.parse(
      await exec('update_food_log', { name: 'toast', kcal: 200, id: '105' }),
    );
    expect(out.ok).toBe(true);
    expect(logFoodEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Toast', kcal: 200, at: BREAKFAST_AT }),
    );
  });

  it('deletes the named food through the tool, by name alone', async () => {
    const { removeFoodEntry } = stubHealthStore();
    const { exec } = makeFoodToolset(jest.fn());
    const out = JSON.parse(await exec('delete_food_log', { name: 'toast' }));
    expect(removeFoodEntry).toHaveBeenCalledWith('old-1');
    expect(out.confirm).toBe("Deleted Toast (300 kcal) from today's food log.");
    const miss = JSON.parse(await exec('delete_food_log', { name: 'pizza' }));
    expect(miss.ok).toBe(false);
    expect(miss.error).toMatch(/Today's entries: Toast/);
  });
});

describe('a reply that only repeats an earlier answer', () => {
  beforeEach(() => {
    useModelStore.setState({ status: 'ready', modelName: 'Gemini Nano' });
  });

  /** The phone run: "smaž ty vejce" → not found → the steps answer, twice. */
  it("falls back to the failed tool's own message", async () => {
    const STEPS = 'You walked 4,854 steps today.';
    const script = [
      '{"tool":"delete_food_log","args":{"name":"Vejce"}}',
      `{"reply":"${STEPS}"}`,
      `{"reply":"${STEPS}"}`,
    ];
    let i = 0;
    const e: SystemModelEngine = {
      status: async () => ({ status: 'available', modelName: 'Gemini Nano' }),
      download: async () => undefined,
      warmup: async () => undefined,
      generate: async () => script[i++] ?? '{"reply":"(end)"}',
    };
    const exec = jest.fn(async () =>
      JSON.stringify({
        ok: false,
        error: 'No matching food.',
        say: "I couldn't find that in today's food log. Today's entries: Eggs.",
      }),
    );
    const reply = await runOnDevice(
      { provider: 'ondevice', model: 'On-device AI', apiKey: '' },
      {
        system: 's',
        history: [
          { role: 'user', content: 'kolik jsem dnes nachodil kroku' },
          { role: 'assistant', content: STEPS },
          { role: 'user', content: 'smaž ty vejce' },
        ],
        tools: [{ name: 'delete_food_log', description: 'd', parameters: {} }],
        exec,
      },
      e,
    );
    expect(reply).toBe(
      "I couldn't find that in today's food log. Today's entries: Eggs.",
    );
  });
});

describe('food editor maths', () => {
  it('scales every value with the portion', () => {
    expect(
      scaleValues({ kcal: 400, proteinG: 20, carbsG: 50, fatG: 12 }, 0.5),
    ).toEqual({ kcal: 200, proteinG: 10, carbsG: 25, fatG: 6 });
  });

  it('knows what the macros add up to', () => {
    expect(macroKcal({ kcal: 0, proteinG: 10, carbsG: 20, fatG: 10 })).toBe(
      210,
    );
  });
});

describe('FoodEditSheet', () => {
  it('opens on the entry and saves its values', async () => {
    const onSave = jest.fn(async () => null);
    await renderWithProviders(
      <FoodEditSheet
        food={{ name: 'Toast', kcal: 300, proteinG: 10, carbsG: 40, fatG: 10 }}
        onCancel={jest.fn()}
        onSave={onSave}
      />,
    );
    expect(screen.getByText('Toast')).toBeOnTheScreen();
    expect(screen.getByLabelText('Portion')).toBeOnTheScreen();
    expect(screen.getByLabelText('Protein')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Save food changes'));
    expect(onSave).toHaveBeenCalledWith({
      kcal: 300,
      proteinG: 10,
      carbsG: 40,
      fatG: 10,
    });
  });
});

describe('FoodEditSheet — delete', () => {
  it('deletes after the confirm', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const onDelete = jest.fn(async () => null);
    await renderWithProviders(
      <FoodEditSheet
        food={{ name: 'Eggs', kcal: 180 }}
        onCancel={jest.fn()}
        onSave={jest.fn(async () => null)}
        onDelete={onDelete}
      />,
    );
    fireEvent.press(screen.getByLabelText('Delete Eggs'));
    const buttons = alert.mock.calls[0][2] as {
      text: string;
      onPress?: () => unknown;
    }[];
    expect(onDelete).not.toHaveBeenCalled();
    await act(async () => {
      await buttons.find(b => b.text === 'Delete')!.onPress!();
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
});
