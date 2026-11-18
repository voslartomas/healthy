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
import { chunky, inputStyle, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { FoodEntryInput, healthSourceName } from '../../health';
import {
  CommonFood,
  useCommonFoodsStore,
} from '../../state/useCommonFoodsStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import { PortionSheet } from './PortionSheet';

/** A compact macro/serving descriptor line for a saved food ("12P · 3C"). */
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
    return `Per ${f.servingSize ?? 1} ${f.servingUnit}`;
  }
  return 'Calories only';
}

/**
 * The full common-foods library, presented as a native modal from the Food
 * screen's "See all" link. Search the saved foods and tap one to pick a
 * portion and log it — the same flow the Quick add tiles use, but over the
 * whole list instead of the eight most-recent shown inline.
 *
 * Friendly layout (ADR-007): a soft search well, then each food as a chunky
 * row with its kcal and an orange "+" — the Quick add tile, stretched.
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
          `Connect ${healthSourceName()} in Me to save food entries.`,
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
            actionLabel="Log"
            onConfirm={entry => {
              const food = portionFood;
              const input: FoodEntryInput = {
                name: entry.name,
                kcal: entry.kcal,
              };
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
          <View style={styles.searchWrap}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search saved foods"
              placeholderTextColor={c.fnt}
              autoCorrect={false}
              accessibilityLabel="Search saved foods"
              style={[inputStyle(c), S(800, 17, { color: c.ink })]}
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
              <Text
                style={[S(700, 15, { lh: 21, color: c.mut }), styles.empty]}
              >
                {foods.length === 0
                  ? 'No saved foods yet. Save one on the Food screen to tap-log it later.'
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
                    chunky(c, 18),
                    styles.row,
                    { opacity: busy ? 0.6 : 1 },
                  ]}
                >
                  <View style={styles.rowMain}>
                    <Text
                      numberOfLines={1}
                      style={S(900, 16, { color: c.ink })}
                    >
                      {f.name}
                    </Text>
                    <Text style={S(700, 14, { color: c.mut })}>
                      {subLine(f)}
                    </Text>
                  </View>
                  <Text style={S(900, 16, { color: c.ink })}>
                    {f.kcal}
                    <Text style={S(800, 13, { color: c.fnt })}> kcal</Text>
                  </Text>
                  <View style={[styles.plus, { backgroundColor: c.foodTint }]}>
                    <Icon
                      name="plus"
                      size={20}
                      color={c.foodText}
                      strokeWidth={3}
                    />
                  </View>
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
  },
  list: { flex: 1 },
  empty: { marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 12,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  plus: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionWrap: { paddingHorizontal: 20, paddingTop: 8 },
});
