import {
  buildSystemPreamble,
  formatBytes,
  GARBLED_REPLY,
  parseAction,
  PROMPT_CHAR_BUDGET,
  renderTranscript,
  turnReminder,
} from '../src/features/coach/ondevice/models';

const TOOLS = [
  {
    name: 'log_food',
    description: 'Log a meal.',
    parameters: { type: 'object', properties: {} },
  },
];

describe('formatBytes', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(2_700_000_000)).toBe('2.7 GB');
    expect(formatBytes(850_000_000)).toBe('850 MB');
  });
});

describe('buildSystemPreamble', () => {
  it('embeds the coaching system text, the action protocol, and each tool', () => {
    const p = buildSystemPreamble('You are a coach.', TOOLS);
    expect(p).toContain('You are a coach.');
    expect(p).toContain('"reply"');
    expect(p).toContain('"tool"');
    expect(p).toContain('log_food');
    expect(p).toContain('TOOL_RESULT');
  });

  it('uses a minimal reply-only protocol when there are no tools', () => {
    const p = buildSystemPreamble('Write a brief.', []);
    expect(p).toContain('Write a brief.');
    expect(p).toContain('"reply"');
    // No tool machinery when nothing can be called.
    expect(p).not.toContain('log_food');
    expect(p).not.toContain('TOOL_RESULT');
  });

  /**
   * On device there is no API-level `tool_choice` — the only lever is the prompt.
   * The default rules lean hard AWAY from calling tools ("default to just
   * talking"), which is right for open chat and exactly wrong once the user has
   * pressed an action button. A forced preamble must therefore REPLACE those
   * rules, not append a contradictory instruction: given both, a small model
   * tends to obey the first.
   */
  describe('forced tool', () => {
    it('replaces the default do-not-call rules with a mandate', () => {
      const p = buildSystemPreamble('You are a coach.', TOOLS, 'log_food');
      expect(p).toContain('MUST be {"tool": "log_food"');
      expect(p).not.toContain('Default to just talking');
      expect(p).not.toContain('do NOT call any tool');
    });

    it('keeps the default rules when not forcing', () => {
      const p = buildSystemPreamble('You are a coach.', TOOLS);
      expect(p).toContain('Default to just talking');
      expect(p).not.toContain('has ALREADY chosen the action');
    });

    it('still explains the post-call turn, so it can report the result', () => {
      // Without this the model has no instruction to follow up in words and the
      // turn ends with no confirmation of what it just logged.
      const p = buildSystemPreamble('You are a coach.', TOOLS, 'log_food');
      expect(p).toContain('TOOL_RESULT');
    });
  });
});

describe('renderTranscript', () => {
  it('labels turns like the preamble examples and replays replies in the JSON protocol', () => {
    const out = renderTranscript([
      { role: 'assistant', content: 'Hey! What did you eat?' },
      { role: 'user', content: '2 eggs' },
    ]);
    // A past prose reply is shown as {"reply": …}: replayed as prose it
    // contradicted the JSON-only rule, and Gemini Nano imitated it.
    expect(out).toBe(
      'Assistant: {"reply":"Hey! What did you eat?"}\nUser: 2 eggs\nAssistant:',
    );
  });

  it('keeps a tool-call turn as the JSON it already is', () => {
    const call = '{"tool":"log_food","args":{}}';
    expect(renderTranscript([{ role: 'assistant', content: call }])).toBe(
      `Assistant: ${call}\nAssistant:`,
    );
  });

  it('repeats the key rule right before the answer', () => {
    const out = renderTranscript(
      [{ role: 'user', content: 'toast' }],
      PROMPT_CHAR_BUDGET,
      turnReminder('log_food'),
    );
    expect(out.endsWith('Assistant:')).toBe(true);
    expect(out).toContain('{"tool": "log_food"');
    expect(out.indexOf('log_food')).toBeGreaterThan(out.indexOf('User: toast'));
  });

  it('skips empty turns', () => {
    expect(
      renderTranscript([
        { role: 'user', content: '  ' },
        { role: 'user', content: 'hi' },
      ]),
    ).toBe('User: hi\nAssistant:');
  });

  /**
   * Gemini Nano rejects input over ~4K tokens outright, so a long chat must be
   * trimmed — oldest first, never the turn the model has to answer.
   */
  it('drops the oldest turns to fit the budget, always keeping the newest', () => {
    const turns = Array.from({ length: 60 }, (_, i) => ({
      role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant',
      content: `turn ${i} ` + 'x'.repeat(300),
    }));
    const out = renderTranscript(turns);
    expect(out.length).toBeLessThanOrEqual(PROMPT_CHAR_BUDGET + 20);
    expect(out).toContain('turn 59 ');
    expect(out).not.toContain('turn 0 ');
  });

  it('clips a single huge turn instead of dropping it', () => {
    const out = renderTranscript([
      { role: 'user', content: 'y'.repeat(20000) },
    ]);
    expect(out.startsWith('User: y')).toBe(true);
    expect(out.length).toBeLessThan(5000);
  });
});

