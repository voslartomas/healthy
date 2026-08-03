jest.mock('../src/db/conversationsRepository');

/* eslint-disable import/first -- jest.mock must be hoisted above imports */
import * as repo from '../src/db/conversationsRepository';
import {
  appendMessage,
  createConversation,
  GREETING,
  initConversations,
  removeConversation,
} from '../src/state/conversationsService';
import {
  currentConversation,
  useConversationsStore,
} from '../src/state/useConversationsStore';

beforeEach(() => {
  useConversationsStore.setState({
    conversations: [],
    currentId: null,
    hydrated: false,
  });
  jest.clearAllMocks();
  // Auto-mocked repo functions return undefined by default; make them resolve
  // so the service's fire-and-forget `.catch(...)` has a promise to chain.
  (repo.upsertConversation as jest.Mock).mockResolvedValue(undefined);
  (repo.deleteConversation as jest.Mock).mockResolvedValue(undefined);
  (repo.loadConversations as jest.Mock).mockResolvedValue([]);
});

describe('conversationsService', () => {
  it('creates a conversation seeded with the greeting and makes it current', () => {
    const conv = createConversation();
    const state = useConversationsStore.getState();
    expect(state.currentId).toBe(conv.id);
    expect(currentConversation(state)?.messages[0].text).toBe(GREETING);
    expect(repo.upsertConversation).toHaveBeenCalled();
  });

  it('appends messages, titles from the first user message, and records timing', () => {
    createConversation();
    appendMessage('me', 'How much protein should I eat?');
    appendMessage('ai', 'Aim for ~1.8g/kg.', 820);

    const conv = currentConversation(useConversationsStore.getState());
    expect(conv?.title).toBe('How much protein should I eat?');
    const ai = conv?.messages.find(m => m.from === 'ai' && m.ms != null);
    expect(ai?.ms).toBe(820);
  });

  it('hydrates from the repository and resumes the most recent conversation', async () => {
    (repo.loadConversations as jest.Mock).mockResolvedValue([
      { id: 'b', title: 'New', createdAt: 3, updatedAt: 5, messages: [] },
      { id: 'a', title: 'Old', createdAt: 1, updatedAt: 2, messages: [] },
    ]);
    await initConversations();
    const state = useConversationsStore.getState();
    expect(state.conversations.map(c => c.id)).toEqual(['b', 'a']);
    expect(state.currentId).toBe('b');
  });

  it('removes a conversation and falls back to the newest remaining', async () => {
    (repo.deleteConversation as jest.Mock).mockResolvedValue(undefined);
    const a = createConversation();
    const b = createConversation();
    expect(useConversationsStore.getState().currentId).toBe(b.id);
    await removeConversation(b.id);
    expect(useConversationsStore.getState().currentId).toBe(a.id);
  });
});
