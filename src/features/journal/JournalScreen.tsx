import React from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefButton, chunky, S, toneColors } from '../../components/brief';
import { Icon, IconName } from '../../components/Icon';
import { startOfLocalDay } from '../../health';
import {
  dayNumber,
  entryFor,
  formatEffect,
  JOURNAL_TAGS,
  JournalDay,
  JournalTagKey,
  journalTag,
  METRIC_LABEL,
  pendingConditions,
  stretchStart,
  tagImpacts,
} from '../../state/journal';
import { saveJournalDay } from '../../state/journalService';
import { useHealthStore } from '../../state/useHealthStore';
import { useJournalStore } from '../../state/useJournalStore';
import { useTheme } from '../../theme/theme';
import { FieldLabel, fieldStyle, formStyles } from '../nutrition/foodFormParts';
import { PinnedFooterLayout } from '../nutrition/PinnedFooterLayout';

/** How many days the strip offers (today and the six before it). */
const STRIP_DAYS = 7;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FEEL_ICON: Partial<Record<JournalTagKey, IconName>> = {
  sick: 'thermometer',
  injured: 'bandage',
  sore: 'pulse',
  stressed: 'boltLine',
};

interface Draft {
  tags: JournalTagKey[];
  note: string;
}

/** The last {@link STRIP_DAYS} local midnights, oldest first (DST-safe: each
 * step re-snaps to a local midnight instead of subtracting 24h). */
function stripDays(today: number): number[] {
  const out = [today];
  while (out.length < STRIP_DAYS) out.unshift(startOfLocalDay(out[0] - 1));
  return out;
}

/** "today" / "Mon 16" — for the save button and labels. */
function dayName(day: number, today: number): string {
  if (day === today) return 'today';
  const d = new Date(day);
  return `${DOW[d.getDay()]} ${d.getDate()}`;
}

/**
 * The journal (Journal artboard, ADR-009): pick a day from the last week, tag
 * how it went — how you feel (sick, injured, sore, stressed) and what happened
 * (alcohol, late caffeine, sauna…) — and add a note. Below, "What we've
 * noticed" compares the mornings after each tag with the user's other days.
 *
 * Sick and injured carry over: opening today while one is still open from an
 * earlier day pre-selects it, and saving without it records that it ended —
 * the same answer the Today card's "I'm better" gives.
 *
 * Edits are kept per day while switching days, and Save writes every day that
 * changed.
 */
