import {
  buildSystemPreamble,
  formatBytes,
  GEMMA_MODELS,
  modelByLabel,
  parseAction,
  renderGemmaPrompt,
} from '../src/features/coach/ondevice/models';

const TOOLS = [
  {
    name: 'log_food',
    description: 'Log a meal.',
    parameters: { type: 'object', properties: {} },
  },
];

describe('ondevice model registry', () => {
  it('exposes Gemma tiers with unique labels and HF urls', () => {
    expect(GEMMA_MODELS.length).toBeGreaterThanOrEqual(1);
    const labels = GEMMA_MODELS.map(m => m.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const m of GEMMA_MODELS) {
      expect(m.url).toMatch(/^https:\/\/huggingface\.co\/.+\.gguf$/);
      expect(m.filename).toMatch(/\.gguf$/);
    }
    expect(modelByLabel(GEMMA_MODELS[0].label)?.id).toBe(GEMMA_MODELS[0].id);
  });

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
});

describe('renderGemmaPrompt', () => {
  it('drops a leading assistant turn, folds the preamble into the first user turn, and opens a model turn', () => {
    const out = renderGemmaPrompt('PREAMBLE', [
      { role: 'assistant', content: 'greeting' },
      { role: 'user', content: '2 eggs' },
    ]);
    // Leading assistant (Gemma must start user) is dropped, so the greeting text
    // is gone and the transcript starts with the user turn.
    expect(out.startsWith('<start_of_turn>user\n')).toBe(true);
    expect(out).not.toContain('greeting');
    expect(out).toContain('PREAMBLE');
    expect(out).toContain('2 eggs');
    expect(out.endsWith('<start_of_turn>model\n')).toBe(true);
  });

  it('merges consecutive same-role turns to keep strict alternation', () => {
    const out = renderGemmaPrompt('P', [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ]);
    expect(out).toContain('a\nb');
    // Exactly one user turn rendered (the two merged) plus the trailing model open.
    expect(out.match(/<start_of_turn>user/g)?.length).toBe(1);
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

  it('falls back to a plain reply when the output is not a valid action', () => {
    expect(parseAction('sorry, not json')).toEqual({
      kind: 'reply',
      reply: 'sorry, not json',
    });
  });
});
