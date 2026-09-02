import React from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TextInput,
  TextInputEndEditingEventData,
  Pressable,
  View,
} from 'react-native';

import { M, S, Card } from '../../components/brief';
import { updateProfile } from '../../state/profileService';
import { ageFromDob, Sex, useProfileStore } from '../../state/useProfileStore';
import { useTheme } from '../../theme/theme';

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

const SEXES: Sex[] = ['male', 'female', 'other'];

/**
 * Profile inputs (Setup tab): date of birth, height, weight, and sex. Age (from
 * the birth date) is what lets the app turn workout heart-rate into training
 * zones — Health Connect can't supply it — so the copy explains why we ask. Each
 * field is optional and persisted independently to SQLite via
 * {@link updateProfile}; a blank field clears the value.
 *
 * The text inputs are UNCONTROLLED (`defaultValue` + a `key` that changes when
 * the profile hydrates from SQLite), so we never re-seed React state inside an
 * effect — the value is read straight off the end-editing event. Sex reads the
 * store directly.
 */
export function ProfileSection() {
  const t = useTheme();
  const c = t.colors;
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

  const inputStyle = {
    ...S(600, 14, { color: c.ink }),
    borderWidth: 1,
    borderColor: c.hair,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    // The design fills fields with the page ground so they read as insets in
    // the card rather than as another raised surface.
    backgroundColor: c.bg,
  } as const;

  return (
    <Card title="Profile">
      <Text style={[M(600, 10.5, { color: c.fnt }), styles.note]}>
        USED TO TURN WORKOUT HEART-RATE INTO TRAINING ZONES. ALL OPTIONAL ·
        STAYS ON YOUR PHONE.
      </Text>

      <Field
        label={age != null ? `DATE OF BIRTH · AGE ${age}` : 'DATE OF BIRTH'}
      >
        <TextInput
          key={`dob:${seed}`}
          defaultValue={dobToInput(profile.dateOfBirth)}
          onEndEditing={onDob}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={c.fnt}
          autoCapitalize="none"
          accessibilityLabel="Date of birth"
          style={[inputStyle, { fontFamily: M(600, 14).fontFamily }]}
        />
      </Field>

      <View style={styles.row}>
        <Field label="HEIGHT (CM)" style={styles.half}>
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
            style={[inputStyle, { fontFamily: M(600, 14).fontFamily }]}
          />
        </Field>
        <Field label="WEIGHT (KG)" style={styles.half}>
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
            style={[inputStyle, { fontFamily: M(600, 14).fontFamily }]}
          />
        </Field>
      </View>

      <Field label="SEX">
        <View style={styles.sexRow}>
          {SEXES.map(s => {
            const on = profile.sex === s;
            return (
              <Pressable
                key={s}
                onPress={() => void updateProfile({ sex: on ? null : s })}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[
                  styles.sexBtn,
                  {
                    borderColor: on ? c.ink : c.hair,
                    backgroundColor: on ? c.ink : 'transparent',
                  },
                ]}
              >
                <Text
                  style={M(700, 11, { ls: 0.5, color: on ? c.inv : c.mut })}
                >
                  {s.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Field>
    </Card>
  );
}

/** One labelled field row in the brief style. */
function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  const t = useTheme();
  const c = t.colors;
  return (
    <View style={[styles.field, style]}>
      <Text style={[M(700, 9.5, { ls: 1, color: c.fnt }), styles.fieldLabel]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 12, lineHeight: 16 },
  field: { marginTop: 14 },
  fieldLabel: { marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  sexRow: { flexDirection: 'row', gap: 8 },
  sexBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
  },
});
