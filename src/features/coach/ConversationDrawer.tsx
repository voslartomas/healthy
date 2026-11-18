import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BriefButton, S } from '../../components/brief';
import { Icon } from '../../components/Icon';
import {
  createConversation,
  openConversation,
  removeConversation,
} from '../../state/conversationsService';
import {
  Conversation,
  useConversationsStore,
} from '../../state/useConversationsStore';
import { useTheme } from '../../theme/theme';

/** "just now" / "3h" / "2d" / "Aug 2" for a conversation's last activity. */
function relTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const d = new Date(ms);
  const MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/**
 * Left slide-over listing every past conversation. Opened from the coach
 * header's burger button; tapping a row resumes that chat, "New chat" starts a
 * fresh one, and each row can be deleted. Rendered as an absolute overlay inside
 * the coach modal (the coach is a single native screen, not a drawer navigator).
 *
 * Friendly look (ADR-007): a page-coloured panel with rounded outer corners, a
 * Nunito Black heading, the accent slab for "New chat", and roomy 44px+ rows —
 * the open conversation sits on the accent tint with a solid dot.
 */
export function ConversationDrawer({ onClose }: { onClose: () => void }) {
  const c = useTheme().colors;
  const insets = useSafeAreaInsets();
  const conversations = useConversationsStore(s => s.conversations);
  const currentId = useConversationsStore(s => s.currentId);

  const confirmDelete = React.useCallback((conv: Conversation) => {
    Alert.alert('Delete conversation', `Delete “${conv.title}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => void removeConversation(conv.id),
      },
    ]);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        style={[styles.scrim, { backgroundColor: c.scrim }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close conversations"
      />
      <View
        style={[
          styles.panel,
          {
            backgroundColor: c.bg,
            borderColor: c.hair,
            paddingTop: insets.top + 18,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <Text style={[S(900, 22, { lh: 28, color: c.ink }), styles.heading]}>
          Conversations
        </Text>

        <BriefButton
          label="New chat"
          onPress={() => {
            createConversation();
            onClose();
          }}
          size={12}
          fontSize={16}
        />

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {conversations.length === 0 ? (
            <Text style={[S(700, 15, { color: c.mut }), styles.empty]}>
              No conversations yet.
            </Text>
          ) : null}
          {conversations.map(conv => {
            const active = conv.id === currentId;
            return (
              <View
                key={conv.id}
                style={[
                  styles.row,
                  { backgroundColor: active ? c.accTint : 'transparent' },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: active ? c.accSolid : 'transparent' },
                  ]}
                />
                <Pressable
                  style={styles.rowMain}
                  onPress={() => {
                    openConversation(conv.id);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open conversation ${conv.title}`}
                >
                  <Text
                    numberOfLines={1}
                    style={S(active ? 900 : 800, 16, {
                      lh: 21,
                      color: active ? c.acc : c.ink,
                    })}
                  >
                    {conv.title}
                  </Text>
                  <Text style={S(700, 13, { color: c.fnt })}>
                    {relTime(conv.updatedAt)}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(conv)}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete conversation ${conv.title}`}
                  style={styles.delete}
                >
                  <Icon
                    name="close"
                    size={18}
                    strokeWidth={2.6}
                    color={c.fnt}
                  />
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '82%',
    maxWidth: 340,
    borderWidth: 2,
    borderLeftWidth: 0,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
  },
  heading: { marginBottom: 14, marginLeft: 4 },
  list: { marginTop: 12 },
  listContent: { paddingBottom: 24, gap: 4 },
  empty: { marginTop: 16, marginLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingLeft: 12,
    borderRadius: 16,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1, minWidth: 0, gap: 1, paddingVertical: 10 },
  delete: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
