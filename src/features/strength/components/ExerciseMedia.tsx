import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { exerciseOrUnknown, MUSCLE_LABELS } from '../../../data/exerciseCatalog';
import { M } from '../../../components/brief';
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
 * A future video/Rive upgrade is just a third branch here.
 */

/**
 * Bundled start/end pose pairs, keyed by exercise id (an entry's `mediaKey`
 * overrides the id when set). Generated from the CC0 free-exercise-db and
 * downscaled under assets/exercises — see frames.generated.ts and
 * scripts/gen_catalog.py.
 */
export const FRAMES = GENERATED_FRAMES;

export function ExerciseMedia({
  exerciseId,
  playing = true,
  height = 168,
}: {
  exerciseId: string;
  /** Pause the loop (e.g. while resting) to save a little battery. */
  playing?: boolean;
  height?: number;
}) {
  const t = useTheme();
  const c = t.colors;
  const def = exerciseOrUnknown(exerciseId);
  const frames = FRAMES[def.mediaKey ?? exerciseId];

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

  return (
    <View
      style={[styles.panel, { height, backgroundColor: c.track, borderColor: c.hair }]}
      accessibilityRole="image"
      accessibilityLabel={`${def.name} demonstration`}
    >
      {frames ? (
        <>
          <Animated.Image
            testID="exercise-frame"
            source={frames[0]}
            resizeMode="contain"
            style={[styles.frame, { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
          />
          <Animated.Image
            source={frames[1]}
            resizeMode="contain"
            style={[styles.frame, { opacity: anim }]}
          />
        </>
      ) : (
        <Placeholder anim={anim} color={c.acc} faint={c.fnt} />
      )}
      <View style={styles.badge}>
        <Text style={M(700, 9, { ls: 1.4, color: c.fnt })}>
          {MUSCLE_LABELS[def.muscleGroup].toUpperCase()}
        </Text>
      </View>
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
        <Line x1={30} y1={36} x2={90} y2={36} stroke={color} strokeWidth={5} strokeLinecap="round" />
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
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 4,
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
  badge: { position: 'absolute', top: 10, left: 12 },
});
