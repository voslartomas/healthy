import { AppState, Platform } from 'react-native';

import {
  markBackgroundReadAsked,
  saveWidgetDataRaw,
  wasBackgroundReadAsked,
} from '../db/widgetRepository';
import {
  canReadHealthInBackground,
  isHealthSourceConnected,
  requestHealthBackgroundRead,
} from '../health';
import { useCalorieGoalsStore } from '../state/useCalorieGoalsStore';
import { useHabitsStore } from '../state/useHabitsStore';
import { useHealthStore } from '../state/useHealthStore';
import { useJournalStore } from '../state/useJournalStore';
import { buildWidgetData } from './widgetData';

/**
 * Keeps the Android widget current from inside the app (ADR-010).
 *
 * Whenever a LIVE health read lands (`freshAt`), or the journal, the water
 * habit or the calorie goal changes, it saves a fresh {@link WidgetData} and
 * asks every placed widget to redraw. A snapshot painted from yesterday's
 * SQLite cache is never written: the widget would show it as today's.
 *
 * Writes are debounced — a refresh touches several stores in quick
 * succession, and each write wakes the launcher.
 */

const DEBOUNCE_MS = 800;

/** The JSON last written, so an unchanged summary doesn't redraw. */
let lastJson: string | null = null;

/**
 * Once a widget is on the home screen, ask (once) for Health Connect's
 * background-read grant, so the widget can read today's numbers itself with
 * the app closed (widgetRefresh). Only from the foreground — the permission
 * sheet needs an activity — and only once: a "no" is respected, and the
 * widget then shows what the app last read.
 */
async function askForBackgroundRead(): Promise<void> {
  if (AppState.currentState !== 'active') return;
  if (await wasBackgroundReadAsked()) return;
  const { getWidgetInfo } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
    require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { WIDGET_NAME } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
    require('./HealthyWidget') as typeof import('./HealthyWidget');
  if ((await getWidgetInfo(WIDGET_NAME)).length === 0) return;
  if (!(await isHealthSourceConnected())) return;
  if (await canReadHealthInBackground()) return;
  await markBackgroundReadAsked();
  await requestHealthBackgroundRead();
}

async function push(): Promise<void> {
  const health = useHealthStore.getState();
  if (health.freshAt == null) return;
  const json = JSON.stringify(
    buildWidgetData({
      snapshot: health.snapshot,
      habits: useHabitsStore.getState().habits,
      calorieGoals: useCalorieGoalsStore.getState().goals,
      journal: useJournalStore.getState().entries,
      asOf: health.freshAt,
    }),
  );
  if (json === lastJson) return;
  await saveWidgetDataRaw(json);
  lastJson = json;
  // Lazy: the native module only exists in Android builds.
  const { requestWidgetUpdate } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
    require('react-native-android-widget') as typeof import('react-native-android-widget');
  const { renderForWidget } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
    require('./widgetTaskHandler') as typeof import('./widgetTaskHandler');
  const { WIDGET_NAME } =
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native load (Android only)
    require('./HealthyWidget') as typeof import('./HealthyWidget');
  await requestWidgetUpdate({
    widgetName: WIDGET_NAME,
    renderWidget: info => renderForWidget(info.widgetId),
  });
}

/** Start syncing; returns the unsubscribe. A no-op off Android. */
export function startWidgetSync(): () => void {
  if (Platform.OS !== 'android') return () => {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void push()
        .then(askForBackgroundRead)
        .catch(err => console.warn('Failed to update widget', err));
    }, DEBOUNCE_MS);
  };
  const unsubs = [
    useHealthStore.subscribe((s, prev) => {
      if (s.freshAt !== prev.freshAt || s.snapshot !== prev.snapshot) {
        schedule();
      }
    }),
    useHabitsStore.subscribe((s, prev) => {
      if (s.habits !== prev.habits) schedule();
    }),
    useCalorieGoalsStore.subscribe((s, prev) => {
      if (s.goals !== prev.goals) schedule();
    }),
    useJournalStore.subscribe((s, prev) => {
      if (s.entries !== prev.entries) schedule();
    }),
  ];
  schedule();
  return () => {
    if (timer) clearTimeout(timer);
    unsubs.forEach(u => u());
  };
}
