import {
  portionConfig,
  portionLabel,
  scaleEntry,
} from '../src/state/portion';
import { CommonFood } from '../src/state/useCommonFoodsStore';

function food(over: Partial<CommonFood>): CommonFood {
  return { id: 'f1', name: 'Oatmeal', kcal: 200, ...over };
}

describe('portionConfig', () => {
  it('builds a weight config from a gram serving', () => {
    const cfg = portionConfig(food({ servingSize: 100, servingUnit: 'g' }));
    expect(cfg).toMatchObject({
      kind: 'amount',
      unit: 'g',
      base: 100,
      min: 5,
      max: 400,
      step: 5,
      default: 100,
    });
  });

  it('uses half-unit steps for a discrete piece serving', () => {
    const cfg = portionConfig(food({ servingSize: 1, servingUnit: 'piece' }));
    expect(cfg).toMatchObject({
      kind: 'amount',
      unit: 'piece',
      min: 0.5,
      max: 6,
      step: 0.5,
      default: 1,
    });
  });

  it('falls back to a 0.25–4× multiplier when no unit is set', () => {
    const cfg = portionConfig(food({}));
    expect(cfg).toMatchObject({
      kind: 'mult',
      base: 1,
      min: 0.25,
      max: 4,
      step: 0.25,
      default: 1,
    });
  });
});

describe('scaleEntry', () => {
  it('scales kcal + macros and annotates the name for unit amounts', () => {
    const f = food({
      kcal: 200,
      proteinG: 10,
      carbsG: 30,
      fatG: 4,
      servingSize: 100,
      servingUnit: 'g',
    });
    const cfg = portionConfig(f);
    const scaled = scaleEntry(f, cfg, 150);
    expect(scaled).toEqual({
      name: 'Oatmeal (150 g)',
      kcal: 300,
      proteinG: 15,
      carbsG: 45,
      fatG: 6,
    });
  });

  it('omits missing macros', () => {
    const f = food({ kcal: 90, servingSize: 1, servingUnit: 'piece' });
    const scaled = scaleEntry(f, portionConfig(f), 2);
    expect(scaled).toEqual({ name: 'Oatmeal (2 pieces)', kcal: 180 });
  });

  it('leaves a 1× multiplier name unannotated but annotates other multiples', () => {
    const f = food({ kcal: 200 });
    const cfg = portionConfig(f);
    expect(scaleEntry(f, cfg, 1).name).toBe('Oatmeal');
    const doubled = scaleEntry(f, cfg, 2);
    expect(doubled.name).toBe('Oatmeal (2×)');
    expect(doubled.kcal).toBe(400);
  });
});

describe('portionLabel', () => {
  it('formats units and multipliers', () => {
    const gram = portionConfig(food({ servingSize: 100, servingUnit: 'g' }));
    expect(portionLabel(gram, 150)).toBe('150 g');
    const piece = portionConfig(food({ servingSize: 1, servingUnit: 'piece' }));
    expect(portionLabel(piece, 1)).toBe('1 piece');
    expect(portionLabel(piece, 2.5)).toBe('2.5 pieces');
    const mult = portionConfig(food({}));
    expect(portionLabel(mult, 1.5)).toBe('1.5×');
  });
});
