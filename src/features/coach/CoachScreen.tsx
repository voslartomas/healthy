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
import Svg, { Path, Rect } from 'react-native-svg';

import { ScreenProps } from '../../app/navigation/types';
import { S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  appendMessage,
  createConversation,
  GREETING,
  updateMessage,
} from '../../state/conversationsService';
import { deleteFoodEntry, replaceFoodEntry } from '../../state/foodLogService';
import { PROVIDERS, useAppStore } from '../../state/useAppStore';
import {
  currentConversation,
  StoredMessage,
  useConversationsStore,
} from '../../state/useConversationsStore';
import { sans } from '../../theme/fonts';
import { useTheme } from '../../theme/theme';
import { CoachError, CoachMessage, runCoach, ToolExecutor } from './aiClient';
import { CoachMarkdown } from './CoachMarkdown';
import { CoachIntent, COACH_INTENTS, coachIntentByKey } from './intents';
import { ConversationDrawer } from './ConversationDrawer';
import { buildDataContext } from './dataContext';
import { makeFoodToolset, summarizeFood } from './foodTool';
import { FoodEditSheet } from '../nutrition/FoodEditSheet';
import { makeWorkoutToolset } from './workoutTool';
import { languageDirective } from './languages';
import { useVoiceInput, VoiceState } from './useVoiceInput';

/** Format a model response time, e.g. "820 ms" / "3.4 s" — sentence case under
 * the bubble, as in the friendly design (ADR-007). */
function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** What a system note in the transcript is about, which picks its colour.
 *
 * System notes are both the tool confirmations ("Logged: …", "Created \"Push
 * day\" — 6 exercises.") and the error messages, and a stored message does not
 * record which, so it is read off the wording the tools write (see foodTool.ts
 * `onLog` and workoutTool.ts `onCreate`). An unrecognised note falls back to the
 * neutral style — the safe side for an error. Purely presentational: a mismatch
 * only changes a tint. */
type NoteKind = 'food' | 'workout' | 'plain';
function noteKind(text: string): NoteKind {
  if (
    /^(Logged:|Updated:|Saved to Common Foods|Deleted a food entry)/.test(text)
  )
    return 'food';
  if (/^Created "/.test(text)) return 'workout';
  return 'plain';
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
    'To change or remove a meal, call update_food_log (with corrected full values) or delete_food_log with the food’s name as it appears under “Logged today” below.',
    'To save a food for quick re-use later (not log it for today), call save_common_food.',
    'To build a strength workout when the user asks (e.g. “make a biceps and hamstrings workout with 6 exercises”), call create_workout with the target muscles and exercise count — it picks exercises from the app’s database and sets each one’s weight and reps from the user’s own training history.',
    'If the user is just chatting or asking a question, reply in words and do not call any tool.',
    'Keep replies short and concrete. Use grams for macros and kcal for energy. Do not invent numbers that are not in the data.',
  ].join(' ');
  return `${instructions}\n\n=== The user's current health data ===\n${buildDataContext()}`;
}

/** AI coach chat, presented as a native modal screen. A live, provider-backed
 * conversation that logs food and builds workouts via tool calls. Provider,
 * model and key come from the Me tab.
 *
 * Friendly layout (ADR-007, Coach artboard): a status line under the native
 * header ("On your phone · private"), coach bubbles on a soft fill beside a
 * round sparkle avatar, the user's in the accent, tool confirmations as tinted
 * pills in the area's colour, and a composer of chunky action chips over a
 * round mic / pill field / slab send row. The native header keeps the title and
 * Close; this screen only supplies the burger on the left. */
