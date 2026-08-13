import { CommonFood } from './useCommonFoodsStore';

/**
 * Portion scaling for common foods. A saved food's kcal/macros describe one
 * reference portion (`servingSize` of `servingUnit`, e.g. 100 g or 1 piece).
 * When logging, the user drags a slider to pick an amount and every value is
 * scaled by `amount / base`. Foods without a serving unit fall back to a plain
 * multiplier ("× servings"). These helpers are pure so they unit-test without a
 * database or React.
 */

export interface PortionConfig {
  /** 'amount' = concrete units (g/ml/piece); 'mult' = servings multiplier. */
  kind: 'amount' | 'mult';
  /** Display unit ('g', 'ml', 'piece', 'serving'). */
  unit: string;
  /** The amount the stored kcal/macros correspond to; scaling divides by this. */
  base: number;
  min: number;
  max: number;
  step: number;
  /** Initial slider amount (one reference portion). */
  default: number;
}

export interface ScaledEntry {
  name: string;
  kcal: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

const WEIGHT_UNITS = new Set(['g', 'ml']);

/** Derive slider bounds + step for a food from its serving unit/size. */
export function portionConfig(food: CommonFood): PortionConfig {
  const unit = food.servingUnit?.trim().toLowerCase() || null;
  const rawBase = food.servingSize;
  const base = rawBase != null && rawBase > 0 ? rawBase : 1;

  // No/blank unit → treat the stored values as one serving; slider is a plain
  // 0.25×–4× multiplier so legacy favourites still scale.
  if (!unit || unit === 'serving' || unit === 'servings') {
    return {
      kind: 'mult',
      unit: 'serving',
      base: 1,
      min: 0.25,
      max: 4,
      step: 0.25,
      default: 1,
    };
  }

  // Continuous weight/volume: step ≈ 5% of the reference, ranging up to 4×.
  if (WEIGHT_UNITS.has(unit)) {
    const step = Math.max(1, Math.round(base / 20));
    return { kind: 'amount', unit, base, min: step, max: base * 4, step, default: base };
  }

  // Discrete count (piece, slice, …): half-unit granularity.
  return {
    kind: 'amount',
    unit,
    base,
    min: 0.5,
    max: Math.max(6, base * 4),
    step: 0.5,
    default: base,
  };
}

/** Integer when whole, otherwise one decimal (e.g. 150, 1.5). */
export function niceNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pluralUnit(unit: string, amount: number): string {
  if (WEIGHT_UNITS.has(unit)) return unit;
  return amount === 1 ? unit : `${unit}s`;
}

/** Human label for a chosen amount, e.g. "150 g", "2 pieces", "1.5×". */
export function portionLabel(cfg: PortionConfig, amount: number): string {
  if (cfg.kind === 'mult') return `${niceNum(amount)}×`;
  return `${niceNum(amount)} ${pluralUnit(cfg.unit, amount)}`;
}

/**
 * Scale a food to `amount` (in the config's unit), rounding kcal + each present
 * macro. The returned name is annotated with the portion when that adds info
 * (always for unit amounts; for a bare multiplier only when it isn't 1×).
 */
export function scaleEntry(
  food: CommonFood,
  cfg: PortionConfig,
  amount: number,
): ScaledEntry {
  const factor = cfg.base > 0 ? amount / cfg.base : amount;
  const r = (v: number) => Math.round(v);
  const entry: ScaledEntry = { name: food.name, kcal: r(food.kcal * factor) };
  if (food.proteinG != null) entry.proteinG = r(food.proteinG * factor);
  if (food.carbsG != null) entry.carbsG = r(food.carbsG * factor);
  if (food.fatG != null) entry.fatG = r(food.fatG * factor);
  const annotate = cfg.kind === 'amount' || amount !== 1;
  entry.name = annotate ? `${food.name} (${portionLabel(cfg, amount)})` : food.name;
  return entry;
}
