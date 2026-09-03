import React from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenProps } from '../../app/navigation/types';
import { inputStyle, M, S } from '../../components/brief';
import { FoodEntryInput, healthSourceName } from '../../health';
import { CommonFood, useCommonFoodsStore } from '../../state/useCommonFoodsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import { PortionSheet } from './PortionSheet';

/** A compact macro/serving descriptor line for a saved food. */
function subLine(f: CommonFood): string {
  const macros = [
    f.proteinG != null ? `${Math.round(f.proteinG)}P` : null,
    f.carbsG != null ? `${Math.round(f.carbsG)}C` : null,
    f.fatG != null ? `${Math.round(f.fatG)}F` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  if (macros) return macros;
  if (f.servingUnit && f.servingUnit !== 'serving') {
    return `PER ${f.servingSize ?? 1} ${f.servingUnit.toUpperCase()}`;
  }
  return 'CALORIES ONLY';
}

/**
 * The full common-foods library, presented as a native modal from the Fuel
 * screen's "MORE" affordance. Search the saved foods and tap one to pick a
 * portion and log it — the same flow the Fuel chips use, but over the whole
 * list instead of the eight most-recent shown inline.
 */
export function FoodsLibraryScreen(_props: ScreenProps) {
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  const foods = useCommonFoodsStore(s => s.foods);
  const logFood = useHealthStore(s => s.logFood);

  const [query, setQuery] = React.useState('');
  const [portionFood, setPortionFood] = React.useState<CommonFood | null>(null);
  const [busy, setBusy] = React.useState(false);

  const q = query.trim().toLowerCase();
  const results = q
    ? foods.filter(f => f.name.toLowerCase().includes(q))
    : foods;

  const log = React.useCallback(
    async (food: CommonFood, entry: FoodEntryInput) => {
      setBusy(true);
      const ok = await logFood(entry);
      setBusy(false);
      setPortionFood(null);
      if (!ok) {
        Alert.alert(
          'Not logged',
          `Connect ${healthSourceName()} in Setup to save food entries.`,
        );
      }
    },
    [logFood],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { backgroundColor: c.bg }]}
    >
      {portionFood ? (
        <View style={styles.portionWrap}>
          <PortionSheet
            food={portionFood}
            actionLabel="LOG"
            onConfirm={entry => {
              const food = portionFood;
              const input: FoodEntryInput = { name: entry.name, kcal: entry.kcal };
              if (entry.proteinG != null) input.proteinG = entry.proteinG;
              if (entry.carbsG != null) input.carbsG = entry.carbsG;
              if (entry.fatG != null) input.fatG = entry.fatG;
              if (food.mealType) input.mealType = food.mealType;
              void log(food, input);
            }}
            onCancel={() => setPortionFood(null)}
          />
        </View>
      ) : (
        <>
          <View style={[styles.searchWrap, { borderBottomColor: c.hair }]}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search saved foods"
              placeholderTextColor={c.fnt}
              autoCorrect={false}
              style={[S(600, 15, { color: c.ink }), inputStyle(c)]}
            />
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 4,
              paddingBottom: insets.bottom + 40,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {results.length === 0 ? (
              <Text style={[S(600, 13, { lh: 19, color: c.mut }), styles.empty]}>
                {foods.length === 0
                  ? 'No saved foods yet. Add one on the Fuel screen to tap-log it later.'
                  : 'No saved foods match.'}
              </Text>
            ) : (
              results.map(f => (
                <Pressable
                  key={f.id}
                  onPress={() => setPortionFood(f)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Log ${f.name}`}
                  style={[
                    styles.row,
                    { borderBottomColor: c.hair, opacity: busy ? 0.6 : 1 },
                  ]}
                >
                  <View style={styles.rowMain}>
                    <Text
                      numberOfLines={1}
                      style={S(600, 14, { color: c.ink })}
                    >
                      {f.name}
                    </Text>
                    <Text style={[M(600, 9.5, { ls: 0.6, color: c.fnt }), styles.sub]}>
                      {subLine(f)}
                    </Text>
                  </View>
                  <Text style={M(700, 12, { color: c.ink })}>{f.kcal}</Text>
                  <Text style={M(700, 18, { color: c.acc })}>＋</Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  list: { flex: 1 },
  empty: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 3 },
  sub: {},
  portionWrap: { paddingHorizontal: 20, paddingTop: 8 },
});
