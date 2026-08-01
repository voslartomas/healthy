import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { DetailHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { cardio } from '../../data/health';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** Cardio-load detail: strain score, HR zones, activities, weekly balance. */
export function CardioScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = cardio;

  return (
    <Screen>
      <DetailHeader
        title="Cardio load"
        subtitle="Today · HR-based strain"
        onBack={() => navigation.goBack()}
      />

      <Card>
        <View style={[styles.tag, { backgroundColor: t.colors.surface2 }]}>
          <View style={[styles.tagDot, { backgroundColor: t.colors.strain }]} />
          <Text style={[styles.tagText, { color: t.colors.strain }]}>
            {c.intensity}
          </Text>
        </View>
        <Text style={[styles.bigLoad, { color: t.colors.strain }]}>
          {c.load}
        </Text>
        <Text style={[styles.subtitle, { color: t.colors.muted }]}>
          {c.subtitle}
        </Text>
        <View style={styles.dbarWrap}>
          <ProgressBar
            progress={c.barFill}
            color={t.colors.strain}
            height={12}
          />
          <View
            style={[
              styles.targetMark,
              {
                left: `${c.optimalStart * 100}%`,
                backgroundColor: t.colors.fg,
              },
            ]}
          />
        </View>
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>0</Text>
          <Text style={[styles.legendText, { color: t.colors.strain }]}>
            optimal zone
          </Text>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>21</Text>
        </View>
      </Card>

      <SectionLabel>Time in HR zones</SectionLabel>
      <Card>
        {c.zones.map(z => (
          <View key={z.label} style={styles.zone}>
            <Text style={[styles.zl, { color: t.colors.muted }]}>
              {z.label}
            </Text>
            <View style={styles.zbar}>
              <ProgressBar
                progress={z.fill}
                color={metricColor(t.colors, z.colorKey)}
                height={14}
              />
            </View>
            <Text style={[styles.zm, { color: t.colors.fg }]}>{z.minutes}</Text>
          </View>
        ))}
      </Card>

      <SectionLabel>Activities</SectionLabel>
      <Card>
        {c.activities.map((a, i) => (
          <View
            key={a.name}
            style={[
              styles.activity,
              i > 0 && {
                borderTopColor: t.colors.border,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <View
              style={[
                styles.actIc,
                { backgroundColor: metricColor(t.colors, a.colorKey) },
              ]}
            >
              <Icon
                name={a.icon}
                size={20}
                color={t.colors.onAccent}
                strokeWidth={2}
              />
            </View>
            <View style={styles.actText}>
              <Text style={[styles.actName, { color: t.colors.fg }]}>
                {a.name}
              </Text>
              <Text style={[styles.actDetail, { color: t.colors.muted }]}>
                {a.detail}
              </Text>
            </View>
            <View style={styles.actLd}>
              <Text style={[styles.actLoad, { color: t.colors.strain }]}>
                {a.load}
              </Text>
              <Text style={[styles.actLoadLbl, { color: t.colors.muted }]}>
                LOAD
              </Text>
            </View>
          </View>
        ))}
      </Card>

      <SectionLabel>7-day load balance</SectionLabel>
      <Card>
        <View style={styles.weekbars}>
          {c.weekBars.map((b, i) => {
            const color =
              b.tone === 'opt'
                ? t.colors.rec
                : b.tone === 'hi'
                  ? t.colors.recAmber
                  : t.colors.strain;
            return (
              <View key={i} style={styles.wb}>
                <View
                  style={[styles.col, { backgroundColor: t.colors.surface2 }]}
                >
                  <View
                    style={{
                      height: `${b.height * 100}%`,
                      backgroundColor: color,
                      borderTopLeftRadius: 6,
                      borderTopRightRadius: 6,
                    }}
                  />
                </View>
                <Text style={[styles.wbLabel, { color: t.colors.muted }]}>
                  {b.day}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={[styles.legend, { marginTop: 10 }]}>
          <Text style={[styles.legendText, { color: t.colors.muted }]}>
            {c.balanceNote}
          </Text>
          <Text style={[styles.legendText, { color: t.colors.rec }]}>
            Balanced
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagText: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  bigLoad: {
    fontFamily: monoFont,
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -2,
    marginTop: 12,
    marginBottom: 4,
  },
  subtitle: { fontSize: 12.5, fontWeight: '600' },
  dbarWrap: { marginTop: 18, justifyContent: 'center' },
  targetMark: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 3,
    borderRadius: 2,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  legendText: { fontFamily: monoFont, fontSize: 11, fontWeight: '600' },
  zone: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  zl: { fontFamily: monoFont, fontSize: 11, fontWeight: '700', width: 64 },
  zbar: { flex: 1 },
  zm: {
    fontFamily: monoFont,
    fontSize: 12,
    fontWeight: '700',
    width: 44,
    textAlign: 'right',
  },
  activity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  actIc: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actText: { flex: 1 },
  actName: { fontSize: 14, fontWeight: '700' },
  actDetail: { fontSize: 11.5, marginTop: 2 },
  actLd: { alignItems: 'flex-end' },
  actLoad: { fontFamily: monoFont, fontSize: 16, fontWeight: '800' },
  actLoadLbl: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
  },
  weekbars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 96,
  },
  wb: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  col: {
    width: '100%',
    flex: 1,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  wbLabel: { fontFamily: monoFont, fontSize: 10, fontWeight: '600' },
});
