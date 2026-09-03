import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { M } from '../../../components/brief';
import {
  exerciseOrUnknown,
  MUSCLE_LABELS,
} from '../../../data/exerciseCatalog';
import { useTheme } from '../../../theme/theme';
import { GENERATED_FRAMES } from './frames.generated';

/**
 * The exercise "animation" surface, and the single seam where richer media can
 * be swapped in later without touching any screen.
 *
 * Two render paths:
 *  1. If the exercise resolves in {@link FRAMES} (bundled free-exercise-db
 *     start/end photos, keyed by id or an explicit `mediaKey`), the two frames
 *     are crossfaded on a loop — a simple, offline, license-free "animation".
 *  2. Otherwise a themed placeholder plays: an SVG dumbbell tracing the rep path
 *     (translateY loop) so every exercise shows motion even without bundled
 *     photos.
 *
 * The v3 Lift screens use three shapes of the same surface, chosen with
 * `variant`:
 *  - `hero`   — full-bleed banner at the top of a `flush` card (no border/radius
 *               of its own; the card clips it), with a mono caption overlay.
 *  - `panel`  — the standalone rounded block used inside a padded card.
 *  - `thumb`  — a square list thumbnail (62 / 76 / 64 / 56 px in the design).
 *
 * A future video/Rive upgrade is just a third branch in the render paths.
 */

/**
 * Bundled start/end pose pairs, keyed by exercise id (an entry's `mediaKey`
 * overrides the id when set). Generated from the CC0 free-exercise-db and
 * downscaled under assets/exercises — see frames.generated.ts and
 * scripts/gen_catalog.py.
 */
export const FRAMES = GENERATED_FRAMES;

export type MediaVariant = 'hero' | 'panel' | 'thumb';

export function ExerciseMedia({
  exerciseId,
  playing = true,
  height = 168,
  variant = 'panel',
  sub,
  style,
}: {
  exerciseId: string;
  /** Pause the loop (e.g. while resting) to save a little battery. */
  playing?: boolean;
  /** Height for hero/panel; also the side length for a `thumb`. */
  height?: number;
  variant?: MediaVariant;
  /** Mono caption shown over hero/panel media ("LOOP · FORM"). Defaults to the
   * exercise's muscle group; pass `''` to hide it. */
  sub?: string;
  style?: ViewStyle;
}) {
  const c = useTheme().colors;
  const def = exerciseOrUnknown(exerciseId);
  const frames = FRAMES[def.mediaKey ?? exerciseId];
  const isThumb = variant === 'thumb';

  // A single 0→1→0 driver powers both the image crossfade and the placeholder
  // motion. useNativeDriver keeps it off the JS thread.
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!playing) {
      anim.stopAnimation();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, playing, exerciseId]);

  const shape: ViewStyle = isThumb
    ? { width: height, height, borderRadius: 8, borderWidth: 1 }
    : variant === 'hero'
      ? { width: '100%', height, borderRadius: 0, borderWidth: 0 }
      : { width: '100%', height, borderRadius: 12, borderWidth: 1 };

  const caption = sub ?? MUSCLE_LABELS[def.muscleGroup].toUpperCase();

  return (
    <View
      style={[
        styles.panel,
        shape,
        { backgroundColor: c.track, borderColor: c.hair },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={`${def.name} demonstration`}
    >
      {frames ? (
        <>
          <Animated.Image
            testID="exercise-frame"
            source={frames[0]}
            resizeMode={isThumb ? 'cover' : 'contain'}
            accessibilityIgnoresInvertColors
            style={[
              styles.frame,
              {
                opacity: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 0],
                }),
              },
            ]}
          />
          <Animated.Image
            source={frames[1]}
            resizeMode={isThumb ? 'cover' : 'contain'}
            accessibilityIgnoresInvertColors
            style={[styles.frame, { opacity: anim }]}
          />
        </>
      ) : isThumb ? (
        <Text style={M(700, 13, { color: c.fnt })}>
          {MUSCLE_LABELS[def.muscleGroup][0]}
        </Text>
      ) : (
        <Placeholder anim={anim} color={c.acc} faint={c.fnt} />
      )}
      {!isThumb && caption ? (
        <View style={styles.badge}>
          <Text style={M(700, 9, { ls: 1.4, color: '#FFFFFF' })}>{caption}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The generic animated figure: a dumbbell tracing a short vertical rep path. */
function Placeholder({
  anim,
  color,
  faint,
}: {
  anim: Animated.Value;
  color: string;
  faint: string;
}) {
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [18, -18],
  });
  return (
    <Animated.View style={{ transform: [{ translateY }] }}>
      <Svg width={120} height={72} viewBox="0 0 120 72">
        {/* bar */}
        <Line
          x1={30}
          y1={36}
          x2={90}
          y2={36}
          stroke={color}
          strokeWidth={5}
          strokeLinecap="round"
        />
        {/* left plates */}
        <Rect x={18} y={20} width={10} height={32} rx={3} fill={color} />
        <Circle cx={30} cy={36} r={10} fill={faint} />
        {/* right plates */}
        <Rect x={92} y={20} width={10} height={32} rx={3} fill={color} />
        <Circle cx={90} cy={36} r={10} fill={faint} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  frame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  // A caption pill over the animation: white text on a translucent brand-blue
  // fill (#336699) so it stays legible against the light/dark exercise frames.
  badge: {
    position: 'absolute',
    top: 10,
    left: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(51,102,153,0.85)',
  },
});
