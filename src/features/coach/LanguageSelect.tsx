import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { M, S } from '../../components/brief';
import { useAppStore } from '../../state/useAppStore';
import { useTheme } from '../../theme/theme';
import { COACH_LANGUAGES, languageLabel } from './languages';

/**
 * The coach's reply-language selector: a field showing the current language that
 * opens a bottom-sheet list of every Gemma-supported language. Writes to
 * {@link useAppStore.coachLanguage}, which the coach + daily-brief prompts read.
 */
export function LanguageSelect() {
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  const lang = useAppStore(s => s.coachLanguage);
  const setLang = useAppStore(s => s.setCoachLanguage);
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Text style={[M(700, 10, { ls: 1.6, color: c.fnt }), styles.label]}>
        LANGUAGE
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Coach language"
        style={[styles.field, { borderColor: c.hair }]}
      >
        <Text style={S(600, 13.5, { color: c.ink })}>
          {languageLabel(lang)}
        </Text>
        <Text style={M(700, 13, { color: c.fnt })}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[styles.backdrop, { backgroundColor: c.scrim }]}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close language picker"
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: c.bg,
              borderTopColor: c.hair,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <View style={styles.sheetHead}>
            <Text style={M(700, 9, { ls: 1.4, color: c.fnt })}>
              COACH LANGUAGE
            </Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={M(700, 11, { ls: 1, color: c.acc })}>DONE</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {COACH_LANGUAGES.map(l => {
              const on = l.name === lang;
              return (
                <Pressable
                  key={l.name}
                  onPress={() => {
                    setLang(l.name);
                    setOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.row, { borderBottomColor: c.hair }]}
                >
                  <View style={styles.rowText}>
                    <Text
                      style={S(on ? 600 : 500, 14, {
                        color: on ? c.ink : c.mut,
                      })}
                    >
                      {l.native}
                    </Text>
                    {l.native !== l.name ? (
                      <Text style={M(600, 9, { ls: 0.5, color: c.fnt })}>
                        {l.name.toUpperCase()}
                      </Text>
                    ) : null}
                  </View>
                  {on ? (
                    <Text style={M(700, 14, { color: c.acc })}>✓</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 16, marginBottom: 8 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  backdrop: { flex: 1, opacity: 0.35 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  listContent: { paddingBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
});
