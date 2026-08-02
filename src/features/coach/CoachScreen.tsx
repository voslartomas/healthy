import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/Icon';
import { PROVIDERS, useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { monoFont, radii, useTheme } from '../../theme/theme';
import { CoachError, CoachMessage, runCoach } from './aiClient';
import { makeFoodToolset } from './foodTool';

const GREETING =
  "Hey! Tell me what you ate and I'll log the calories and macros to Google Health for you — e.g. \u201cBreakfast: 4 eggs and 2 slices of toast.\u201d You can also ask me to tweak something I just logged.";

/** A rendered chat line. `system` lines are local notes (log confirmations,
 * errors) — shown to the user but never sent back to the model as history. */
interface ChatBubble {
  id: string;
  from: 'ai' | 'me' | 'system';
  text: string;
}

/** Build the coach system prompt, grounding it in today's logged nutrition so
 * it can answer "how much protein left?" without a tool call. */
function buildSystemPrompt(): string {
  const n = useHealthStore.getState().snapshot.nutrition;
  const eaten = n
    ? `So far today the user has logged ${Math.round(n.eaten)} kcal ` +
      `(${Math.round(n.proteinG)}g protein, ${Math.round(n.carbsG)}g carbs, ${Math.round(n.fatG)}g fat).`
    : 'The user has not logged any food yet today.';
  return [
    'You are the in-app nutrition coach for a health-tracking app.',
    'Help the user log meals and understand their calories and macros.',
    'When the user says what they ate, estimate calories and macros and call the log_food tool to save it to Google Health, then confirm what you logged in plain language with the numbers.',
    'If the user wants to change or remove a meal, call list_food_log to find its id, then update_food_log (with corrected full values) or delete_food_log using that id.',
    'If the user asks to save or remember a food for quick re-use later, call save_common_food (this saves it to their Common Foods list but does not log it for today).',
    'Keep replies short and concrete. Use grams for macros and kcal for energy.',
    eaten,
  ].join(' ');
}

/** AI coach chat: a live, provider-backed conversation that can log food to
 * Google Health via tool calls. Provider, model, and key come from Settings. */
export function CoachScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const provider = useAppStore(s => s.aiProvider);
  // Offset the keyboard-avoiding view by the tab bar so the composer sits right
  // above the keyboard. Context is null when rendered outside a tab navigator
  // (e.g. in tests), so fall back to 0.
  const tabBarHeight = useContext(BottomTabBarHeightContext) ?? 0;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const idRef = useRef(1);
  const [messages, setMessages] = useState<ChatBubble[]>([
    { id: '0', from: 'ai', text: GREETING },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = useCallback(
    () =>
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true }),
      ),
    [],
  );

  // Lift the composer above the keyboard. Expo SDK 54+ forces edge-to-edge on
  // Android, where `adjustResize` no longer shrinks the RN view, so RN's
  // KeyboardAvoidingView can't detect the keyboard — we track its height and
  // pad the screen bottom ourselves (minus the tab bar it already covers).
  useEffect(() => {
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvt, e => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      scrollToEnd();
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [scrollToEnd]);

  const addBubble = useCallback((from: ChatBubble['from'], text: string) => {
    setMessages(prev => [...prev, { id: String(idRef.current++), from, text }]);
  }, []);

  const send = useCallback(async () => {
    const value = input.trim();
    if (!value || busy) return;
    setInput('');

    // Snapshot the model-visible history (user + ai only) before this message.
    const history: CoachMessage[] = messages
      .filter(m => m.from === 'ai' || m.from === 'me')
      .map(m => ({
        role: m.from === 'me' ? 'user' : 'assistant',
        content: m.text,
      }));

    addBubble('me', value);
    setBusy(true);
    scrollToEnd();

    const { apiKey, model, aiProvider } = useAppStore.getState();
    const toolset = makeFoodToolset(summary => addBubble('system', summary));

    try {
      const reply = await runCoach(
        { provider: aiProvider, model, apiKey },
        {
          system: buildSystemPrompt(),
          history: [...history, { role: 'user', content: value }],
          tools: toolset.tools,
          exec: toolset.exec,
        },
      );
      if (reply) addBubble('ai', reply);
    } catch (err) {
      const msg =
        err instanceof CoachError
          ? err.message
          : 'Something went wrong reaching the AI provider. Check your connection and try again.';
      addBubble('system', msg);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }, [input, busy, messages, addBubble, scrollToEnd]);

  const liftBy = Math.max(keyboardHeight - tabBarHeight, 0);

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: t.colors.bg, paddingBottom: liftBy },
      ]}
    >
      <View
        style={[
          styles.head,
          { borderBottomColor: t.colors.border, paddingTop: insets.top + 8 },
        ]}
      >
        <View style={[styles.cava, { backgroundColor: t.colors.accent }]}>
          <Icon name="sparkle" size={22} color={t.colors.onAccent} />
        </View>
        <View>
          <Text style={[styles.name, { color: t.colors.fg }]}>Coach</Text>
          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, { backgroundColor: t.colors.rec }]}
            />
            <Text style={[styles.status, { color: t.colors.rec }]}>
              Nutrition coach · {PROVIDERS[provider].name}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="interactive"
        onContentSizeChange={scrollToEnd}
      >
        {messages.map(m =>
          m.from === 'system' ? (
            <SystemNote key={m.id} text={m.text} />
          ) : (
            <Bubble key={m.id} from={m.from} text={m.text} />
          ),
        )}
        {busy && (
          <View
            style={[
              styles.bubble,
              styles.ai,
              styles.typing,
              { backgroundColor: t.colors.surface, borderColor: t.colors.border },
            ]}
            accessibilityRole="text"
            accessibilityLabel="Coach is typing"
          >
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[styles.typingDot, { backgroundColor: t.colors.faint }]}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.composer,
          {
            borderTopColor: t.colors.border,
            backgroundColor: t.colors.surface,
          },
        ]}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={send}
          placeholder="Tell coach what you ate…"
          placeholderTextColor={t.colors.faint}
          accessibilityLabel="Message your coach"
          returnKeyType="send"
          editable={!busy}
          multiline
          style={[
            styles.input,
            { backgroundColor: t.colors.surface2, color: t.colors.fg },
          ]}
        />
        <Pressable
          onPress={send}
          disabled={!input.trim() || busy}
          accessibilityLabel="Send"
          style={[
            styles.cbtn,
            { backgroundColor: t.colors.accent },
            (!input.trim() || busy) && { opacity: 0.45 },
          ]}
        >
          <Icon name="send" size={19} color={t.colors.onAccent} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}