export function CoachScreen({ navigation, route }: ScreenProps) {
  const t = useTheme();
  const c = t.colors;
  const insets = useSafeAreaInsets();
  // Read the context directly (not useHeaderHeight, which throws outside a
  // navigator) so the screen also renders in isolation under tests.
  const headerHeight = React.useContext(HeaderHeightContext) ?? 0;
  const provider = useAppStore(s => s.aiProvider);
  const onDevice = provider === 'ondevice';

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
  /** The "Logged: …" note being edited in the food editor sheet, if any. */
  const [editing, setEditing] = useState<StoredMessage | null>(null);

  /** Save from the food editor: replace the health entry (keeping its time,
   * meal and tags), then rewrite the note with the new values and new id so a
   * second edit targets the right record. Returns an error string, or null. */
  const saveEdit = useCallback(
    async (values: {
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
    }): Promise<string | null> => {
      const note = editing;
      const food = note?.food;
      const convId = useConversationsStore.getState().currentId;
      if (!note || !food?.entryId || !convId)
        return 'This entry can no longer be edited.';
      const input = {
        name: food.name,
        kcal: values.kcal,
        proteinG: values.proteinG,
        carbsG: values.carbsG,
        fatG: values.fatG,
        mealType: food.mealType,
      };
      const res = await replaceFoodEntry(food.entryId, input);
      if (!res.ok) return res.error ?? 'Could not save the change.';
      updateMessage(convId, note.id, {
        text: `Logged: ${summarizeFood(input)}`,
        food: { ...food, ...values, entryId: res.id },
      });
      setEditing(null);
      return null;
    },
    [editing],
  );

  /** Delete the entry behind a "Logged: …" note; the note then says so. */
  const deleteEdit = useCallback(async (): Promise<string | null> => {
    const note = editing;
    const food = note?.food;
    const convId = useConversationsStore.getState().currentId;
    if (!note || !food?.entryId || !convId)
      return 'This entry can no longer be deleted.';
    const ok = await deleteFoodEntry(food.entryId);
    if (!ok) return 'Could not remove the entry — is Health Connect connected?';
    // Drop `food` so the note is no longer tappable for a deleted entry.
    updateMessage(convId, note.id, {
      text: `Deleted: ${food.name} (${Math.round(food.kcal)} kcal).`,
      food: undefined,
    });
    setEditing(null);
    return null;
  }, [editing]);
  /** The action the next message is for, or null for open conversation.
   * Seeded from the route param so opening the chat from the FAB's long-press
   * menu ("Log food" / "New workout") arrives with that chip already armed. */
  const [intent, setIntent] = useState<CoachIntent | null>(() =>
    coachIntentByKey(route?.params?.intent),
  );
  const scrollRef = useRef<ScrollView>(null);

  // Voice input: the transcript is appended to whatever's typed so the user can
  // review/edit before sending (never auto-sent). The mic only appears once the
  // on-device speech model is downloaded (see Me → voice input).
  const voice = useVoiceInput(text =>
    setInput(prev => (prev.trim() ? `${prev.trimEnd()} ${text}` : text)),
  );

  // Always keep a backing conversation (on first open, or after deleting all).
  useEffect(() => {
    if (!currentId) createConversation();
  }, [currentId]);

  // Burger button in the header opens the conversation list.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <BurgerButton
          color={c.ink}
          bg={c.soft}
          onPress={() => setMenuOpen(true)}
        />
      ),
    });
  }, [navigation, c.ink, c.soft]);

  const scrollToEnd = useCallback(
    () =>
      requestAnimationFrame(() =>
        scrollRef.current?.scrollToEnd({ animated: true }),
      ),
    [],
  );

  const send = useCallback(
    async (raw: string, intent?: CoachIntent | null) => {
      const value = raw.trim();
      if (!value || busy) return;
      setInput('');
      // One-shot: the chip describes THIS message, so clear it either way.
      setIntent(null);

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
      const onToolLog = (summary: string, food?: StoredMessage['food']) =>
        appendMessage(
          'system',
          summary,
          undefined,
          food ? { food } : undefined,
        );
      const food = makeFoodToolset(onToolLog);
      const workoutTools = makeWorkoutToolset(onToolLog);
      const workoutNames = new Set(workoutTools.tools.map(t => t.name));
      const exec: ToolExecutor = (name, args) =>
        workoutNames.has(name)
          ? workoutTools.exec(name, args)
          : food.exec(name, args);
      const started = Date.now();

      try {
        const reply = await runCoach(
          { provider: aiProvider, model, apiKey },
          {
            system: buildSystemPrompt(),
            history: [...history, { role: 'user', content: value }],
            tools: [...food.tools, ...workoutTools.tools],
            exec,
            // With an intent chip active the user has already told the app what
            // they want, so the model is obliged to call that tool rather than
            // left to infer it from the wording — "two eggs and toast" otherwise
            // reads as easily as a question as a request to log.
            toolChoice: intent ? { force: intent.tool } : 'auto',
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

  const canSend = !!input.trim() && !busy;

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
        style={[styles.root, { backgroundColor: c.bg }]}
      >
        {/* The artboard's header subtitle. The native header only takes a
            title, so it rides as a strip under it: green "private" for the
            on-device model, the provider's name for a cloud one. */}
        <View style={[styles.status, { borderBottomColor: c.hair }]}>
          <Sparkle color={onDevice ? c.grnSolid : c.accSolid} size={14} />
          <Text
            numberOfLines={1}
            style={S(800, 13, { color: onDevice ? c.grn : c.mut })}
          >
            {onDevice
              ? 'On your phone · private'
              : `${PROVIDERS[provider].name} · cloud`}
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
          {messages.map(m => {
            if (m.from === 'system')
              return (
                <SystemNote
                  key={m.id}
                  text={m.text}
                  onEdit={m.food?.entryId ? () => setEditing(m) : undefined}
                />
              );
            if (m.from === 'me') {
              return (
                <View
                  key={m.id}
                  style={[
                    styles.bubble,
                    styles.meBubble,
                    { backgroundColor: c.accSolid },
                  ]}
                >
                  <Text
                    selectable
                    style={S(700, 16, { lh: 22, color: c.onAccent })}
                  >
                    {m.text}
                  </Text>
                </View>
              );
            }
            return (
              <View key={m.id} style={styles.aiRow}>
                <CoachAvatar />
                <View style={styles.aiCol}>
                  <View
                    style={[
                      styles.bubble,
                      styles.aiBubble,
                      { backgroundColor: c.soft },
                    ]}
                  >
                    <CoachMarkdown text={m.text} />
                  </View>
                  {m.ms != null ? (
                    <Text style={[S(800, 12, { color: c.fnt }), styles.timing]}>
                      {formatMs(m.ms)}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })}
          {busy ? (
            <View style={styles.aiRow} accessibilityLabel="Coach is typing">
              <CoachAvatar />
              <View
                style={[
                  styles.bubble,
                  styles.aiBubble,
                  styles.typing,
                  { backgroundColor: c.soft },
                ]}
              >
                {[0, 1, 2].map(i => (
                  <View
                    key={i}
                    style={[styles.typingDot, { backgroundColor: c.fnt }]}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View
          style={[
            styles.composer,
            { borderTopColor: c.hair, paddingBottom: insets.bottom + 16 },
          ]}
        >
          {voice.error ? (
            <View style={[styles.voiceErr, { backgroundColor: c.redTint }]}>
              <Text style={S(800, 13, { color: c.red })}>{voice.error}</Text>
            </View>
          ) : null}
          {/* Pick an action, then just describe it — no need to phrase the
              message as a command for the model to recognise. */}
          <View style={styles.intents}>
            {COACH_INTENTS.map(it => {
              const on = intent?.key === it.key;
              return (
                <Pressable
                  key={it.key}
                  onPress={() => setIntent(on ? null : it)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={
                    on ? `${it.label} selected, tap to cancel` : it.label
                  }
                  style={[
                    styles.intentChip,
                    {
                      backgroundColor: on ? c.accTint : c.card,
                      borderColor: on ? c.accSolid : c.hair,
                      opacity: busy ? 0.45 : 1,
                    },
                  ]}
                >
                  {/* The armed chip swaps its icon for a cross: tapping it
                      again is how the action is cancelled. */}
                  <Icon
                    name={on ? 'close' : it.icon}
                    size={15}
                    strokeWidth={2.4}
                    color={on ? c.acc : c.mut}
                  />
                  <Text style={S(900, 14, { color: on ? c.acc : c.ink })}>
                    {it.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.inputRow}>
            {voice.ready ? (
              <MicButton state={voice.state} onPress={voice.toggle} />
            ) : null}
            <TextInput
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => send(input, intent)}
              placeholder={
                voice.state === 'recording'
                  ? 'Listening…'
                  : voice.state === 'transcribing'
                    ? 'Transcribing…'
                    : (intent?.placeholder ?? 'Ask your coach anything…')
              }
              placeholderTextColor={c.fnt}
              accessibilityLabel="Message your coach"
              returnKeyType="send"
              editable={!busy && voice.state === 'idle'}
              style={[
                styles.input,
                // No lineHeight on a single-line field: Android offsets the
                // text inside a fixed-height input when one is set.
                { fontFamily: sans(700), fontSize: 16, color: c.ink },
                { borderColor: c.hair, backgroundColor: c.soft },
              ]}
            />
            <Pressable
              onPress={() => send(input, intent)}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send"
              style={[
                styles.round,
                {
                  backgroundColor: c.accSolid,
                  borderBottomWidth: 4,
                  borderBottomColor: c.accEdge,
                  opacity: canSend ? 1 : 0.45,
                },
              ]}
            >
              <Svg
                width={22}
                height={22}
                viewBox="0 0 24 24"
                fill="none"
                stroke={c.onAccent}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M12 19V5M6 11l6-6 6 6" />
              </Svg>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {menuOpen ? (
        <ConversationDrawer onClose={() => setMenuOpen(false)} />
      ) : null}
      <FoodEditSheet
        food={editing?.food ?? null}
        onCancel={() => setEditing(null)}
        onSave={saveEdit}
        onDelete={deleteEdit}
      />
    </View>
  );
}

/** A tool confirmation or error, centred between the bubbles. Food actions take
 * the food colours with a tick, a built workout the lift colours; anything else
 * (errors, "model not downloaded") is a neutral soft note. A note for a food the
 * coach logged carries the entry (`onEdit`): it becomes a button that opens the
 * food editor, with an "Adjust" hint so it reads as tappable. */
function SystemNote({ text, onEdit }: { text: string; onEdit?: () => void }) {
  const c = useTheme().colors;
  const kind = noteKind(text);
  const tone =
    kind === 'food'
      ? { bg: c.foodTint, fg: c.foodText, icon: c.foodEdge }
      : kind === 'workout'
        ? { bg: c.liftTint, fg: c.liftText, icon: c.liftEdge }
        : { bg: c.soft, fg: c.mut, icon: null };
  const body = (
    <>
      {tone.icon ? (
        <Icon name="check" size={16} strokeWidth={3} color={tone.icon} />
      ) : null}
      <Text
        selectable={!onEdit}
        style={[
          S(900, 14, { lh: 19, color: tone.fg, align: 'center' }),
          styles.sysText,
        ]}
      >
        {text}
      </Text>
      {onEdit ? (
        <Text style={S(900, 13, { color: c.acc })}>Adjust ›</Text>
      ) : null}
    </>
  );
  if (onEdit) {
    return (
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Adjust ${text}`}
        style={[styles.sysNote, { backgroundColor: tone.bg }]}
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View style={[styles.sysNote, { backgroundColor: tone.bg }]}>{body}</View>
  );
}

/** The coach's round accent avatar with the outlined sparkle — the same mark
 * the Today brief bubble uses. */
function CoachAvatar() {
  const c = useTheme().colors;
  return (
    <View style={[styles.avatar, { backgroundColor: c.accSolid }]}>
      <Svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke={c.onAccent}
        strokeWidth={2.2}
        strokeLinejoin="round"
      >
        <Path d="M12 3c.5 4.5 3.5 7.5 8 8-4.5.5-7.5 3.5-8 8-.5-4.5-3.5-7.5-8-8 4.5-.5 7.5-3.5 8-8z" />
      </Svg>
    </View>
  );
}

/** Header burger button that opens the conversation list: a 44px soft circle
 * holding three lines, the last one shorter. */
function BurgerButton({
  color,
  bg,
  onPress,
}: {
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Conversations"
      style={[styles.burger, { backgroundColor: bg }]}
    >
      <Svg
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={2.6}
        strokeLinecap="round"
      >
        <Path d="M4 7h16M4 12h16M4 17h10" />
      </Svg>
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

/** Composer mic: a chunky outlined circle with an accent mic when idle, a solid
 * accent slab with a stop square while recording, a dot cluster while
 * transcribing. Only mounted once the voice model is ready. */
function MicButton({
  state,
  onPress,
}: {
  state: VoiceState;
  onPress: () => void;
}) {
  const c = useTheme().colors;
  const recording = state === 'recording';
  const transcribing = state === 'transcribing';
  return (
    <Pressable
      onPress={onPress}
      disabled={transcribing}
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Record voice message'}
      style={[
        styles.round,
        recording
          ? {
              backgroundColor: c.accSolid,
              borderBottomWidth: 4,
              borderBottomColor: c.accEdge,
            }
          : {
              backgroundColor: c.card,
              borderWidth: 2,
              borderBottomWidth: 4,
              borderColor: c.hair,
            },
      ]}
    >
      {transcribing ? (
        <View style={styles.micDots}>
          {[0, 1, 2].map(i => (
            <View
              key={i}
              style={[styles.typingDot, { backgroundColor: c.fnt }]}
            />
          ))}
        </View>
      ) : recording ? (
        <View style={[styles.stopSquare, { backgroundColor: c.onAccent }]} />
      ) : (
        <Svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke={c.acc}
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <Rect x={9} y={3} width={6} height={11} rx={3} />
          <Path d="M5 11a7 7 0 0 0 14 0" />
          <Path d="M12 18v3" />
        </Svg>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  burger: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 2,
  },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 12 },
  bubble: {
    maxWidth: 270,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
  },
  meBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  aiBubble: { borderBottomLeftRadius: 4 },
  aiRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  // flexShrink so a long reply wraps inside the column instead of pushing the
  // bubble past the screen edge.
  aiCol: { flexShrink: 1, gap: 4 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timing: { paddingLeft: 2 },
  sysNote: {
    alignSelf: 'center',
    maxWidth: '92%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  sysText: { flexShrink: 1 },
  typing: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    paddingVertical: 19,
  },
  typingDot: { width: 7, height: 7, borderRadius: 3.5 },
  composer: {
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 2,
  },
  voiceErr: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  intents: { flexDirection: 'row', gap: 8 },
  intentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderBottomWidth: 4,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 50,
    borderWidth: 2,
    borderRadius: 25,
    paddingVertical: 0,
    paddingHorizontal: 16,
  },
  round: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: { width: 14, height: 14, borderRadius: 3 },
  micDots: { flexDirection: 'row', gap: 3 },
});
