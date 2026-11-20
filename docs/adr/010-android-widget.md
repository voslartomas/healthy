# ADR-010: Android home-screen widget

**Status:** Current

## Context

The user wants today's progress — water, food, recovery — on the home screen
without opening the app, and to switch between those views by tapping.

## Decision

- **Library: `react-native-android-widget`** (config plugin, CNG-safe). The
  widget is JSX rendered to native RemoteViews from a headless JS task, so a
  tap can run our code and redraw. `expo-widgets` was considered: on Android it
  only takes snapshots pushed from a running app; tap-to-run-JS is iOS-only.
- **One 4×2 widget, three views**: Water → Food → Recovery. A tap anywhere
  advances the view (`NEXT_VIEW`); the round arrow opens the app
  (`OPEN_APP`). The view is remembered per placed widget (`view:<widgetId>`).
- **Live data via Health Connect's background read.** The widget's task often
  runs with the app closed, and Health Connect refuses background reads
  unless the app holds `READ_HEALTH_DATA_IN_BACKGROUND` (Android 14+ / a
  recent Health Connect). With that grant the task does the app's own light
  read → splice onto the SQLite deep-history cache → derive
  (`src/widget/widgetRefresh.ts`, sharing `spliceRecent` with the store), so
  the widget and the app show identical numbers. It draws what it holds first
  (a tap switches views instantly), then re-reads when that is over 5 minutes
  old and draws again. The 30-minute `updatePeriodMillis` tick keeps it live
  without a tap.
- **The grant is asked once, and only when a widget is placed** (from the app,
  in the foreground; `widgetSync.askForBackgroundRead`). It is requested on its
  own, never bundled into the connect sheet, so a Health Connect without the
  feature can't take the core read grants down with it.
- **Without the grant, never read.** A refused background read comes back
  empty per record type, indistinguishable from "nothing logged" — so the task
  doesn't read, and the widget shows the summary the app last wrote
  (`WidgetData` in SQLite `widget_state`, written after every live read in the
  app and on journal / water habit / calorie goal changes, `widgetSync.ts`).
  Nothing leaves the device either way.
- **Never stale as if current.** The summary carries `asOf`; once the local
  day has turned over without a new read, the widget shows "—" and "Open
  Healthy to refresh today" instead of yesterday's numbers.
- Wording and maths are pure (`src/widget/widgetData.ts`) and tested; the
  layout is tested through the library's own tree builder.
- `widget_state` is derived, per-device state and is **not** backed up.

## Consequences

- One more native dependency (no network, no analytics).
- Play Console: the Health Connect declaration must list background access
  (READ_HEALTH_DATA_IN_BACKGROUND) with the widget as its justification.
- Without the grant (declined, or an older phone) the widget is only as fresh
  as the app's last read; it says so ("Updated 13:31").
- iOS has no widget yet; WidgetKit would need a Swift extension target.
