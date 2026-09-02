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

import { M, S } from '../../components/brief';
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
            borderRightColor: c.hair,
            paddingTop: insets.top + 14,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <Text style={[M(700, 9, { ls: 1.4, color: c.fnt }), styles.heading]}>
          CONVERSATIONS
        </Text>

        <Pressable
          onPress={() => {
            createConversation();
            onClose();
          }}
          accessibilityRole="button"
          style={[styles.newBtn, { borderColor: c.hair }]}
        >
          <Text style={M(700, 15, { color: c.acc })}>＋</Text>
          <Text style={S(600, 13.5, { color: c.ink })}>New chat</Text>
        </Pressable>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {conversations.length === 0 ? (
            <Text style={[S(500, 12.5, { color: c.mut }), styles.empty]}>
              No conversations yet.
            </Text>
          ) : null}
          {conversations.map(conv => {
            const active = conv.id === currentId;
            return (
              <View key={conv.id} style={styles.row}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: active ? c.acc : 'transparent' },
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
                    style={S(active ? 600 : 500, 13, {
                      color: active ? c.ink : c.mut,
                    })}
                  >
                    {conv.title}
                  </Text>
                  <Text style={M(600, 9, { ls: 0.5, color: c.fnt })}>
                    {relTime(conv.updatedAt).toUpperCase()}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => confirmDelete(conv)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete conversation ${conv.title}`}
                >
                  <Text style={M(700, 15, { color: c.fnt })}>×</Text>
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
    opacity: 0.35,
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '82%',
    maxWidth: 340,
    borderRightWidth: 1,
    paddingHorizontal: 16,
  },
  heading: { marginBottom: 12, marginLeft: 4 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  list: { marginTop: 8 },
  listContent: { paddingBottom: 24 },
  empty: { marginTop: 16, marginLeft: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  rowMain: { flex: 1, minWidth: 0, gap: 3 },
});
