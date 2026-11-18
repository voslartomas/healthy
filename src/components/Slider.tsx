import React from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

/** Slider thumb diameter — big enough to grab (the track's hit area is taller). */
const THUMB = 28;

/**
 * A dependency-free horizontal slider built on PanResponder (the app ships no
 * native slider). Shared by the portion picker and the food editor. Reports quantized values in [min, max]; children are
 * `pointerEvents="none"` so every touch resolves against the track, keeping
 * `locationX` relative to it.
 */
export function Slider({
  min,
  max,
  step,
  value,
  onChange,
  fill,
  track,
  thumb,
  accessibilityLabel,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  fill: string;
  track: string;
  thumb: string;
  accessibilityLabel?: string;
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
      accessibilityLabel={accessibilityLabel}
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

const styles = StyleSheet.create({
  sliderHit: {
    height: THUMB + 16,
    justifyContent: 'center',
  },
  track: { height: 10, borderRadius: 999, overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 999 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 4,
    marginLeft: -THUMB / 2,
  },
});