function Bubble({ from, text }: { from: 'ai' | 'me'; text: string }) {
  const t = useTheme();
  const mine = from === 'me';
  return (
    <View
      style={[
        styles.bubble,
        mine ? styles.me : styles.ai,
        mine
          ? { backgroundColor: t.colors.accent }
          : {
              backgroundColor: t.colors.surface,
              borderColor: t.colors.border,
              borderWidth: StyleSheet.hairlineWidth,
            },
      ]}
    >
      <Text
        selectable
        style={[
          styles.bubbleText,
          { color: mine ? t.colors.onAccent : t.colors.fg },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

/** A centered, muted note for log confirmations and errors. */
function SystemNote({ text }: { text: string }) {
  const t = useTheme();
  return (
    <View style={[styles.sysNote, { backgroundColor: t.colors.surface2 }]}>
      <Text selectable style={[styles.sysText, { color: t.colors.muted }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cava: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 15, fontWeight: '800' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 1,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  status: { fontSize: 11.5, fontWeight: '700' },
  chat: { flex: 1 },
  chatContent: { padding: 18, gap: 10 },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  ai: { alignSelf: 'flex-start', borderBottomLeftRadius: 5 },
  me: { alignSelf: 'flex-end', borderBottomRightRadius: 5 },
  bubbleText: { fontSize: 13.5, lineHeight: 20 },
  sysNote: {
    alignSelf: 'center',
    maxWidth: '90%',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sysText: {
    fontFamily: monoFont,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  typing: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingVertical: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  cbtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: radii.pill,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 14,
  },
});
