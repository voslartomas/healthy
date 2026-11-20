import type React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { EMPTY_SNAPSHOT } from '../src/health';
import type { HealthSnapshot } from '../src/health/types';
import type { Habit } from '../src/state/habits';
import type { JournalDay } from '../src/state/journal';
import {
  buildWidgetData,
  nextWidgetView,
  parseWidgetData,
  WidgetData,
  widgetModel,
} from '../src/widget/widgetData';
import { widgetTaskHandler } from '../src/widget/widgetTaskHandler';
// The library's own JSX → RemoteViews tree builder, so a layout the native side
// can't draw fails here rather than on a phone.
import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';

// In-memory stand-in for the widget_state table.
const mockStore = new Map<string, string>();
jest.mock('../src/db/widgetRepository', () => ({
  loadWidgetDataRaw: async () => mockStore.get('data') ?? null,
  saveWidgetDataRaw: async (v: string) => void mockStore.set('data', v),
  loadWidgetView: async (id: number) => mockStore.get(`view:${id}`) ?? null,
  saveWidgetView: async (id: number, v: string) =>
    void mockStore.set(`view:${id}`, v),
  deleteWidgetView: async (id: number) => void mockStore.delete(`view:${id}`),
}));

// The live read needs Health Connect; covered by the handler tests below via
// this mock (no background grant → nothing re-read).
const mockRefresh = jest.fn(async () => false);
jest.mock('../src/widget/widgetRefresh', () => ({
  WIDGET_REFRESH_MIN_MS: 5 * 60 * 1000,
  refreshWidgetFromHealth: () => mockRefresh(),
}));

/** 13:30 on Nov `d`, 2026. */
const at = (d: number, h = 13, m = 30) => new Date(2026, 10, d, h, m).getTime();
const day = (d: number) => new Date(2026, 10, d).getTime();

const snapshot = (over: Partial<HealthSnapshot> = {}): HealthSnapshot => ({
  ...EMPTY_SNAPSHOT,
  waterTodayMl: 1250,
  energyBurnedToday: 500,
  nutrition: {
    eaten: 1260,
    proteinG: 92.4,
    carbsG: 120,
    fatG: 40,
    meals: [
      { name: 'Oats', mealType: null, kcal: 400, time: at(20, 8) },
      { name: 'Lunch', mealType: null, kcal: 860, time: at(20, 12) },
    ],
  },
  readiness: { pct: 78, state: 'Recovered', contributors: [] },
  ...over,
});

const waterHabit: Habit = {
  id: 'h1',
  name: 'Drink 3 L',
  type: 'water',
  auto: true,
  allowance: 'never',
  targetMl: 3000,
  createdAt: 0,
};

function data(over: Partial<HealthSnapshot> = {}, journal: JournalDay[] = []) {
  return buildWidgetData({
    snapshot: snapshot(over),
    habits: [waterHabit],
    calorieGoals: [{ id: 'g', effectiveFrom: day(1), targetNet: -500 }],
    journal,
    asOf: at(20),
  });
}

describe('widget views', () => {
  it('cycles Water → Food → Recovery → Water', () => {
    expect(nextWidgetView('water')).toBe('food');
    expect(nextWidgetView('food')).toBe('recovery');
    expect(nextWidgetView('recovery')).toBe('water');
  });
});

describe('widgetModel', () => {
  it('shows water against the water habit’s target', () => {
    const m = widgetModel(data(), 'water', at(20, 14));
    expect(m).toMatchObject({
      big: '1.25',
      unit: 'of 3 L',
      sub: '1.75 L to go',
      fill: 1250 / 3000,
      glass: true,
      empty: false,
      foot: 'Updated 13:30 · tap for food',
    });
  });

  it('says nothing is logged rather than showing 0', () => {
    const m = widgetModel(data({ waterTodayMl: null }), 'water', at(20, 14));
    expect(m).toMatchObject({ big: '—', sub: 'No water logged yet' });
  });

  it('shows kcal left toward the goal allowance (burned + target net)', () => {
    // allowance = 500 burned − 500 target = 0 → 1260 over.
    expect(widgetModel(data(), 'food', at(20, 14))).toMatchObject({
      big: '1 260',
      unit: 'kcal over',
      tone: 'bad',
      sub: 'Protein 92 g · 2 meals',
    });
    const m = widgetModel(
      data({ energyBurnedToday: 2500 }),
      'food',
      at(20, 14),
    );
    expect(m).toMatchObject({ big: '740', unit: 'kcal left', tone: 'food' });
    expect(m.fill).toBeCloseTo(1260 / 2000);
  });

  it('leads recovery with a sick day from the journal', () => {
    const journal: JournalDay[] = [
      { day: day(19), tags: ['sick'], ended: [], note: '', updatedAt: 0 },
      { day: day(20), tags: ['sick'], ended: [], note: '', updatedAt: 0 },
    ];
    const m = widgetModel(data({}, journal), 'recovery', at(20, 14));
    expect(m).toMatchObject({
      big: '78',
      unit: '%',
      tone: 'bad',
      sub: 'Sick · day 2 — rest comes first',
    });
    expect(widgetModel(data(), 'recovery', at(20, 14)).sub).toBe('Recovered');
  });

  it('turns to "—" once the day rolls over, never showing yesterday as today', () => {
    const m = widgetModel(data(), 'food', at(21, 7));
    expect(m).toMatchObject({
      big: '—',
      empty: true,
      sub: 'Open Healthy to refresh today',
      foot: 'Last updated yesterday 13:30',
    });
  });

  it('asks to open the app before anything was saved', () => {
    expect(widgetModel(null, 'water', at(20))).toMatchObject({
      big: '—',
      sub: 'Open Healthy to set up',
    });
  });
});

