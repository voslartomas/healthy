import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { HeaderHeightContext } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import { M, S } from '../../components/brief';
import { PROVIDERS, useAppStore } from '../../state/useAppStore';
import { useHealthStore } from '../../state/useHealthStore';
import { useTheme } from '../../theme/theme';
import { CoachError, CoachMessage, runCoach } from './aiClient';
import { makeFoodToolset } from './foodTool';

const GREETING =
  "Hey! Tell me what you ate and I'll log the calories and macros to Google Health for you — e.g. “Breakfast: 4 eggs and 2 slices of toast.” You can also ask me to tweak something I just logged.";

interface ChatBubble {
  id: string;
  from: 'ai' | 'me' | 'system';
  text: string;
}

/** Build the coach system prompt, grounding it in today's logged nutrition. */
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

/** AI coach chat, presented as a native modal screen. A live, provider-backed
 * conversation that logs food to Google Health via tool calls. Provider, model
 * and key come from Setup. */
export function CoachScreen(_props: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  // Read the context directly (not useHeaderHeight, which throws outside a
  // navigator) so the screen also renders in isolation under tests.
  const headerHeight = React.useContext(HeaderHeightContext) ?? 0;
  const provider = useAppStore(s => s.aiProvider);

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

  const addBubble = useCallback((from: ChatBubble['from'], text: string) => {
    setMessages(prev => [...prev, { id: String(idRef.current++), from, text }]);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || busy) return;
      setInput('');

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
    },
    [busy, messages, addBubble, scrollToEnd],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
      style={[styles.root, { backgroundColor: c.bg }]}
    >
      <View style={[styles.status, { borderBottomColor: c.hair }]}>
        <Sparkle color={c.acc} size={14} />
        <Text numberOfLines={1} style={M(600, 9, { ls: 1, color: c.fnt })}>
          {PROVIDERS[provider].name.toUpperCase()}
        </Text>
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
            <View key={m.id} style={styles.sysNote}>
              <Text
                selectable
                style={M(700, 11, { color: c.mut, align: 'center' })}
              >
                {m.text}
              </Text>
            </View>
          ) : (
            <View
              key={m.id}
              style={[
                styles.bubble,
                m.from === 'me'
                  ? {
                      alignSelf: 'flex-end',
                      backgroundColor: c.ink,
                      borderBottomRightRadius: 4,
                    }
                  : {
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: c.hair,
                      borderBottomLeftRadius: 4,
                    },
              ]}
            >
              <Text
                selectable
                style={S(400, 13, {
                  lh: 19,
                  color: m.from === 'me' ? c.inv : c.ink,
                })}
              >
                {m.text}
              </Text>
            </View>
          ),
        )}
        {busy ? (
          <View
            style={[
              styles.bubble,
              styles.typing,
              { alignSelf: 'flex-start', borderColor: c.hair },
            ]}
          >
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[styles.typingDot, { backgroundColor: c.fnt }]}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.composer,
          { borderTopColor: c.hair, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          placeholder="Tell coach what you ate…"
          placeholderTextColor={c.fnt}
          accessibilityLabel="Message your coach"
          returnKeyType="send"
          editable={!busy}
          style={[
            styles.input,
            S(500, 13.5, { color: c.ink }),
            { borderColor: c.hair },
          ]}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!input.trim() || busy}
          accessibilityRole="button"
          accessibilityLabel="Send"
          style={[
            styles.send,
            {
              backgroundColor: c.ink,
              opacity: !input.trim() || busy ? 0.45 : 1,
            },
          ]}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path
              d="M4 12l16-8-6 8 6 8z"
              fill="none"
              stroke={c.inv}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/** A soft four-point AI sparkle (concave sides) — the coach mark. */
export function Sparkle({
  color,
  size = 16,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3c1 5 3 7 8 9-5 2-7 4-8 9-1-5-3-7-8-9 5-2 7-4 8-9z"
        fill={color}
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  chat: { flex: 1 },
  chatContent: { padding: 20, gap: 10 },
  bubble: {
    maxWidth: '82%',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  sysNote: {
    alignSelf: 'center',
    maxWidth: '90%',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  typing: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingVertical: 15,
    borderWidth: 1,
  },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
