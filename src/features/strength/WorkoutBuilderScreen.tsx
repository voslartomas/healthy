import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefButton,
  BriefScreen,
  Card,
  inputStyle,
  M,
  S,
} from '../../components/brief';
import {
  EQUIPMENT_LABELS,
  exerciseOrUnknown,
  MUSCLE_LABELS,
} from '../../data/exerciseCatalog';
import { saveDraft, startDraftSession } from '../../state/strengthService';
import {
  PlannedExercise,
  useStrengthStore,
} from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { ExerciseMedia } from './components/ExerciseMedia';
import { formatKg } from './components/SetRow';

/** A compact −/value/+ control for one builder field. */
function Adjust({
  label,
  value,
  onDelta,
  step,
  suffix,
  accessibilityPrefix,
}: {
  label: string;
  value: string;
  onDelta: (d: number) => void;
  step: number;
  suffix?: string;
  accessibilityPrefix: string;
}) {
  const c = useTheme().colors;
  return (
    <View style={styles.adjust}>
      <Text style={M(700, 8.5, { ls: 1, color: c.fnt })}>{label}</Text>
      <View style={styles.adjustRow}>
        <Pressable
          onPress={() => onDelta(-step)}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${accessibilityPrefix}`}
          hitSlop={6}
          style={[styles.pm, { borderColor: c.hair }]}
        >
          <Text style={M(700, 15, { color: c.ink })}>−</Text>
        </Pressable>
        <Text style={[M(700, 15, { color: c.ink }), styles.adjustVal]}>
          {value}
          {suffix ? (
            <Text style={M(700, 9, { color: c.fnt })}>{suffix}</Text>
          ) : null}
        </Text>
        <Pressable
          onPress={() => onDelta(step)}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${accessibilityPrefix}`}
          hitSlop={6}
          style={[styles.pm, { borderColor: c.hair }]}
        >
          <Text style={M(700, 15, { color: c.ink })}>＋</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** "3 × 10 · 22.5 KG · 90S REST" — the accent summary line for one entry. */
function entrySummary(entry: PlannedExercise): string {
  const parts = [`${entry.targetSets} × ${entry.targetReps}`];
  if (entry.setTargets) parts[0] = `${entry.targetSets} SETS · PER-SET`;
  if (entry.targetWeightKg != null)
    parts.push(`${formatKg(entry.targetWeightKg)} KG`);
  parts.push(`${entry.restSec}S REST`);
  return parts.join(' · ');
}

/** One exercise entry in the builder: its media, targets and reorder controls. */
function BuilderRow({
  entry,
  index,
  count,
}: {
  entry: PlannedExercise;
  index: number;
  count: number;
}) {
  const c = useTheme().colors;
  const def = exerciseOrUnknown(entry.exerciseId);
  const update = useStrengthStore(s => s.updateDraftExercise);
  const remove = useStrengthStore(s => s.removeDraftExercise);
  const move = useStrengthStore(s => s.moveDraftExercise);
  const togglePerSet = useStrengthStore(s => s.toggleDraftPerSet);
  const updateSet = useStrengthStore(s => s.updateDraftSetTarget);
  const perSet = !!entry.setTargets;
  const weighted = entry.targetWeightKg != null;

  const roundKg = (n: number) => Math.max(0, Math.round(n * 10) / 10);

  return (
    <View
      style={[styles.row, { backgroundColor: c.card, borderColor: c.hair }]}
    >
      <View style={styles.rowHead}>
        <ExerciseMedia
          exerciseId={entry.exerciseId}
          variant="thumb"
          height={76}
        />
        <View style={styles.rowMain}>
          <View style={styles.rowTitle}>
            <Text
              style={[S(700, 14.5, { lh: 18, color: c.ink }), styles.rowName]}
              numberOfLines={1}
            >
              {def.name}
            </Text>
            <Pressable
              onPress={() => remove(entry.id)}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${def.name}`}
              hitSlop={6}
            >
              <Text style={M(700, 10, { ls: 1, color: c.red })}>REMOVE</Text>
            </Pressable>
          </View>
          <Text style={[M(600, 9, { ls: 0.6, color: c.fnt }), styles.rowMeta]}>
            {MUSCLE_LABELS[def.muscleGroup].toUpperCase()} ·{' '}
            {EQUIPMENT_LABELS[def.equipment].toUpperCase()}
          </Text>
          <Text style={[M(700, 9, { ls: 1, color: c.acc }), styles.rowSummary]}>
            {entrySummary(entry)}
          </Text>
        </View>
      </View>

      <View style={styles.adjustGrid}>
        <Adjust
          label="SETS"
          value={String(entry.targetSets)}
          step={1}
          onDelta={d =>
            update(entry.id, { targetSets: Math.max(1, entry.targetSets + d) })
          }
          accessibilityPrefix={`${def.name} sets`}
        />
        {!perSet ? (
          <>
            <Adjust
              label="REPS"
              value={String(entry.targetReps)}
              step={1}
              onDelta={d =>
                update(entry.id, {
                  targetReps: Math.max(1, entry.targetReps + d),
                })
              }
              accessibilityPrefix={`${def.name} reps`}
            />
            {weighted ? (
              <Adjust
                label="WEIGHT"
                value={String(entry.targetWeightKg)}
                suffix="kg"
                step={0.5}
                onDelta={d =>
                  update(entry.id, {
                    targetWeightKg: roundKg((entry.targetWeightKg ?? 0) + d),
                  })
                }
                accessibilityPrefix={`${def.name} weight`}
              />
            ) : null}
          </>
        ) : null}
        <Adjust
          label="REST"
          value={String(entry.restSec)}
          suffix="s"
          step={15}
          onDelta={d =>
            update(entry.id, { restSec: Math.max(0, entry.restSec + d) })
          }
          accessibilityPrefix={`${def.name} rest`}
        />
      </View>

      <View style={styles.rowFooter}>
        <Pressable
          onPress={() => togglePerSet(entry.id, !perSet)}
          accessibilityRole="switch"
          accessibilityState={{ checked: perSet }}
          accessibilityLabel={`Per-set targets for ${def.name}`}
          hitSlop={6}
        >
          <Text style={M(700, 9.5, { ls: 1, color: perSet ? c.acc : c.mut })}>
            {perSet ? '● ' : '○ '}PER-SET TARGETS
          </Text>
        </Pressable>
        <View style={styles.moveRow}>
          {index > 0 ? (
            <Pressable
              onPress={() => move(entry.id, -1)}
              accessibilityRole="button"
              accessibilityLabel={`Move ${def.name} up`}
              hitSlop={6}
            >
              <Text style={M(700, 13, { color: c.mut })}>↑</Text>
            </Pressable>
          ) : null}
          {index < count - 1 ? (
            <Pressable
              onPress={() => move(entry.id, 1)}
              accessibilityRole="button"
              accessibilityLabel={`Move ${def.name} down`}
              hitSlop={6}
            >
              <Text style={M(700, 13, { color: c.mut })}>↓</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {perSet && entry.setTargets ? (
        <View style={styles.setList}>
          {entry.setTargets.map((st, i) => (
            <View key={i} style={[styles.setRow, { borderTopColor: c.hair }]}>
              <Text
                style={[M(700, 10, { ls: 0.5, color: c.fnt }), styles.setNum]}
              >
                SET {i + 1}
              </Text>
              {weighted ? (
                <Adjust
                  label="KG"
                  value={String(st.weightKg ?? 0)}
                  step={0.5}
                  onDelta={d =>
                    updateSet(entry.id, i, {
                      weightKg: roundKg((st.weightKg ?? 0) + d),
                    })
                  }
                  accessibilityPrefix={`${def.name} set ${i + 1} weight`}
                />
              ) : null}
              <Adjust
                label="REPS"
                value={String(st.reps)}
                step={1}
                onDelta={d =>
                  updateSet(entry.id, i, { reps: Math.max(1, st.reps + d) })
                }
                accessibilityPrefix={`${def.name} set ${i + 1} reps`}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Build (or edit) a workout: name it, add exercises from the catalog, and set
 * per-exercise sets/reps/weight/rest. Save persists it for reuse; Start runs it
 * immediately (ad-hoc runs simply aren't saved). All draft state lives in the
 * strength store, so the picker modal can append to it without route params.
 */
export function WorkoutBuilderScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const draft = useStrengthStore(s => s.draft);
  const setName = useStrengthStore(s => s.setDraftName);

  const exercises = draft?.exercises ?? [];
  const canRun = exercises.length > 0;

  async function onSave() {
    const saved = await saveDraft();
    if (saved) navigation.goBack();
  }

  function onStart() {
    if (startDraftSession()) navigation.replace('WorkoutRun');
  }

  return (
    <BriefScreen>
      <Card first title="Workout name">
        <TextInput
          value={draft?.name ?? ''}
          onChangeText={setName}
          placeholder="e.g. Upper body A"
          placeholderTextColor={c.fnt}
          style={[
            S(600, 15, { color: c.ink }),
            inputStyle(c),
            styles.nameInput,
          ]}
        />
      </Card>

      <Card
        title="Exercises"
        right={
          <Text style={M(700, 10.5, { color: c.fnt })}>{exercises.length}</Text>
        }
      >
        {exercises.length === 0 ? (
          <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty]}>
            No exercises yet. Add movements from the catalog below.
          </Text>
        ) : (
          exercises.map((e, i) => (
            <BuilderRow
              key={e.id}
              entry={e}
              index={i}
              count={exercises.length}
            />
          ))
        )}

        <BriefButton
          label="＋ ADD EXERCISE"
          kind="dashed"
          size={13}
          onPress={() => navigation.navigate('ExercisePicker')}
          style={styles.addExercise}
        />
      </Card>

      <View style={styles.footer}>
        <BriefButton
          label="SAVE"
          kind="outline"
          size={15}
          disabled={!canRun}
          onPress={onSave}
          style={styles.footerBtn}
          accessibilityLabel="Save workout"
        />
        <BriefButton
          label="START"
          size={15}
          fontSize={12}
          disabled={!canRun}
          onPress={onStart}
          style={styles.footerBtn}
          accessibilityLabel="Start workout"
        />
      </View>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  nameInput: { marginTop: 12 },
  empty: { marginTop: 12 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 14,
  },
  rowHead: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  rowName: { flex: 1, minWidth: 0 },
  rowMeta: { marginTop: 5 },
  rowSummary: { marginTop: 8 },
  adjustGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  moveRow: { flexDirection: 'row', gap: 14 },
  setList: { gap: 10 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  setNum: { width: 44, flexShrink: 0 },
  adjust: { gap: 6, minWidth: 84, flexGrow: 1, flexBasis: 84 },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adjustVal: { flex: 1, textAlign: 'center' },
  pm: {
    width: 34,
    height: 34,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addExercise: { marginTop: 14 },
  footer: { flexDirection: 'row', gap: 12, marginTop: 22 },
  footerBtn: { flex: 1 },
});
