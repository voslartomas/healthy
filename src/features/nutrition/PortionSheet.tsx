import React from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { M, S } from '../../components/brief';
import {
  portionConfig,
  portionLabel,
  scaleEntry,
  ScaledEntry,
} from '../../state/portion';
import { CommonFood } from '../../state/useCommonFoodsStore';
import { useTheme } from '../../theme/theme';

const THUMB = 22;

/**
 * A dependency-free horizontal slider built on PanResponder (the app ships no
 * native slider). Reports quantized values in [min, max]; children are
 * `pointerEvents="none"` so every touch resolves against the track, keeping
 * `locationX` relative to it.
 */
function Slider({
  min,
  max,
  step,
  value,
  onChange,
  fill,
  track,
  thumb,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  fill: string;
  track: string;
  thumb: string;
}) {
  // Width lives in state (not a ref) so the memoized responder recloses over it
  // — accessing refs during render is disallowed by the React Compiler.
  const [width, setWidth] = React.useState(0);

  const pan = React.useMemo(() => {
    const quantize = (raw: number) => {
      const clamped = Math.min(max, Math.max(min, raw));
      const stepped = Math.round((clamped - min) / step) * step + min;
      return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
    };
    const setFromX = (x: number) => {
      if (width <= 0) return;
      const ratio = Math.min(1, Math.max(0, x / width));
      onChange(quantize(min + ratio * (max - min)));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: e => setFromX(e.nativeEvent.locationX),
    });
  }, [min, max, step, onChange, width]);

  const ratio = max > min ? (value - min) / (max - min) : 0;
  return (
    <View
      {...pan.panHandlers}
      onLayout={e => setWidth(e.nativeEvent.layout.width)}
      style={styles.sliderHit}
      accessibilityRole="adjustable"
      accessibilityValue={{ min, max, now: value }}
    >
      <View
        pointerEvents="none"
        style={[styles.track, { backgroundColor: track }]}
      >
        <View
          style={[
            styles.trackFill,
            { width: `${ratio * 100}%`, backgroundColor: fill },
          ]}
        />
      </View>
      <View
        pointerEvents="none"
        style={[
          styles.thumb,
          {
            left: `${ratio * 100}%`,
            backgroundColor: thumb,
            borderColor: fill,
          },
        ]}
      />
    </View>
  );
}

/**
 * Portion picker for a common food: drag to set how much, see the scaled
 * kcal/macros live, then confirm. `onConfirm` receives the scaled entry (name
 * annotated with the portion); the caller decides where it goes — logged
 * immediately (Fuel) or added to a meal draft (MealLogger).
 */
export function PortionSheet({
  food,
  actionLabel,
  onConfirm,
  onCancel,
}: {
  food: CommonFood;
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
    scaled.proteinG != null ? `${scaled.proteinG}P` : null,
    scaled.carbsG != null ? `${scaled.carbsG}C` : null,
    scaled.fatG != null ? `${scaled.fatG}F` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.sheet, { borderColor: c.hair }]}>
      <View style={styles.head}>
        <Text
          numberOfLines={1}
          style={[S(700, 14, { color: c.ink }), styles.title]}
        >
          {food.name}
        </Text>
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          hitSlop={8}
        >
          <Text style={M(700, 15, { color: c.fnt })}>×</Text>
        </Pressable>
      </View>

      <View style={styles.amountRow}>
        <Text style={M(700, 30, { color: c.ink })}>
          {portionLabel(cfg, amount)}
        </Text>
        <Text
          style={M(700, 12, { color: c.acc })}
        >{`${scaled.kcal} KCAL`}</Text>
      </View>

      <Slider
        min={cfg.min}
        max={cfg.max}
        step={cfg.step}
        value={amount}
        onChange={setAmount}
        fill={c.ink}
        track={c.hair}
        thumb={c.bg}
      />

      <Text style={[M(600, 10.5, { ls: 0.6, color: c.fnt }), styles.macros]}>
        {macros ? macros : 'NO MACROS SAVED'}
      </Text>

      <Pressable
        onPress={() => onConfirm(scaled)}
        accessibilityRole="button"
        accessibilityLabel={`${actionLabel} ${scaled.name}`}
        style={[styles.confirm, { backgroundColor: c.accSolid }]}
      >
        <Text style={M(700, 12, { ls: 0.6, color: c.onAccent })}>
          {`${actionLabel}  ·  ${scaled.kcal} KCAL`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    marginTop: 14,
    padding: 14,
    borderWidth: 1,
    borderRadius: 14,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, minWidth: 0 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  macros: { marginTop: -2 },
  sliderHit: {
    height: THUMB + 12,
    justifyContent: 'center',
  },
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 999 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
    marginLeft: -THUMB / 2,
  },
  confirm: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
