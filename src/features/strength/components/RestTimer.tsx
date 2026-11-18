import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { S } from '../../../components/brief';
import { useStrengthStore } from '../../../state/useStrengthStore';
import {
  cancelRestOverNotification,
  scheduleRestOverNotification,
} from '../../../state/workoutNotifications';
import { useTheme } from '../../../theme/theme';
import { playRestBeep } from '../restBeep';

/**
 * Between-sets rest countdown (ADR-007 "Rest" artboard): a water-blue dial that
 * drains as the rest runs out, with REST and the m:ss countdown in its middle,
 * and a "+15 seconds" pill under it. Beeps once at zero and calls `onDone`. The
 * runner owns the surrounding sky-tinted panel and the "Start next set" button
 * that skips ahead. The dial's track is the card colour because it sits on that
 * tinted panel. The countdown is computed from a
 * target end-time (set in an effect, not during render) so it stays accurate
 * across a dropped frame or a brief background.
 *
 * The runner remounts this per rest (via a `key`), so it initialises cleanly
 * from props each time and never needs to reset state in an effect.
 */
export function RestTimer({
  seconds,
  onDone,
}: {
  seconds: number;
  onDone: () => void;
}) {
  const c = useTheme().colors;
  const extendRest = useStrengthStore(s => s.extendRest);
  const [total, setTotal] = useState(seconds);
  const [remaining, setRemaining] = useState(seconds);
  // Target end-time in epoch ms; established in the effect below (never reads the
  // clock during render). null until the first tick sets it up.
  const endRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    endRef.current = Date.now() + seconds * 1000;
    const id = setInterval(() => {
      const end = endRef.current ?? Date.now();
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !doneRef.current) {
        doneRef.current = true;
        clearInterval(id);
        playRestBeep();
        onDone();
      }
    }, 250);
    return () => clearInterval(id);
    // `onDone` is a stable zustand action; the timer is also key-remounted per
    // rest, so `seconds` alone captures every restart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  // The interval above is frozen while the app is backgrounded, so it can't beep
  // on time if the user leaves mid-rest. Cover that with an OS notification
  // (sound): schedule it for the rest end-time when we background, and cancel it
  // when we return, skip, or unmount (so it never fires while we're in the app).
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next === 'background' && endRef.current != null && !doneRef.current) {
        void scheduleRestOverNotification(endRef.current).catch(() => {});
      } else if (next === 'active') {
        void cancelRestOverNotification().catch(() => {});
      }
    });
    return () => {
      sub.remove();
      void cancelRestOverNotification().catch(() => {});
    };
  }, []);

  function addTime() {
    if (endRef.current == null) return;
    endRef.current += 15_000;
    extendRest(15_000); // keep the notification countdown in sync
    setTotal(x => x + 15);
    setRemaining(Math.max(0, Math.ceil((endRef.current - Date.now()) / 1000)));
  }

  // The ring drains as the rest runs out (full at the start, empty at zero),
  // like the design's countdown dial.
  const left = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const label = `${mm}:${String(ss).padStart(2, '0')}`;
  const r = (RING - RING_STROKE) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <View style={styles.wrap}>
      <View style={styles.ring}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={c.card}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          {left > 0 ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={c.water}
              strokeWidth={RING_STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circ * left} ${circ}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          ) : null}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
          <Text style={S(900, 14, { color: c.waterText })}>REST</Text>
          <Text style={S(900, 60, { lh: 64, color: c.ink })}>{label}</Text>
        </View>
      </View>
      <Pressable
        onPress={addTime}
        accessibilityRole="button"
        accessibilityLabel="Add 15 seconds"
        style={[styles.add, { backgroundColor: c.card, borderColor: c.hair }]}
      >
        <Text style={S(900, 16, { color: c.waterText })}>+15 seconds</Text>
      </Pressable>
    </View>
  );
}

/** Dial size and stroke — the design's 240px ring. */
const RING = 240;
const RING_STROKE = 18;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 18 },
  ring: { width: RING, height: RING },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
  add: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 2,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
