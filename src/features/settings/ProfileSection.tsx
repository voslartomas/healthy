import React from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputEndEditingEventData,
  View,
} from 'react-native';

import { inputStyle, S, SegmentedRow } from '../../components/brief';
import { updateProfile } from '../../state/profileService';
import { ageFromDob, Sex, useProfileStore } from '../../state/useProfileStore';
import { useTheme } from '../../theme/theme';
import { SectionHead } from './SectionHead';

/** Format an epoch-ms birth date as the YYYY-MM-DD the input expects. */
function dobToInput(ms: number | null): string {
  if (ms == null) return '';
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Parse a YYYY-MM-DD birth date to local-midnight epoch ms, or null. */
function parseDob(s: string): number | null {
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (
    dt.getFullYear() !== y ||
    dt.getMonth() !== mo - 1 ||
    dt.getDate() !== d
  ) {
    return null;
  }
  dt.setHours(0, 0, 0, 0);
  return dt.getTime();
}

function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const SEX_OPTIONS = [
  { key: 'male' as const, label: 'Male' },
  { key: 'female' as const, label: 'Female' },
  { key: 'other' as const, label: 'Other' },
];

/**
 * Profile inputs ("About you" on the Me tab): date of birth, height, weight, and
 * sex. Age (from the birth date) is what lets the app turn workout heart-rate
 * into training zones — Health Connect can't supply it — so the copy explains
 * why we ask. Each field is optional and persisted independently to SQLite via
 * {@link updateProfile}; a blank field clears the value.
 *
 * The text inputs are UNCONTROLLED (`defaultValue` + a `key` that changes when
 * the profile hydrates from SQLite), so we never re-seed React state inside an
 * effect — the value is read straight off the end-editing event. Sex reads the
 * store directly, and tapping the chosen tile again clears it (`allowDeselect`).
 */
export function ProfileSection() {
  const c = useTheme().colors;
  const profile = useProfileStore(s => s.profile);
  const hydrated = useProfileStore(s => s.hydrated);
  const age = ageFromDob(profile.dateOfBirth);

  // Remount the uncontrolled inputs once the persisted profile has loaded so
  // their defaultValues reflect it (keyed on the loaded values).
  const seed = `${hydrated}:${profile.dateOfBirth}:${profile.heightCm}:${profile.weightKg}`;

  const onDob = (e: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
    const text = e.nativeEvent.text;
    void updateProfile({ dateOfBirth: text.trim() ? parseDob(text) : null });
  };
  const onHeight = (e: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
    const text = e.nativeEvent.text;
    void updateProfile({ heightCm: text.trim() ? parseNum(text) : null });
  };
  const onWeight = (e: NativeSyntheticEvent<TextInputEndEditingEventData>) => {
    const text = e.nativeEvent.text;
    void updateProfile({ weightKg: text.trim() ? parseNum(text) : null });
  };

  const field = [inputStyle(c), S(800, 17, { color: c.ink }), styles.input];

  return (
    <>
      <SectionHead
        title="About you"
        sub="Optional. Turns workout heart rate into training zones, and stays on your phone."
      />

      <Field
        label={age != null ? `Date of birth · age ${age}` : 'Date of birth'}
      >
        <TextInput
          key={`dob:${seed}`}
          defaultValue={dobToInput(profile.dateOfBirth)}
          onEndEditing={onDob}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.fnt}
          autoCapitalize="none"
          accessibilityLabel="Date of birth"
          style={field}
        />
      </Field>

      <View style={styles.row}>
        <Field label="Height (cm)" style={styles.half}>
          <TextInput
            key={`h:${seed}`}
            defaultValue={
              profile.heightCm != null ? String(profile.heightCm) : ''
            }
            onEndEditing={onHeight}
            placeholder="cm"
            placeholderTextColor={c.fnt}
            keyboardType="number-pad"
            accessibilityLabel="Height in centimeters"
            style={field}
          />
        </Field>
        <Field label="Weight (kg)" style={styles.half}>
          <TextInput
            key={`w:${seed}`}
            defaultValue={
              profile.weightKg != null ? String(profile.weightKg) : ''
            }
            onEndEditing={onWeight}
            placeholder="kg"
            placeholderTextColor={c.fnt}
            keyboardType="numeric"
            accessibilityLabel="Weight in kilograms"
            style={field}
          />
        </Field>
      </View>

      <Field label="Sex">
        <SegmentedRow<Sex>
          options={SEX_OPTIONS}
          value={profile.sex ?? null}
          onChange={sex => void updateProfile({ sex })}
          allowDeselect
        />
      </Field>
    </>
  );
}

/** One labelled field: a bold sentence-case label over its control. */
function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  const c = useTheme().colors;
  return (
    <View style={[styles.field, style]}>
      <Text style={[S(900, 14, { color: c.mut }), styles.fieldLabel]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: 12 },
  fieldLabel: { marginBottom: 6 },
  // The artboard's 50px field: the shared well's 13px padding plus the 17px
  // type's line box lands there without a fixed height (which would clip on
  // large accessibility text sizes).
  input: { paddingVertical: 12 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
});
