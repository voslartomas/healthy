import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
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
import {
  appendMessage,
  createConversation,
  GREETING,
} from '../../state/conversationsService';
import { PROVIDERS, useAppStore } from '../../state/useAppStore';
import {
  currentConversation,
  StoredMessage,
  useConversationsStore,
} from '../../state/useConversationsStore';
import { useTheme } from '../../theme/theme';
import { CoachError, CoachMessage, runCoach } from './aiClient';
import { ConversationDrawer } from './ConversationDrawer';
import { buildDataContext } from './dataContext';
import { makeFoodToolset } from './foodTool';
import { languageDirective } from './languages';

/** Format a model response time, e.g. "820 MS" / "3.4 S". */
function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} MS` : `${(ms / 1000).toFixed(1)} S`;
}

/** Build the coach system prompt, grounding it in the user's live health data
 * (recovery, body, sleep, activity, nutrition, goals) so it can both log food
 * and talk about how the user is doing. */
function buildSystemPrompt(): string {
  const instructions = [
    'You are the in-app health & nutrition coach for a health-tracking app.',
    languageDirective(useAppStore.getState().coachLanguage),
    'Chat naturally: answer the user’s questions about their recovery, sleep, activity, body metrics, nutrition, and goals, and give practical advice grounded in their real numbers below.',
    'Only change the food log when the user EXPLICITLY asks you to — e.g. “log…”, “add…”, “track…”, “change…”, “remove…”, “delete…”, “save…”. Do not log food just because the user mentions eating it or asks a question.',
    'To log a meal, estimate its calories and macros and call log_food, then confirm what you logged with the numbers.',
    'To change or remove a meal, call list_food_log to find its id, then update_food_log (with corrected full values) or delete_food_log using that id.',
    'To save a food for quick re-use later (not log it for today), call save_common_food.',
    'If the user is just chatting or asking a question, reply in words and do not call any tool.',
    'Keep replies short and concrete. Use grams for macros and kcal for energy. Do not invent numbers that are not in the data.',
  ].join(' ');
  return `${instructions}\n\n=== The user's current health data ===\n${buildDataContext()}`;
}

/** AI coach chat, presented as a native modal screen. A live, provider-backed
 * conversation that logs food to Google Health via tool calls. Provider, model
 * and key come from Setup. */
export function CoachScreen({ navigation }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  // Read the context directly (not useHeaderHeight, which throws outside a
  // navigator) so the screen also renders in isolation under tests.
  const headerHeight = React.useContext(HeaderHeightContext) ?? 0;
  const provider = useAppStore(s => s.aiProvider);

  // Messages come from the active conversation (persisted history); appends go
  // through the service which write-throughs to SQLite.
  const conv = useConversationsStore(currentConversation);
  const currentId = useConversationsStore(s => s.currentId);
  const messages: StoredMessage[] = conv?.messages ?? [
    { id: 'greeting', from: 'ai', text: GREETING },
  ];

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Always keep a backing conversation (on first open, or after deleting all).
  useEffect(() => {
    if (!currentId) createConversation();
  }, [currentId]);

  // Burger button in the header opens the conversation list.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <BurgerButton color={c.acc} onPress={() => setMenuOpen(true)} />
      ),
    });
  }, [navigation, c.acc]);

  const scrollToEnd = useCallback(
    () =>
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true }),
      ),
    [],
  );

  const send = useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || busy) return;
      setInput('');

      // Build history from the live conversation (fresh from the store).
      const prior =
        currentConversation(useConversationsStore.getState())?.messages ?? [];
      const history: CoachMessage[] = prior
        .filter(m => m.from === 'ai' || m.from === 'me')
        .map(m => ({
          role: m.from === 'me' ? 'user' : 'assistant',
          content: m.text,
        }));

      appendMessage('me', value);
      setBusy(true);
      scrollToEnd();

      const { apiKey, model, aiProvider } = useAppStore.getState();
      const toolset = makeFoodToolset(summary =>
        appendMessage('system', summary),
      );
      const started = Date.now();

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
        if (reply) appendMessage('ai', reply, Date.now() - started);
      } catch (err) {
        const msg =
          err instanceof CoachError
            ? err.message
            : 'Something went wrong reaching the coach. Check your connection and try again.';
        appendMessage('system', msg);
      } finally {
        setBusy(false);
        scrollToEnd();
      }
    },
    [busy, scrollToEnd],
  );

  return (
    <View style={styles.root}>
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
                {m.from === 'ai' && m.ms != null ? (
                  <Text
                    style={[
                      M(600, 8.5, { ls: 0.6, color: c.fnt }),
                      styles.timing,
                    ]}
                  >
                    {formatMs(m.ms)}
                  </Text>
                ) : null}
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

      {menuOpen ? (
        <ConversationDrawer onClose={() => setMenuOpen(false)} />
      ) : null}
    </View>
  );
}

/** Header burger button that opens the conversation list. */
function BurgerButton({
  color,
  onPress,
}: {
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Conversations"
      style={styles.burger}
    >
      {[0, 1, 2].map(i => (
        <View key={i} style={[styles.burgerLine, { backgroundColor: color }]} />
      ))}
    </Pressable>
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
  burger: { paddingHorizontal: 4, paddingVertical: 4, gap: 4 },
  burgerLine: { width: 18, height: 2, borderRadius: 1 },
  timing: { marginTop: 5 },
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