describe('parseWidgetData', () => {
  it('round-trips and rejects junk', () => {
    const d = data();
    expect(parseWidgetData(JSON.stringify(d))).toEqual(d);
    expect(parseWidgetData('{"v":0}')).toBeNull();
    expect(parseWidgetData('not json')).toBeNull();
    expect(parseWidgetData(null)).toBeNull();
  });
});

describe('widgetTaskHandler', () => {
  const info = {
    widgetName: 'Healthy',
    widgetId: 7,
    width: 320,
    height: 150,
    screenInfo: {
      screenHeightDp: 800,
      screenWidthDp: 400,
      density: 2,
      densityDpi: 320,
      fontScale: 1,
    },
  };

  beforeEach(() => {
    mockRefresh.mockClear();
    mockRefresh.mockImplementation(async () => false);
    mockStore.clear();
    mockStore.set('data', JSON.stringify(data() satisfies WidgetData));
  });

  type Node = { props: unknown; children?: Node[] };
  function texts(tree: Node) {
    const out: string[] = [];
    const walk = (n: Node) => {
      const text = (n.props as { text?: string } | undefined)?.text;
      if (text) out.push(text);
      n.children?.forEach(walk);
    };
    walk(tree);
    return out;
  }

  type Pair = { light: React.JSX.Element; dark: React.JSX.Element };
  async function run(
    widgetAction: WidgetTaskHandlerProps['widgetAction'],
    clickAction?: string,
  ) {
    const rendered: Pair[] = [];
    await widgetTaskHandler({
      widgetInfo: info,
      widgetAction,
      clickAction,
      clickActionData: {},
      renderWidget: w => void rendered.push(w as Pair),
    });
    return rendered;
  }

  it('draws the water view when added, in light and dark', async () => {
    const [w] = await run('WIDGET_ADDED');
    const light = buildWidgetTree(w.light);
    expect(texts(light)).toEqual(
      expect.arrayContaining(['WATER', '1.25', ' of 3 L']),
    );
    expect(() => buildWidgetTree(w.dark)).not.toThrow();
  });

  it('a tap moves this widget to the next view and remembers it', async () => {
    const [food] = await run('WIDGET_CLICK', 'NEXT_VIEW');
    expect(texts(buildWidgetTree(food.light))).toContain('FOOD');
    expect(mockStore.get('view:7')).toBe('food');
    const [recovery] = await run('WIDGET_CLICK', 'NEXT_VIEW');
    expect(texts(buildWidgetTree(recovery.light))).toContain('RECOVERY');
    // A plain update keeps the view.
    const [again] = await run('WIDGET_UPDATE');
    expect(texts(buildWidgetTree(again.light))).toContain('RECOVERY');
  });

  it('reads live after drawing when what it holds is a few minutes old', async () => {
    const asOf = (ago: number) =>
      JSON.stringify({
        ...data(),
        asOf: Date.now() - ago,
      } satisfies WidgetData);
    // Fresh enough: one draw, no read.
    mockStore.set('data', asOf(60_000));
    expect(await run('WIDGET_UPDATE')).toHaveLength(1);
    expect(mockRefresh).not.toHaveBeenCalled();

    // Old: draw at once, read, then draw the new numbers.
    mockStore.set('data', asOf(10 * 60_000));
    mockRefresh.mockImplementation(async () => {
      mockStore.set(
        'data',
        JSON.stringify({
          ...data({ waterTodayMl: 2000 }),
          asOf: Date.now(),
        } satisfies WidgetData),
      );
      return true;
    });
    const draws = await run('WIDGET_UPDATE');
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(draws).toHaveLength(2);
    expect(texts(buildWidgetTree(draws[1].light))).toContain('2');
  });

  it('forgets a removed widget', async () => {
    mockStore.set('view:7', 'food');
    expect(await run('WIDGET_DELETED')).toEqual([]);
    expect(mockStore.has('view:7')).toBe(false);
  });
});
