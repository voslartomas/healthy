import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import { BriefScreen, M, S, Section } from '../../components/brief';
import { exerciseOrUnknown } from '../../data/exerciseCatalog';
import { saveDraft, startDraftSession } from '../../state/strengthService';
import { PlannedExercise, useStrengthStore } from '../../state/useStrengthStore';
import { useTheme } from '../../theme/theme';
import { ExerciseMedia } from './components/ExerciseMedia';

/** A compact -/value/+ control for one builder field. */
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
        <Text style={[M(800, 15, { color: c.ink }), styles.adjustVal]}>
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

/** One exercise entry in the builder, with its editable targets + reorder. */
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
  const [preview, setPreview] = useState(false);

  const roundKg = (n: number) => Math.max(0, Math.round(n * 10) / 10);

  return (
    <View style={[styles.row, { borderColor: c.hair }]}>
      <View style={styles.rowHead}>
        <Text style={S(700, 14.5, { color: c.ink })} numberOfLines={1}>
          {def.name}
        </Text>
        <View style={styles.rowHeadActions}>
          <Pressable
            onPress={() => setPreview(p => !p)}
            accessibilityRole="button"
            accessibilityLabel={`${preview ? 'Hide' : 'Preview'} ${def.name}`}
            hitSlop={6}
          >
            <Text style={M(700, 10, { ls: 1, color: preview ? c.acc : c.mut })}>
              {preview ? 'HIDE' : 'PREVIEW'}
            </Text>
          </Pressable>
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
          <Pressable
            onPress={() => remove(entry.id)}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${def.name}`}
            hitSlop={6}
          >
            <Text style={M(700, 10, { ls: 1, color: c.red })}>REMOVE</Text>
          </Pressable>
        </View>
      </View>
      {preview ? (
        <ExerciseMedia exerciseId={entry.exerciseId} height={150} />
      ) : null}

      <View style={styles.adjustGrid}>
        <Adjust
          label="SETS"
          value={String(entry.targetSets)}
          step={1}
          onDelta={d =>
            update(entry.id, {
              targetSets: Math.max(1, entry.targetSets + d),
            })
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

      <Pressable
        onPress={() => togglePerSet(entry.id, !perSet)}
        accessibilityRole="switch"
        accessibilityState={{ checked: perSet }}
        accessibilityLabel={`Per-set targets for ${def.name}`}
        hitSlop={6}
        style={styles.perSetToggle}
      >
        <Text
          style={M(700, 9.5, { ls: 1, color: perSet ? c.acc : c.mut })}
        >
          {perSet ? '● ' : '○ '}PER-SET TARGETS
        </Text>
      </Pressable>

      {perSet && entry.setTargets ? (
        <View style={styles.setList}>
          {entry.setTargets.map((st, i) => (
            <View key={i} style={[styles.setRow, { borderColor: c.hair }]}>
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
  const t = useTheme();
  const c = t.colors;
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
      <Section n="01" title="Workout name" first>
        <TextInput
          value={draft?.name ?? ''}
          onChangeText={setName}
          placeholder="e.g. Upper body A"
          placeholderTextColor={c.fnt}
          style={[
            S(600, 15, { color: c.ink }),
            styles.nameInput,
            { borderColor: c.hair },
          ]}
        />
      </Section>

      <Section
        n="02"
        title="Exercises"
        titleRight={
          <Text style={M(700, 10.5, { color: c.fnt })}>
            {exercises.length}
          </Text>
        }
      >
        {exercises.length === 0 ? (
          <Text style={[S(600, 13, { color: c.mut }), styles.empty]}>
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

        <Pressable
          onPress={() => navigation.navigate('ExercisePicker')}
          accessibilityRole="button"
          accessibilityLabel="Add exercise"
          style={[styles.addExercise, { borderColor: c.ink }]}
        >
          <Text style={M(700, 12, { ls: 0.5, color: c.ink })}>
            ＋ ADD EXERCISE
          </Text>
        </Pressable>
      </Section>

      <View style={styles.footer}>
        <Pressable
          onPress={onSave}
          disabled={!canRun}
          accessibilityRole="button"
          accessibilityLabel="Save workout"
          style={[
            styles.footerBtn,
            { borderColor: c.hair, opacity: canRun ? 1 : 0.4 },
          ]}
        >
          <Text style={M(700, 12, { ls: 1, color: c.ink })}>SAVE</Text>
        </Pressable>
        <Pressable
          onPress={onStart}
          disabled={!canRun}
          accessibilityRole="button"
          accessibilityLabel="Start workout"
          style={[
            styles.footerBtn,
            styles.footerFill,
            { backgroundColor: c.ink, opacity: canRun ? 1 : 0.4 },
          ]}
        >
          <Text style={M(700, 12, { ls: 1, color: c.inv })}>START</Text>
        </Pressable>
      </View>
    </BriefScreen>
  );
}

const styles = StyleSheet.create({
  nameInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  empty: { marginTop: 12, lineHeight: 19 },
  row: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
    gap: 12,
  },
  rowHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  rowHeadActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  adjustGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  perSetToggle: { alignSelf: 'flex-start', paddingVertical: 2 },
  setList: { gap: 10 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  setNum: { width: 44, flexShrink: 0 },
  adjust: { gap: 6, minWidth: 96, flexGrow: 1 },
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
  addExercise: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 999,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  footer: { flexDirection: 'row', gap: 12, marginTop: 22 },
  footerBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 15,
    alignItems: 'center',
  },
  footerFill: { borderWidth: 0 },
});