describe('parseAction', () => {
  it('reads a reply action', () => {
    expect(parseAction('{"reply":"hello there"}')).toEqual({
      kind: 'reply',
      reply: 'hello there',
    });
  });

  it('reads a tool action with args', () => {
    expect(parseAction('{"tool":"log_food","args":{"kcal":180}}')).toEqual({
      kind: 'tool',
      tool: 'log_food',
      args: { kcal: 180 },
    });
  });

  it('defaults missing args to an empty object', () => {
    expect(parseAction('{"tool":"list_food_log"}')).toEqual({
      kind: 'tool',
      tool: 'list_food_log',
      args: {},
    });
  });

  it('tolerates markdown code fences', () => {
    expect(parseAction('```json\n{"reply":"hi"}\n```')).toEqual({
      kind: 'reply',
      reply: 'hi',
    });
  });

  it('digs the action out of surrounding prose (no grammar on the OS models)', () => {
    expect(
      parseAction(
        'Sure, logging it now: {"tool":"log_food","args":{"kcal":90}} done',
      ),
    ).toEqual({ kind: 'tool', tool: 'log_food', args: { kcal: 90 } });
  });

  it('is not fooled by braces inside the reply text', () => {
    expect(parseAction('{"reply":"use {curly} braces"}')).toEqual({
      kind: 'reply',
      reply: 'use {curly} braces',
    });
  });

  /**
   * Real Gemini Nano output from a Xiaomi 17: typographic quotes and trailing
   * commas. Before the repair pass this landed in the chat as raw JSON.
   */
  it('repairs typographic quotes and trailing commas', () => {
    const raw =
      '{\n\u201Ctool\u201D: \u201Clog_food\u201D,\n\u201Cargs\u201D: {\n\u201Centries\u201D: [\n{\u201Cname\u201D: \u201CBread and butter\u201D, \u201Ckcal\u201D: 250,},\n],\n},\n}';
    expect(parseAction(raw)).toEqual({
      kind: 'tool',
      tool: 'log_food',
      args: { entries: [{ name: 'Bread and butter', kcal: 250 }] },
    });
  });

  it('keeps straight quotes inside a valid reply untouched', () => {
    expect(parseAction('{"reply":"say \\"hi\\", ok"}')).toEqual({
      kind: 'reply',
      reply: 'say "hi", ok',
    });
  });

  it('never shows an unreadable action object as raw JSON', () => {
    expect(parseAction('{"tool": "log_food", "args": {broken')).toEqual({
      kind: 'reply',
      reply: GARBLED_REPLY,
    });
  });

  it('falls back to a plain reply when the output is not a valid action', () => {
    expect(parseAction('sorry, not json')).toEqual({
      kind: 'reply',
      reply: 'sorry, not json',
    });
  });
});

describe('renderTranscript — earlier chat as background', () => {
  /** On the phone, replayed `Assistant: {"reply": …}` lines were copied as the
   * answer to a new message; earlier turns are now prose in a marked block. */
  it('shows earlier turns as background prose and only the current message live', () => {
    const out = renderTranscript(
      [
        { role: 'user', content: 'how many steps?' },
        { role: 'assistant', content: 'You walked 4,854 steps.' },
        { role: 'user', content: 'smaž ty vejce' },
      ],
      8000,
      undefined,
      2,
    );
    expect(out).toContain('EARLIER IN THIS CHAT');
    expect(out).toContain('- You answered: You walked 4,854 steps.');
    expect(out).not.toContain('{"reply":"You walked');
    expect(out.endsWith('User: smaž ty vejce\nAssistant:')).toBe(true);
  });
});

describe('parseAction — a call outside the JSON protocol', () => {
  /** Seen on the phone, twice in a row, for "smaž ty vejce". */
  it('reads a ```tool fence as a tool call', () => {
    expect(
      parseAction('```tool\ndelete_food_log\nargs: {"name": "Eggs"}\n```'),
    ).toEqual({
      kind: 'tool',
      tool: 'delete_food_log',
      args: { name: 'Eggs' },
    });
    expect(
      parseAction('```tool\ndelete_food_log\nargs:\n{\n"name": "Eggs"\n}\n```'),
    ).toEqual({
      kind: 'tool',
      tool: 'delete_food_log',
      args: { name: 'Eggs' },
    });
  });

  it('leaves prose that merely mentions a tool as a reply', () => {
    expect(parseAction('I can use log_food for that.').kind).toBe('reply');
  });
});

describe('parseAction — a reply wrapping another reply', () => {
  it('unwraps it, so the protocol never reaches the chat', () => {
    expect(
      parseAction(
        '```json\n{"reply": "```json\\n{\\"reply\\": \\"180 kcal\\"}\\n```"}\n```',
      ),
    ).toEqual({ kind: 'reply', reply: '180 kcal' });
  });
});
