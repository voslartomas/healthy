import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import {
  deleteWidgetView,
  loadWidgetDataRaw,
  loadWidgetView,
  saveWidgetView,
} from '../db/widgetRepository';
import { healthyWidget, NEXT_VIEW } from './HealthyWidget';
import {
  refreshWidgetFromHealth,
  WIDGET_REFRESH_MIN_MS,
} from './widgetRefresh';
import {
  isWidgetView,
  nextWidgetView,
  parseWidgetData,
  WidgetView,
  widgetModel,
} from './widgetData';

/**
 * Renders one placed widget from what the app last saved (ADR-010).
 * Shared by the headless task below and the app's push in widgetSync.
 */
export async function renderForWidget(
  widgetId: number,
  now: number = Date.now(),
): Promise<ReturnType<typeof healthyWidget>> {
  const [raw, stored] = await Promise.all([
    loadWidgetDataRaw(),
    loadWidgetView(widgetId),
  ]);
  const view: WidgetView = isWidgetView(stored) ? stored : 'water';
  return healthyWidget(widgetModel(parseWidgetData(raw), view, now));
}

/**
 * Re-read Health Connect when what the widget holds is older than
 * {@link WIDGET_REFRESH_MIN_MS}; true when there is something new to draw.
 */
async function refreshIfOld(now: number): Promise<boolean> {
  const data = parseWidgetData(await loadWidgetDataRaw());
  if (data && now - data.asOf < WIDGET_REFRESH_MIN_MS) return false;
  return refreshWidgetFromHealth(now);
}

/**
 * The widget's headless JS task, registered in index.ts. Android runs it when a
 * widget is added, resized, periodically updated (every 30 min) or tapped —
 * often with the app closed, so it touches only SQLite and Health Connect,
 * never the zustand stores.
 *
 * It always draws what it holds FIRST, so a tap switches views instantly, and
 * then — if that is more than a few minutes old — reads today's numbers live
 * (widgetRefresh) and draws again.
 */
export async function widgetTaskHandler(
  props: WidgetTaskHandlerProps,
): Promise<void> {
  const id = props.widgetInfo.widgetId;
  try {
    if (props.widgetAction === 'WIDGET_DELETED') {
      await deleteWidgetView(id);
      return;
    }
    if (
      props.widgetAction === 'WIDGET_CLICK' &&
      props.clickAction === NEXT_VIEW
    ) {
      const stored = await loadWidgetView(id);
      const current: WidgetView = isWidgetView(stored) ? stored : 'water';
      await saveWidgetView(id, nextWidgetView(current));
    }
    props.renderWidget(await renderForWidget(id));
    if (await refreshIfOld(Date.now())) {
      props.renderWidget(await renderForWidget(id));
    }
  } catch (err) {
    console.warn('Widget task failed', err);
  }
}
