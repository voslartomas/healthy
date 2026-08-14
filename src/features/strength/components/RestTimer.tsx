import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { M } from '../../../components/brief';
import { Ring } from '../../../components/Ring';
import { useStrengthStore } from '../../../state/useStrengthStore';
import {
  cancelRestOverNotification,
  scheduleRestOverNotification,
} from '../../../state/workoutNotifications';
import { useTheme } from '../../../theme/theme';
import { playRestBeep } from '../restBeep';

/**
 * Between-sets rest countdown. Drives a {@link Ring} from full to empty over
 * `seconds`, beeps once when it reaches zero, and calls `onDone`. The user can
 * add 15s or skip straight to the next set. The countdown is computed from a
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
  const t = useTheme();
  const c = t.colors;
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

  function skip() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  const progress = total > 0 ? remaining / total : 0;
  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const label = mm > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : String(ss);

  return (
    <View style={styles.wrap}>
      <Ring
        progress={progress}
        color={c.acc}
        size={168}
        strokeWidth={12}
        value={label}
        label="REST"
        valueFontSize={44}
      />
      <View style={styles.row}>
        <Pressable
          onPress={addTime}
          accessibilityRole="button"
          accessibilityLabel="Add 15 seconds"
          style={[styles.btn, { borderColor: c.hair }]}
        >
          <Text style={M(700, 12, { ls: 0.5, color: c.ink })}>+15s</Text>
        </Pressable>
        <Pressable
          onPress={skip}
          accessibilityRole="button"
          accessibilityLabel="Skip rest"
          style={[styles.btn, styles.btnFill, { backgroundColor: c.ink }]}
        >
          <Text style={M(700, 12, { ls: 1, color: c.inv })}>SKIP REST</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 20, paddingVertical: 8 },
  row: { flexDirection: 'row', gap: 12, alignSelf: 'stretch' },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnFill: { borderWidth: 0 },
});
