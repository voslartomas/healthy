import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppNav } from '../../app/navigation/types';
import {
  BriefButton,
  cardTitleStyle,
  chunky,
  S,
  toneColors,
} from '../../components/brief';
import { Icon, IconName } from '../../components/Icon';
import { startOfLocalDay } from '../../health';
import {
  activeConditions,
  entryFor,
  JournalTagKey,
  journalTag,
  pendingConditions,
} from '../../state/journal';
import {
  confirmCondition,
  endCondition,
  toggleTodayTag,
} from '../../state/journalService';
import { useJournalStore } from '../../state/useJournalStore';
import { useNow } from '../../state/useNow';
import { useTheme } from '../../theme/theme';

const WEEKDAY = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/** The one-tap chips offered when they aren't already on today's entry. */
const QUICK: JournalTagKey[] = ['sick', 'injured', 'stressed', 'alcohol'];

const CONDITION_ICON: Partial<Record<JournalTagKey, IconName>> = {
  sick: 'thermometer',
  injured: 'bandage',
};

function run(p: Promise<void>) {
  void p.catch(err => console.warn('Failed to save journal', err));
}

/**
 * Today's journal card (Journal card on the Today artboard, ADR-009).
 *
 * - An open condition from an earlier day (sick, injured) asks first: "Still
 *   sick? · this would be day 3" with Still sick / I'm better.
 * - Then today's tags as chips — tap to take one off — plus a few one-tap
 *   suggestions and "+ More", which opens the full journal.
 */
export function JournalCard({ navigation }: { navigation: AppNav }) {
  const c = useTheme().colors;
  const entries = useJournalStore(s => s.entries);
  const now = useNow();
  const today = startOfLocalDay(now);

  const pending = pendingConditions(entries, now);
  const todays = entryFor(entries, today);
  const active = activeConditions(entries, today);
  const tags = todays?.tags ?? [];
  const suggestions = QUICK.filter(
    k => !tags.includes(k) && !pending.some(p => p.key === k),
  );
  const red = toneColors(c, 'red');
  const acc = toneColors(c, 'accent');

  const chipLabel = (k: JournalTagKey) => {
    const a = active.find(x => x.key === k);
    return a && a.dayNumber > 1
      ? `${journalTag(k).label} · day ${a.dayNumber}`
      : journalTag(k).label;
  };

  return (
    <View style={[chunky(c), styles.card]} accessibilityLabel="Journal">
      <View style={styles.head}>
        <Text style={cardTitleStyle(c.ink)}>Journal</Text>
        <Pressable
          onPress={() => navigation.navigate('Journal')}
          accessibilityRole="button"
          accessibilityLabel="Open journal"
          hitSlop={10}
          style={styles.open}
        >
          <Text style={S(900, 15, { color: c.acc })}>Open</Text>
          <Icon name="chevronRight" size={18} color={c.acc} />
        </Pressable>
      </View>

      {pending.map(p => {
        const label = journalTag(p.key).label;
        return (
          <View key={p.key} style={styles.ask}>
            <View style={[styles.askRow, { backgroundColor: red.tint }]}>
              <View style={[styles.askIcon, { backgroundColor: red.solid }]}>
                <Icon
                  name={CONDITION_ICON[p.key] ?? 'heartLine'}
                  size={22}
                  color={c.onAccent}
                />
              </View>
              <View style={styles.askText}>
                <Text style={S(900, 16, { color: c.ink })}>
                  Still {label.toLowerCase()}?
                </Text>
                <Text style={S(700, 14, { lh: 19, color: red.text })}>
                  Since {WEEKDAY[new Date(p.since).getDay()]} · this would be
                  day {p.dayNumber}
                </Text>
              </View>
            </View>
            <View style={styles.askButtons}>
              <BriefButton
                label={`Still ${label.toLowerCase()}`}
                tone="red"
                size={11}
                style={styles.askButton}
                onPress={() => run(confirmCondition(p.key))}
              />
              <BriefButton
                label="I’m better"
                kind="outline"
                size={11}
                style={styles.askButton}
                onPress={() => run(endCondition(p.key))}
              />
            </View>
          </View>
        );
      })}

      <Text style={S(800, 14, { color: c.mut })}>
        {tags.length || pending.length
          ? 'Anything else today?'
          : 'How’s today going?'}
      </Text>
      <View style={styles.chips}>
        {tags.map(k => {
          const cond = journalTag(k).group === 'feel';
          const tc = cond ? red : acc;
          return (
            <Pressable
              key={k}
              onPress={() => run(toggleTodayTag(k))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: true }}
              accessibilityLabel={journalTag(k).label}
              style={[
                styles.chip,
                { backgroundColor: tc.tint, borderColor: tc.solid },
              ]}
            >
              <Text style={S(900, 14, { color: tc.text })}>{chipLabel(k)}</Text>
            </Pressable>
          );
        })}
        {suggestions.map(k => (
          <Pressable
            key={k}
            onPress={() => run(toggleTodayTag(k))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: false }}
            accessibilityLabel={journalTag(k).label}
            style={[
              styles.chip,
              { backgroundColor: c.card, borderColor: c.hair },
            ]}
          >
            <Text style={S(900, 14, { color: c.ink })}>
              {journalTag(k).label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => navigation.navigate('Journal')}
          accessibilityRole="button"
          accessibilityLabel="More journal tags"
          style={[styles.chip, styles.more, { backgroundColor: c.soft }]}
        >
          <Text style={S(900, 14, { color: c.acc })}>+ More</Text>
        </Pressable>
      </View>

      {todays?.note ? (
        <Text style={S(700, 14, { lh: 19, color: c.mut })} numberOfLines={2}>
          “{todays.note}”
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, marginTop: 14, gap: 12 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  open: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ask: { gap: 10 },
  askRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  askIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askText: { flex: 1, minWidth: 0 },
  askButtons: { flexDirection: 'row', gap: 10 },
  askButton: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderBottomWidth: 3,
  },
  more: { borderWidth: 0, borderBottomWidth: 0, paddingVertical: 10 },
});
