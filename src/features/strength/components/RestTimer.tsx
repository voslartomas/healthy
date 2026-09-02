import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { M } from '../../../components/brief';
import { useStrengthStore } from '../../../state/useStrengthStore';
import {
  cancelRestOverNotification,
  scheduleRestOverNotification,
} from '../../../state/workoutNotifications';
import { useTheme } from '../../../theme/theme';
import { playRestBeep } from '../restBeep';

/**
 * Between-sets rest countdown: the design's centred REST block — eyebrow, an
 * oversized mono countdown and a thin linear bar that drains as the rest runs
 * out. Beeps once at zero and calls `onDone`. "+15S" extends; the runner owns
 * the "START NEXT SET" button that skips ahead. The countdown is computed from a
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

  // The bar fills as the rest elapses, matching the design's left-to-right run.
  const elapsed = total > 0 ? 1 - remaining / total : 1;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const label = mm > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : String(ss);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={M(700, 9, { ls: 1.6, color: c.fnt })}>REST</Text>
        <Pressable
          onPress={addTime}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds"
          hitSlop={10}
          style={styles.add}
        >
          <Text style={M(700, 9, { ls: 1.6, color: c.acc })}>+15S</Text>
        </Pressable>
      </View>
      <Text
        style={[M(700, 72, { lh: 76, ls: -1.2, color: c.ink }), styles.big]}
      >
        {label}
      </Text>
      <View style={[styles.track, { backgroundColor: c.track }]}>
        <View
          style={{
            width: `${Math.max(0, Math.min(1, elapsed)) * 100}%`,
            height: '100%',
            backgroundColor: c.accSolid,
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  add: { position: 'absolute', right: 0 },
  big: { textAlign: 'center', marginTop: 10 },
  track: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 14,
  },
});
