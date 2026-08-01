import { create } from 'zustand';

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

interface AppState {
  aiProvider: AiProvider;
  setAiProvider: (provider: AiProvider) => void;
}

export const useAppStore = create<AppState>(set => ({
  aiProvider: 'anthropic',
  setAiProvider: provider => set({ aiProvider: provider }),
}));
