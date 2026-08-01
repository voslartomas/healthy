import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { Card } from '../../components/Card';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';
import { Ring } from '../../components/Ring';
import { AppHeader, Screen } from '../../components/Screen';
import { SectionLabel } from '../../components/SectionLabel';
import { nutrition } from '../../data/health';
import { metricColor } from '../../theme/metricColors';
import { monoFont, useTheme } from '../../theme/theme';

/** Nutrition screen: calorie budget, in vs out, macros, and today's meals. */
export function NutritionScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const n = nutrition;

  return (
    <Screen>
      <AppHeader
        eyebrow="Nutrition · Today"
        title="Fuel"
        onAvatarPress={() => navigation.navigate('Settings')}
      />

      <Card>
        <View style={styles.heroRing}>
          <Ring
            progress={n.ringPct / 100}
            color={t.colors.carbs}
            size={118}
            strokeWidth={10}
            value={String(n.kcalLeft)}
            label="kcal left"
            valueFontSize={26}
          />
          <View style={styles.heroMeta}>
            <Text style={[styles.heroTitle, { color: t.colors.fg }]}>
              {n.headline}
            </Text>
            <Text style={[styles.heroBody, { color: t.colors.muted }]}>
              {n.body}
            </Text>
          </View>
        </View>
      </Card>

      <Card style={styles.spaced}>
        <View style={styles.rowBetween}>
          <SectionLabel style={styles.inlineLabel}>In vs out</SectionLabel>
          <View style={[styles.pill, { backgroundColor: t.colors.surface2 }]}>
            <Text style={[styles.pillText, { color: t.colors.accent }]}>
              Deficit −500
            </Text>
            <Icon
              name="edit"
              size={12}
              color={t.colors.accent}
              strokeWidth={2}
            />
          </View>
        </View>
        <View style={styles.inout}>
          <InOut label="Eaten" value={grp(n.eaten)} color={t.colors.fg} />
          <InOut label="Burned" value={grp(n.burned)} color={t.colors.strain} />
          <InOut label="Net" value={String(n.net)} color={t.colors.rec} />
        </View>
      </Card>

      <Card style={styles.spaced}>
        <SectionLabel style={[styles.inlineLabel, { marginBottom: 4 }]}>
          Macros
        </SectionLabel>
        {n.macros.map(m => (
          <View key={m.name} style={styles.macro}>
            <View style={styles.rowBetween}>
              <Text style={[styles.macroName, { color: t.colors.fg }]}>
                {m.name}
              </Text>
              <Text style={[styles.macroG, { color: t.colors.muted }]}>
                <Text style={{ color: t.colors.fg }}>{m.current}</Text> /{' '}
                {m.target} {m.unit}
              </Text>
            </View>
            <ProgressBar
              progress={m.fill}
              color={metricColor(t.colors, m.colorKey)}
              height={9}
            />
          </View>
        ))}
      </Card>

      <Card style={styles.spaced}>
        <SectionLabel style={[styles.inlineLabel, { marginBottom: 6 }]}>
          {"Today's meals"}
        </SectionLabel>
        {n.meals.map((meal, i) => (
          <View
            key={meal.name}
            style={[
              styles.meal,
              i > 0 && {
                borderTopColor: t.colors.border,
                borderTopWidth: StyleSheet.hairlineWidth,
              },
              meal.planned && { opacity: 0.55 },
            ]}
          >
            <View
              style={[
                styles.mealIc,
                {
                  backgroundColor: meal.planned
                    ? 'transparent'
                    : t.colors.surface2,
                  borderWidth: meal.planned ? 1 : 0,
                  borderColor: t.colors.border,
                  borderStyle: 'dashed',
                },
              ]}
            >
              <Icon
                name={meal.planned ? 'plus' : 'nutrition'}
                size={18}
                color={t.colors.muted}
              />
            </View>
            <View style={styles.mealText}>
              <Text style={[styles.mealName, { color: t.colors.fg }]}>
                {meal.name}
              </Text>
              <Text style={[styles.mealDetail, { color: t.colors.muted }]}>
                {meal.detail}
              </Text>
            </View>
            <Text style={[styles.mealKcal, { color: t.colors.fg }]}>
              {meal.kcal}
            </Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function InOut({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const t = useTheme();
  return (
    <View style={[styles.inoutBox, { backgroundColor: t.colors.surface2 }]}>
      <Text style={[styles.inoutK, { color: t.colors.muted }]}>{label}</Text>
      <Text style={[styles.inoutV, { color }]}>{value}</Text>
    </View>
  );
}

function grp(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

const styles = StyleSheet.create({
  spaced: { marginTop: 14 },
  heroRing: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroMeta: { flex: 1 },
  heroTitle: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  heroBody: { fontSize: 12.5, lineHeight: 18, marginTop: 6 },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inlineLabel: { marginTop: 0, marginBottom: 14, marginHorizontal: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  pillText: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  inout: { flexDirection: 'row', gap: 10 },
  inoutBox: { flex: 1, borderRadius: 16, padding: 13 },
  inoutK: {
    fontFamily: monoFont,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  inoutV: {
    fontFamily: monoFont,
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginTop: 7,
  },
  macro: { marginTop: 16 },
  macroName: { fontSize: 13, fontWeight: '700', marginBottom: 7 },
  macroG: { fontFamily: monoFont, fontSize: 12, fontWeight: '700' },
  meal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  mealIc: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealText: { flex: 1 },
  mealName: { fontSize: 14, fontWeight: '700' },
  mealDetail: { fontSize: 11.5, marginTop: 2 },
  mealKcal: { fontFamily: monoFont, fontSize: 15, fontWeight: '800' },
});
