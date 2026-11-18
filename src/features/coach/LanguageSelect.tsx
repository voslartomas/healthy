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

import { chunky, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import { useAppStore } from '../../state/useAppStore';
import { useTheme } from '../../theme/theme';
import { COACH_LANGUAGES, languageLabel } from './languages';

/**
 * The coach's reply-language selector: a chunky "Coach language  Automatic ›"
 * row (Me tab) that opens a bottom-sheet list of the coach's reply
 * languages (see languages.ts on how well the OS models cover them). Writes to {@link useAppStore.coachLanguage}, which the coach +
 * daily-brief prompts read.
 */
export function LanguageSelect() {
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  const lang = useAppStore(s => s.coachLanguage);
  const setLang = useAppStore(s => s.setCoachLanguage);
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Coach language"
        style={[chunky(c, 18), styles.field]}
      >
        <Text style={S(900, 16, { color: c.ink })}>Coach language</Text>
        <Text style={S(800, 15, { color: c.mut })}>
          {`${languageLabel(lang)} ›`}
        </Text>
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
              backgroundColor: c.card,
              borderColor: c.hair,
              paddingBottom: insets.bottom + 8,
            },
          ]}
        >
          <View style={styles.sheetHead}>
            <Text style={S(900, 20, { lh: 25, color: c.ink })}>
              Coach language
            </Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Done"
              style={styles.done}
            >
              <Text style={S(900, 16, { color: c.acc })}>Done</Text>
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
                  accessibilityLabel={l.name}
                  style={[
                    styles.row,
                    {
                      backgroundColor: on ? c.accTint : 'transparent',
                      borderColor: on ? c.accSolid : 'transparent',
                    },
                  ]}
                >
                  <View style={styles.rowText}>
                    <Text style={S(900, 16, { color: on ? c.acc : c.ink })}>
                      {l.native}
                    </Text>
                    {l.native !== l.name ? (
                      <Text style={S(700, 13, { color: c.fnt })}>{l.name}</Text>
                    ) : null}
                  </View>
                  {on ? (
                    <Icon
                      name="check"
                      size={20}
                      color={c.acc}
                      strokeWidth={3}
                    />
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
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
    minHeight: 56,
    paddingHorizontal: 16,
  },
  // The scrim colour already carries its own alpha; no extra opacity here.
  backdrop: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '72%',
    borderWidth: 2,
    borderBottomWidth: 0,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  done: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  listContent: { paddingBottom: 12, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
  },
  rowText: { flex: 1, minWidth: 0 },
});
