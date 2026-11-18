import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BriefButton, chunky, S } from '../../components/brief';
import { Slider } from '../../components/Slider';
import {
  portionConfig,
  portionLabel,
  scaleEntry,
  ScaledEntry,
} from '../../state/portion';
import { CommonFood } from '../../state/useCommonFoodsStore';
import { useTheme } from '../../theme/theme';
import { CloseButton, formStyles } from './foodFormParts';

/**
 * Portion picker for a common food: drag to set how much, see the scaled
 * kcal/macros live, then confirm. `onConfirm` receives the scaled entry (name
 * annotated with the portion); the caller decides where it goes — logged
 * immediately (Food) or added to a meal draft (MealLogger).
 *
 * Drawn to the friendly Portion artboard (ADR-007): the food's name with a
 * round close button, the amount as one oversized number with a kcal pill, the
 * slider in food orange, the three macros as soft chips, and an orange slab to
 * confirm. The artboard shows it as a bottom sheet over a dimmed screen; here it
 * stays an inline card where it was opened (no new route or modal), so the
 * flows that host it keep working unchanged.
 */
export function PortionSheet({
  food,
  actionLabel,
  onConfirm,
  onCancel,
}: {
  food: CommonFood;
  /** Sentence-case verb for the confirm button ("Log", "Add to meal"). */
  actionLabel: string;
  onConfirm: (entry: ScaledEntry) => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  const c = t.colors;
  const cfg = React.useMemo(() => portionConfig(food), [food]);
  const [amount, setAmount] = React.useState(cfg.default);
  const scaled = scaleEntry(food, cfg, amount);

  const macros = [
    { label: 'PROTEIN', g: scaled.proteinG },
    { label: 'CARBS', g: scaled.carbsG },
    { label: 'FAT', g: scaled.fatG },
  ];
  const noMacros = macros.every(m => m.g == null);

  return (
    <View style={[chunky(c), styles.sheet]}>
      <View style={formStyles.head}>
        <Text
          numberOfLines={1}
          style={[S(900, 22, { lh: 28, color: c.ink }), styles.title]}
        >
          {food.name}
        </Text>
        <CloseButton onPress={onCancel} accessibilityLabel="Cancel" />
      </View>

      <View style={styles.amount}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={S(900, 48, { lh: 56, color: c.ink })}
        >
          {portionLabel(cfg, amount)}
        </Text>
        <View style={[styles.kcalPill, { backgroundColor: c.foodTint }]}>
          <Text
            style={S(900, 17, { color: c.foodText })}
          >{`${scaled.kcal} kcal`}</Text>
        </View>
      </View>

      <View style={styles.sliderGroup}>
        <Text style={S(800, 14, { color: c.mut })}>
          Drag to change the amount
        </Text>
        <Slider
          min={cfg.min}
          max={cfg.max}
          step={cfg.step}
          value={amount}
          onChange={setAmount}
          fill={c.food}
          track={c.foodTint}
          thumb={c.card}
        />
      </View>

      <View style={styles.chips}>
        {macros.map(m => (
          <View
            key={m.label}
            style={[styles.chip, { backgroundColor: c.soft }]}
          >
            <Text style={S(800, 12, { color: c.fnt })}>{m.label}</Text>
            <Text style={S(900, 18, { color: c.ink })}>
              {m.g != null ? `${m.g} g` : '—'}
            </Text>
          </View>
        ))}
      </View>
      {noMacros ? (
        <Text style={[S(700, 13, { color: c.fnt }), styles.noMacros]}>
          No macros saved for this food
        </Text>
      ) : null}

      <BriefButton
        label={`${actionLabel} · ${scaled.kcal} kcal`}
        accessibilityLabel={`${actionLabel} ${scaled.name}`}
        onPress={() => onConfirm(scaled)}
        tone="food"
        fontSize={18}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginTop: 14,
    paddingTop: 14,
    paddingBottom: 18,
    paddingHorizontal: 18,
    gap: 16,
  },
  title: { flex: 1, minWidth: 0 },
  amount: { alignItems: 'center', gap: 4 },
  kcalPill: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  sliderGroup: { gap: 4 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    borderRadius: 14,
    alignItems: 'center',
  },
  noMacros: { marginTop: -8, textAlign: 'center' },
});
