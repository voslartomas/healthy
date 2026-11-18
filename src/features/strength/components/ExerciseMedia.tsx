import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { S } from '../../../components/brief';
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
 * The Lift screens (ADR-007) use three shapes of the same surface, chosen with
 * `variant`, all on the lift tint so a photo or placeholder reads as part of
 * the violet "lift" area rather than a grey hole:
 *  - `hero`   — the big rounded block at the top of the runner, with a white
 *               caption pill in its bottom-left corner.
 *  - `panel`  — a smaller rounded block for use inside a padded card.
 *  - `thumb`  — a square list tile (the design's 52–64 px icon tiles).
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
  /** Caption pill shown over hero/panel media ("Form loop · chest"). Defaults
   * to the exercise's muscle group; pass `''` to hide it. */
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

  // Thumbs round at roughly a quarter of their side (16px at 64) like the
  // design's icon tiles; the hero is the runner's 24px block.
  const shape: ViewStyle = isThumb
    ? { width: height, height, borderRadius: Math.round(height / 4) }
    : variant === 'hero'
      ? { width: '100%', height, borderRadius: 24 }
      : { width: '100%', height, borderRadius: 20 };

  const caption = sub ?? MUSCLE_LABELS[def.muscleGroup];

  return (
    <View
      style={[styles.panel, shape, { backgroundColor: c.liftTint }, style]}
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
        <Text
          style={S(900, Math.max(14, height * 0.32), { color: c.liftText })}
        >
          {MUSCLE_LABELS[def.muscleGroup][0]}
        </Text>
      ) : (
        <Placeholder anim={anim} color={c.lift} faint={c.liftEdge} />
      )}
      {!isThumb && caption ? (
        <View style={[styles.badge, { backgroundColor: c.card }]}>
          <Text style={S(900, 13, { color: c.liftText })}>{caption}</Text>
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
  // A caption pill over the animation: lift-violet text on an opaque card-
  // coloured pill, so it stays legible over both the light exercise photos and
  // the tinted placeholder in either scheme.
  badge: {
    position: 'absolute',
    left: 14,
    bottom: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
});
