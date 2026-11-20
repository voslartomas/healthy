'use no memo';
import React from 'react';
import {
  FlexWidget,
  TextWidget,
  type ColorProp,
} from 'react-native-android-widget';

import { dark, light, type Palette } from '../theme/colors';
import { WIDGET_VIEWS, type WidgetModel, type WidgetTone } from './widgetData';

/**
 * The Android home-screen widget's layout (the "Android widget" board on the
 * design canvas, ADR-010). Rendered by react-native-android-widget, which turns
 * this JSX into native RemoteViews: only its Flex/Text primitives work here —
 * no hooks, no RN components, and the file opts out of the React Compiler
 * ('use no memo') because the library calls these as plain functions.
 *
 * The whole card is one tap target (clickAction NEXT_VIEW → the task handler
 * cycles Water → Food → Recovery); the round arrow opens the app.
 */

/** Click actions the task handler understands. */
export const NEXT_VIEW = 'NEXT_VIEW';

/** Widget name, as registered in the config plugin (app.json). */
export const WIDGET_NAME = 'Healthy';

/** The widget only takes hex/rgba strings; the palette is all hex/rgba. */
const col = (v: string) => v as ColorProp;

function tone(c: Palette, t: WidgetTone, isDark: boolean) {
  const pick = {
    water: { solid: c.water, text: c.waterText, tint: c.waterTint },
    food: { solid: c.food, text: c.foodText, tint: c.foodTint },
    good: { solid: c.grnSolid, text: c.grn, tint: c.grnTint },
    bad: { solid: c.redSolid, text: c.red, tint: c.redTint },
  }[t];
  // Dark tints are translucent (meant to sit on a card); the widget sits on
  // a wallpaper, so in dark mode it is a solid card instead.
  return { ...pick, bg: isDark ? c.card : pick.tint };
}

const FONT_BLACK = 'Nunito_900Black';
const FONT_BOLD = 'Nunito_800ExtraBold';

function Layout({ m, isDark }: { m: WidgetModel; isDark: boolean }) {
  const c = isDark ? dark : light;
  const t = tone(c, m.tone, isDark);
  const fillPct = Math.round(m.fill * 100);
  const GLASS_H = 64;

  return (
    <FlexWidget
      clickAction={NEXT_VIEW}
      accessibilityLabel={m.a11y}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: col(t.bg),
        borderRadius: 26,
        borderWidth: 2,
        borderBottomWidth: 5,
        borderColor: col(c.hair),
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
      }}
    >
      {/* Header: area dot + label, view dots, open-app button. */}
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <FlexWidget
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: col(t.solid),
            marginRight: 8,
          }}
        />
        <TextWidget
          text={m.label.toUpperCase()}
          style={{
            fontSize: 13,
            fontFamily: FONT_BLACK,
            letterSpacing: 0.08,
            color: col(t.text),
          }}
        />
        <FlexWidget style={{ flex: 1, height: 1 }} />
        {WIDGET_VIEWS.map(v => (
          <FlexWidget
            key={v}
            style={{
              width: v === m.view ? 18 : 7,
              height: 7,
              borderRadius: 4,
              marginLeft: 4,
              backgroundColor: col(v === m.view ? t.solid : c.hair),
            }}
          />
        ))}
        <FlexWidget
          clickAction="OPEN_APP"
          accessibilityLabel="Open Healthy"
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            marginLeft: 10,
            backgroundColor: col(c.track),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text="↗"
            style={{ fontSize: 16, fontFamily: FONT_BLACK, color: col(t.text) }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Body: glass (water) + the number. */}
      <FlexWidget
        style={{
          flex: 1,
          width: 'match_parent',
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        {m.glass ? (
          <FlexWidget
            style={{
              width: 42,
              height: GLASS_H,
              marginRight: 14,
              borderWidth: 3,
              borderTopWidth: 0,
              borderColor: col(t.solid),
              borderBottomLeftRadius: 12,
              borderBottomRightRadius: 12,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              flexDirection: 'column',
              justifyContent: 'flex-end',
            }}
          >
            {fillPct > 0 ? (
              <FlexWidget
                style={{
                  width: 'match_parent',
                  height: Math.max(
                    4,
                    Math.round(((GLASS_H - 3) * fillPct) / 100),
                  ),
                  backgroundColor: col(t.solid),
                  borderBottomLeftRadius: 9,
                  borderBottomRightRadius: 9,
                }}
              />
            ) : null}
          </FlexWidget>
        ) : null}
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <TextWidget
              text={m.big}
              style={{
                fontSize: 38,
                fontFamily: FONT_BLACK,
                color: col(m.empty ? c.fnt : c.ink),
              }}
            />
            {m.unit ? (
              <TextWidget
                text={` ${m.unit}`}
                style={{
                  fontSize: 15,
                  fontFamily: FONT_BOLD,
                  color: col(c.mut),
                  paddingBottom: 7,
                }}
              />
            ) : null}
          </FlexWidget>
          {!m.glass ? (
            // A bar from flex weights: the widget's width isn't known here.
            <FlexWidget
              style={{
                width: 'match_parent',
                height: 10,
                borderRadius: 5,
                flexDirection: 'row',
                backgroundColor: col(c.track),
                marginTop: 2,
                marginBottom: 4,
              }}
            >
              {fillPct > 0 ? (
                <FlexWidget
                  style={{
                    width: 0,
                    height: 10,
                    flex: fillPct,
                    borderRadius: 5,
                    backgroundColor: col(t.solid),
                  }}
                />
              ) : null}
              {fillPct < 100 ? (
                <FlexWidget
                  style={{ width: 0, height: 10, flex: 100 - fillPct }}
                />
              ) : null}
            </FlexWidget>
          ) : null}
          <TextWidget
            text={m.sub}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 14, fontFamily: FONT_BOLD, color: col(t.text) }}
          />
        </FlexWidget>
      </FlexWidget>

      <TextWidget
        text={m.foot}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 12, fontFamily: FONT_BOLD, color: col(c.fnt) }}
      />
    </FlexWidget>
  );
}

/** Light and dark renderings; the launcher picks by the system theme. */
export function healthyWidget(m: WidgetModel) {
  return {
    light: <Layout m={m} isDark={false} />,
    dark: <Layout m={m} isDark />,
  };
}
