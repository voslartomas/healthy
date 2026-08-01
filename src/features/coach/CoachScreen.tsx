import React, { useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '../../components/Icon';
import { ChatMessage, coach } from '../../data/health';
import { PROVIDERS, useAppStore } from '../../state/useAppStore';
import { monoFont, radii, useTheme } from '../../theme/theme';

/** AI coach chat: seeded conversation, quick actions, and a live composer. */
export function CoachScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const provider = useAppStore(s => s.aiProvider);
  const [messages, setMessages] = useState<ChatMessage[]>(coach.messages);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () =>
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: true }),
    );

  function send(text: string) {
    const value = text.trim();
    if (!value || typing) return;
    setMessages(prev => [...prev, { from: 'me', text: value }]);
    setInput('');
    setTyping(true);
    scrollToEnd();
    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [
        ...prev,
        {
          from: 'ai',
          text: "Got it — logging that now. I'll update your macros and net deficit on the dashboard.",
        },
      ]);
      scrollToEnd();
    }, 900);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: t.colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              {coach.status} · {PROVIDERS[provider].name}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
      >
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {typing && (
          <View
            style={[
              styles.bubble,
              styles.ai,
              styles.typing,
              {
                backgroundColor: t.colors.surface,
                borderColor: t.colors.border,
              },
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {coach.quickChips.map(chip => (
          <Pressable
            key={chip}
            onPress={() => send(chip)}
            style={[
              styles.chip,
              {
                backgroundColor: t.colors.surface,
                borderColor: t.colors.border,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: t.colors.fg }]}>
              {chip}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View
        style={[
          styles.composer,
          {
            borderTopColor: t.colors.border,
            backgroundColor: t.colors.surface,
            paddingBottom: insets.bottom + 10,
          },
        ]}
      >
        <Pressable
          style={[styles.cbtn, { backgroundColor: t.colors.surface2 }]}
          accessibilityLabel="Camera"
        >
          <Icon name="camera" size={20} color={t.colors.muted} />
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send(input)}
          placeholder="Tell coach what you ate…"
          placeholderTextColor={t.colors.faint}
          accessibilityLabel="Message your coach"
          returnKeyType="send"
          style={[
            styles.input,
            { backgroundColor: t.colors.surface2, color: t.colors.fg },
          ]}
        />
        <Pressable
          onPress={() => send(input)}
          disabled={!input.trim() || typing}
          accessibilityLabel="Send"
          style={[
            styles.cbtn,
            { backgroundColor: t.colors.accent },
            (!input.trim() || typing) && { opacity: 0.45 },
          ]}
        >
          <Icon
            name="send"
            size={19}
            color={t.colors.onAccent}
            strokeWidth={2}
          />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const t = useTheme();
  const mine = message.from === 'me';
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
        style={[
          styles.bubbleText,
          { color: mine ? t.colors.onAccent : t.colors.fg },
        ]}
      >
        {message.text}
      </Text>
      {message.macros && (
        <View style={styles.macpill}>
          {message.macros.map(macro => (
            <View
              key={macro}
              style={[
                styles.macpillItem,
                { backgroundColor: t.colors.surface2 },
              ]}
            >
              <Text style={[styles.macpillText, { color: t.colors.fg }]}>
                {macro}
              </Text>
            </View>
          ))}
        </View>
      )}
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
  macpill: { flexDirection: 'row', gap: 6, marginTop: 9, flexWrap: 'wrap' },
  macpillItem: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8 },
  macpillText: { fontFamily: monoFont, fontSize: 10.5, fontWeight: '700' },
  typing: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingVertical: 15,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  chips: { gap: 8, paddingHorizontal: 18, paddingVertical: 8 },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
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
    borderRadius: radii.pill,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 14,
  },
});
