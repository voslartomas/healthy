import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenProps } from '../../app/navigation/types';
import {
  BriefButton,
  BriefScreen,
  chunky,
  inputStyle,
  S,
} from '../../components/brief';
import { Icon } from '../../components/Icon';
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

/**
 * A compact −/value/+ control for one builder field: the design's soft well
 * with two small chunky keys either side of the value and its label. The keys
 * are 36px to fit two wells per row; `hitSlop` lifts the touch target to 44.
 */
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
  const key = [chunky(c, 12), styles.key, { borderBottomWidth: 3 }];
  return (
    <View style={[styles.adjust, { backgroundColor: c.soft }]}>
      <Pressable
        onPress={() => onDelta(-step)}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${accessibilityPrefix}`}
        hitSlop={4}
        style={key}
      >
        <Text style={S(900, 18, { color: c.ink })}>−</Text>
      </Pressable>
      <View style={styles.adjustVal}>
        <Text style={S(900, 18, { lh: 21, color: c.ink })} numberOfLines={1}>
          {value}
          {suffix ? (
            <Text style={S(900, 13, { color: c.fnt })}>{suffix}</Text>
          ) : null}
        </Text>
        <Text style={S(900, 12, { color: c.fnt })}>{label}</Text>
      </View>
      <Pressable
        onPress={() => onDelta(step)}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${accessibilityPrefix}`}
        hitSlop={4}
        style={key}
      >
        <Text style={S(900, 18, { color: c.ink })}>+</Text>
      </Pressable>
    </View>
  );
}