export function JournalScreen({ navigation, route }: ScreenProps) {
  const c = useTheme().colors;
  const entries = useJournalStore(s => s.entries);
  const trends = useHealthStore(s => s.snapshot.trends);

  // Pinned at mount: the screen is short-lived, and a midnight rollover while
  // it's open shouldn't move the day being edited.
  const [now] = React.useState(() => Date.now());
  const today = startOfLocalDay(now);
  const days = React.useMemo(() => stripDays(today), [today]);
  const pending = React.useMemo(
    () => pendingConditions(entries, now),
    // Computed once: what was open when the screen opened is what the
    // pre-selection and the "ended" rule refer to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialDay =
    route?.params?.day != null ? startOfLocalDay(route.params.day) : today;
  const [day, setDay] = React.useState(
    days.includes(initialDay) ? initialDay : today,
  );
  const [drafts, setDrafts] = React.useState<Record<number, Draft>>({});
  const [busy, setBusy] = React.useState(false);

  /** What the day shows before any edit: its stored entry — plus, for today,
   * the conditions still open from earlier and not yet answered. (Even when
   * today already has an entry: tagging "alcohol" on Today must not read as
   * "no longer sick" the first time this screen is saved.) */
  const baseline = React.useCallback(
    (d: number): Draft => {
      const e = entryFor(entries, d);
      const tags = e?.tags ?? [];
      const carried =
        d === today
          ? pending.map(p => p.key).filter(k => !tags.includes(k))
          : [];
      return { tags: [...tags, ...carried], note: e?.note ?? '' };
    },
    [entries, pending, today],
  );

  const draft = drafts[day] ?? baseline(day);
  const edit = (patch: Partial<Draft>) =>
    setDrafts(cur => ({ ...cur, [day]: { ...draft, ...patch } }));
  const toggle = (key: JournalTagKey) =>
    edit({
      tags: draft.tags.includes(key)
        ? draft.tags.filter(k => k !== key)
        : [...draft.tags, key],
    });

  /** Days whose draft differs from what's stored (or, for today, from nothing
   * — pre-selected conditions count as an answer worth saving). */
  const changed = Object.keys(drafts)
    .map(Number)
    .filter(d => {
      const e = entryFor(entries, d);
      const dr = drafts[d];
      if (!e) return dr.tags.length > 0 || dr.note.trim() !== '';
      return !(
        e.note === dr.note &&
        e.tags.length === dr.tags.length &&
        e.tags.every(k => dr.tags.includes(k))
      );
    });
  // Today with an open condition and nothing saved yet is worth a save even
  // untouched — saving it IS the answer to "still sick?". Only while today is
  // the day on screen, so editing a past day never confirms today silently.
  const answersToday =
    day === today && pending.length > 0 && !changed.includes(today);
  const toSave = answersToday ? [...changed, today] : changed;

  const saveLabel =
    toSave.length > 1
      ? `Save ${toSave.length} days`
      : `Save ${dayName(toSave[0] ?? day, today)}`;

  const save = async () => {
    setBusy(true);
    try {
      for (const d of toSave) {
        const dr = drafts[d] ?? baseline(d);
        const stored = entryFor(entries, d);
        let ended = stored?.ended ?? [];
        if (d === today) {
          // A condition still open from earlier that the user left unselected
          // today is over — that's the answer to "still sick?".
          ended = [
            ...ended,
            ...pending.map(p => p.key).filter(k => !dr.tags.includes(k)),
          ];
        }
        await saveJournalDay({
          day: d,
          tags: dr.tags,
          ended,
          note: dr.note.trim(),
        });
      }
      navigation.goBack();
    } catch (err) {
      console.warn('Failed to save journal', err);
      Alert.alert('Not saved', 'The journal could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const impacts = React.useMemo(
    () => tagImpacts(entries, trends),
    [entries, trends],
  );
  const red = toneColors(c, 'red');
  const acc = toneColors(c, 'accent');

  // Day N for a carrying tag on the picked day, counting the draft itself.
  const dayNumberFor = (key: JournalTagKey): number | null => {
    if (!journalTag(key).carries || !draft.tags.includes(key)) return null;
    const asIf: JournalDay[] = [
      ...entries.filter(e => e.day !== day),
      { day, tags: draft.tags, ended: [], note: '', updatedAt: 0 },
    ];
    return dayNumber(stretchStart(asIf, key, day), day);
  };

  return (
    <PinnedFooterLayout
      footer={
        <BriefButton
          label={saveLabel}
          accessibilityLabel="Save journal"
          onPress={() => void save()}
          disabled={busy || toSave.length === 0}
          fontSize={18}
        />
      }
    >
      <View style={styles.strip} accessibilityRole="radiogroup">
        {days.map(d => {
          const on = d === day;
          const has =
            (drafts[d] ?? baseline(d)).tags.length > 0 ||
            !!entryFor(entries, d)?.note;
          const date = new Date(d);
          const label = d === today ? 'Today' : DOW[date.getDay()];
          return (
            <Pressable
              key={d}
              onPress={() => setDay(d)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${d === today ? 'Today' : dayName(d, today)}${has ? ', has entry' : ''}`}
              style={[
                styles.dayTile,
                {
                  backgroundColor: on ? acc.tint : c.card,
                  borderColor: on ? acc.solid : c.hair,
                },
              ]}
            >
              <Text style={S(800, 12, { color: on ? acc.text : c.mut })}>
                {label}
              </Text>
              <Text
                style={S(900, 18, { lh: 20, color: on ? acc.text : c.ink })}
              >
                {date.getDate()}
              </Text>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor: has
                      ? on
                        ? acc.solid
                        : c.fnt
                      : 'transparent',
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      <View style={formStyles.group}>
        <FieldLabel>How do you feel?</FieldLabel>
        <View style={styles.feelRow}>
          {JOURNAL_TAGS.filter(t => t.group === 'feel').map(t => {
            const on = draft.tags.includes(t.key);
            const n = dayNumberFor(t.key);
            return (
              <Pressable
                key={t.key}
                onPress={() => toggle(t.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t.label}
                style={[
                  styles.feelTile,
                  {
                    backgroundColor: on ? red.tint : c.card,
                    borderColor: on ? red.solid : c.hair,
                  },
                ]}
              >
                <Icon
                  name={FEEL_ICON[t.key] ?? 'check'}
                  size={26}
                  color={on ? red.text : c.ink}
                />
                <Text
                  style={S(900, 15, { color: on ? red.text : c.ink })}
                  numberOfLines={1}
                >
                  {t.label}
                </Text>
                <Text style={S(800, 12, { lh: 14, color: red.text })}>
                  {n ? `day ${n}` : ' '}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={S(700, 14, { lh: 19, color: c.mut })}>
          Sick and injured carry over — Today asks each morning until you’re
          better.
        </Text>
      </View>

      <View style={formStyles.group}>
        <FieldLabel>What happened?</FieldLabel>
        <View style={styles.pills}>
          {JOURNAL_TAGS.filter(t => t.group === 'did').map(t => {
            const on = draft.tags.includes(t.key);
            return (
              <Pressable
                key={t.key}
                onPress={() => toggle(t.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t.label}
                style={[
                  styles.pill,
                  {
                    backgroundColor: on ? acc.tint : c.card,
                    borderColor: on ? acc.solid : c.hair,
                  },
                ]}
              >
                <Text style={S(900, 15, { color: on ? acc.text : c.ink })}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={formStyles.group}>
        <FieldLabel>Note</FieldLabel>
        <TextInput
          value={draft.note}
          onChangeText={note => edit({ note })}
          placeholder="Sore throat, left knee, big week at work…"
          placeholderTextColor={c.fnt}
          accessibilityLabel="Journal note"
          multiline
          style={[fieldStyle(c, 16), styles.note]}
        />
      </View>

      <View
        style={[chunky(c), styles.card]}
        accessibilityLabel="What we've noticed"
      >
        <Text style={S(900, 20, { color: c.ink })}>What we’ve noticed</Text>
        {impacts.length === 0 ? (
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            Tag a few days and this shows how each tag moves your recovery, HRV
            and sleep — after 3 tagged days with data.
          </Text>
        ) : (
          impacts.map(im => (
            <View
              key={im.key}
              style={[styles.impact, { backgroundColor: c.soft }]}
            >
              <View style={styles.impactHead}>
                <Text style={S(900, 16, { color: c.ink })}>
                  {journalTag(im.key).label}
                </Text>
                <Text style={S(800, 13, { color: c.fnt })}>
                  {im.count}{' '}
                  {journalTag(im.key).affects === 'nextMorning'
                    ? 'nights'
                    : 'days'}
                </Text>
              </View>
              <View style={styles.effects}>
                {im.effects.map(e => (
                  <Text key={e.metric} style={S(800, 14, { color: c.mut })}>
                    {METRIC_LABEL[e.metric]}{' '}
                    <Text
                      style={S(900, 14, {
                        color: e.flat ? c.mut : e.good ? c.grn : c.red,
                      })}
                    >
                      {e.flat ? 'no change' : formatEffect(e)}
                    </Text>
                  </Text>
                ))}
              </View>
            </View>
          ))
        )}
        <Text style={S(700, 13, { lh: 18, color: c.fnt })}>
          Compared with your other days. Evening tags are matched to the next
          morning. Your own data — a pattern, not a diagnosis.
        </Text>
      </View>
    </PinnedFooterLayout>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  dayTile: {
    flex: 1,
    minWidth: 0,
    height: 64,
    borderRadius: 14,
    borderWidth: 2,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  feelRow: { flexDirection: 'row', gap: 8 },
  feelTile: {
    flex: 1,
    minWidth: 0,
    height: 96,
    borderRadius: 18,
    borderWidth: 2,
    borderBottomWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 2,
    borderBottomWidth: 4,
    justifyContent: 'center',
  },
  note: { minHeight: 96, textAlignVertical: 'top' },
  card: { padding: 18, gap: 12 },
  impact: { padding: 12, paddingHorizontal: 14, borderRadius: 16, gap: 6 },
  impactHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  effects: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4 },
});