/** "3 × 10 · 22.5 kg · 90s rest" — the violet summary line for one entry. */
function entrySummary(entry: PlannedExercise): string {
  const parts = [`${entry.targetSets} × ${entry.targetReps}`];
  if (entry.setTargets) parts[0] = `${entry.targetSets} sets · per-set`;
  if (entry.targetWeightKg != null)
    parts.push(`${formatKg(entry.targetWeightKg)} kg`);
  parts.push(`${entry.restSec}s rest`);
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
  const moveBtn = [styles.moveBtn, { backgroundColor: c.soft }];

  return (
    <View style={[chunky(c), styles.row]}>
      <View style={styles.rowHead}>
        <ExerciseMedia
          exerciseId={entry.exerciseId}
          variant="thumb"
          height={52}
        />
        <View style={styles.rowMain}>
          <Text style={S(900, 17, { lh: 22, color: c.ink })} numberOfLines={2}>
            {def.name}
          </Text>
          <Text style={S(700, 14, { color: c.mut })}>
            {MUSCLE_LABELS[def.muscleGroup]} ·{' '}
            {EQUIPMENT_LABELS[def.equipment].toLowerCase()}
          </Text>
          <Text style={S(800, 13, { color: c.liftText })}>
            {entrySummary(entry)}
          </Text>
        </View>
        {/* Reorder: only the moves that are possible are offered. */}
        {index > 0 ? (
          <Pressable
            onPress={() => move(entry.id, -1)}
            accessibilityRole="button"
            accessibilityLabel={`Move ${def.name} up`}
            hitSlop={4}
            style={moveBtn}
          >
            <Text style={S(900, 16, { color: c.mut })}>↑</Text>
          </Pressable>
        ) : null}
        {index < count - 1 ? (
          <Pressable
            onPress={() => move(entry.id, 1)}
            accessibilityRole="button"
            accessibilityLabel={`Move ${def.name} down`}
            hitSlop={4}
            style={moveBtn}
          >
            <Text style={S(900, 16, { color: c.mut })}>↓</Text>
          </Pressable>
        ) : null}
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
                label="KG"
                value={String(entry.targetWeightKg)}
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

      {perSet && entry.setTargets ? (
        <View style={styles.setList}>
          {entry.setTargets.map((st, i) => (
            <View key={i} style={styles.setRow}>
              <Text style={[S(900, 14, { color: c.mut }), styles.setNum]}>
                Set {i + 1}
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

      <View style={styles.rowFooter}>
        <Pressable
          onPress={() => togglePerSet(entry.id, !perSet)}
          accessibilityRole="switch"
          accessibilityState={{ checked: perSet }}
          accessibilityLabel={`Per-set targets for ${def.name}`}
          hitSlop={10}
          style={styles.toggle}
        >
          <View
            style={[
              styles.check,
              perSet
                ? { backgroundColor: c.lift, borderColor: c.lift }
                : { borderColor: c.hair },
            ]}
          >
            {perSet ? (
              <Icon name="check" size={14} color={c.onAccent} strokeWidth={3} />
            ) : null}
          </View>
          <Text style={S(900, 14, { color: c.acc })}>
            Different target per set
          </Text>
        </Pressable>
        <Pressable
          onPress={() => remove(entry.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${def.name}`}
          hitSlop={10}
        >
          <Text style={S(900, 14, { color: c.red })}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Build (or edit) a workout (ADR-007 "Build workout" artboard): name it, pick
 * strength vs core (how it's saved to Health Connect), add exercises from the
 * catalog as chunky cards with soft −/+ wells for sets/reps/kg/rest (or a row
 * per set when per-set targets are on), reorder them, then Save to keep it or
 * Start to run it now (ad-hoc runs simply aren't saved). All draft state lives
 * in the strength store, so the picker modal can append to it without route
 * params.
 */
export function WorkoutBuilderScreen({ navigation }: ScreenProps) {
  const c = useTheme().colors;
  const draft = useStrengthStore(s => s.draft);
  const setName = useStrengthStore(s => s.setDraftName);
  const setKind = useStrengthStore(s => s.setDraftKind);
  const kind = draft?.kind ?? 'strength';

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
      <Text style={[S(900, 16, { color: c.ink }), styles.fieldLabel]}>
        Name
      </Text>
      <TextInput
        value={draft?.name ?? ''}
        onChangeText={setName}
        placeholder="e.g. Upper body A"
        placeholderTextColor={c.fnt}
        accessibilityLabel="Workout name"
        style={[S(800, 18, { color: c.ink }), inputStyle(c), styles.nameInput]}
      />
      {/* Strength vs core: hand-rolled rather than SegmentedRow so the chosen
          tile takes the lift violet (SegmentedRow is the accent blue) and the
          long accessibility labels the tests rely on stay. */}
      <View style={styles.typeRow}>
        {(['strength', 'core'] as const).map(k => {
          const on = kind === k;
          return (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                k === 'strength' ? 'Strength session' : 'Core session'
              }
              style={[
                styles.typeBtn,
                {
                  borderColor: on ? c.lift : c.hair,
                  backgroundColor: on ? c.liftTint : c.card,
                },
              ]}
            >
              <Text style={S(900, 16, { color: on ? c.liftText : c.ink })}>
                {k === 'strength' ? 'Strength' : 'Core'}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[S(700, 14, { lh: 19, color: c.fnt }), styles.typeHint]}>
        {kind === 'core'
          ? 'Saved to Health Connect as an exercise class.'
          : 'Saved to Health Connect as strength training.'}
      </Text>

      <View style={styles.sectionHead}>
        <Text style={S(900, 22, { lh: 28, color: c.ink })}>Exercises</Text>
        <Text style={S(800, 15, { color: c.fnt })}>
          {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
        </Text>
      </View>

      {exercises.length === 0 ? (
        <View style={[chunky(c), styles.emptyCard]}>
          <Text style={S(700, 15, { lh: 21, color: c.mut })}>
            No exercises yet. Add movements from the catalog below.
          </Text>
        </View>
      ) : (
        exercises.map((e, i) => (
          <BuilderRow key={e.id} entry={e} index={i} count={exercises.length} />
        ))
      )}

      <BriefButton
        label="+ Add exercise"
        accessibilityLabel="Add exercise"
        kind="dashed"
        tone="lift"
        size={15}
        fontSize={16}
        onPress={() => navigation.navigate('ExercisePicker')}
        style={styles.addExercise}
      />

      <View style={styles.footer}>
        <BriefButton
          label="Save"
          kind="outline"
          size={15}
          fontSize={17}
          disabled={!canRun}
          onPress={onSave}
          style={styles.footerBtn}
          accessibilityLabel="Save workout"
        />
        <BriefButton
          label="Start"
          tone="lift"
          size={15}
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
  fieldLabel: { marginTop: 12 },
  nameInput: { marginTop: 8, borderRadius: 16 },
  typeRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  typeBtn: {
    flex: 1,
    height: 50,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeHint: { marginTop: 10 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 26,
  },
  emptyCard: { padding: 18, marginTop: 14 },
  row: { padding: 16, marginTop: 14, gap: 14 },
  rowHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowMain: { flex: 1, minWidth: 0 },
  moveBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Two wells per row (the design's 2-column grid); flexBasis just under half
  // so the gap fits, flexGrow so an odd last well fills its row.
  adjust: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    padding: 8,
    borderRadius: 14,
    flexBasis: '45%',
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  adjustVal: { flex: 1, minWidth: 0, alignItems: 'center' },
  key: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setList: { gap: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setNum: { width: 46, flexShrink: 0 },
  addExercise: { marginTop: 16 },
  footer: { flexDirection: 'row', gap: 10, marginTop: 18 },
  footerBtn: { flex: 1 },
});
