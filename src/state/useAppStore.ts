import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { IconName } from '../components/Icon';
import { GEMMA_MODELS } from '../features/coach/ondevice/models';

/** Selectable AI coach providers, mirroring the design's provider list. */
export type AiProvider = 'anthropic' | 'openai' | 'gemini' | 'ondevice';

export interface ProviderInfo {
  key: AiProvider;
  name: string;
  tagline: string;
  icon: IconName;
  models: string[];
  /** Placeholder for the API key field ("" when no key is needed). */
  keyPlaceholder: string;
}

export const PROVIDERS: Record<AiProvider, ProviderInfo> = {
  anthropic: {
    key: 'anthropic',
    name: 'Anthropic Claude',
    tagline: 'Recommended for nutrition coaching',
    icon: 'claude',
    models: ['Claude Sonnet 4.5', 'Claude Opus 4.1', 'Claude Haiku 4'],
    keyPlaceholder: 'sk-ant-…',
  },
  openai: {
    key: 'openai',
    name: 'OpenAI',
    tagline: 'GPT-5 family',
    icon: 'openai',
    models: ['GPT-5', 'GPT-5 mini', 'GPT-4.1'],
    keyPlaceholder: 'sk-…',
  },
  gemini: {
    key: 'gemini',
    name: 'Google Gemini',
    tagline: 'Gemini 2.5 Pro / Flash',
    icon: 'gemini',
    models: ['Gemini 2.5 Pro', 'Gemini 2.5 Flash'],
    keyPlaceholder: 'AIza…',
  },
  ondevice: {
    key: 'ondevice',
    name: 'On-device Gemma',
    tagline: 'Private · runs on your phone · no key',
    icon: 'ondevice',
    models: GEMMA_MODELS.map(m => m.label),
    keyPlaceholder: '',
  },
};

export const PROVIDER_ORDER: AiProvider[] = [
  'anthropic',
  'openai',
  'gemini',
  'ondevice',
];

// Google Health is the single cross-platform data source (the REST API behaves
// identically on iOS and Android, so there is no separate Apple Health path).
export type HealthSource = 'googleHealth';

interface AppState {
  aiProvider: AiProvider;
  model: string;
  apiKey: string;
  /** Language the coach replies in (English name, e.g. "Czech"); "Automatic"
   * mirrors whatever language the user writes in. See features/coach/languages. */
  coachLanguage: string;
  /** Connection state for health data sources (true once OAuth-connected). */
  connections: Record<HealthSource, boolean>;
  /** True once the user has passed the first-run Welcome screen. Persisted, so
   * the brief opens straight to Today on every later launch. */
  onboarded: boolean;
  setAiProvider: (provider: AiProvider) => void;
  setModel: (model: string) => void;
  setApiKey: (key: string) => void;
  setCoachLanguage: (language: string) => void;
  setConnection: (source: HealthSource, connected: boolean) => void;
  setOnboarded: (onboarded: boolean) => void;
}

/** SecureStore-backed storage for zustand persist. The API key is a secret, so
 * it lives in the encrypted keychain, not plain AsyncStorage. */
const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) =>
    SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const useAppStore = create<AppState>()(
  persist(
    set => ({
      // The coach runs fully on-device (Gemma via llama.rn) — no cloud provider,
      // no API key. Cloud providers remain in PROVIDERS for the client but are
      // no longer offered in Settings.
      aiProvider: 'ondevice',
      model: PROVIDERS.ondevice.models[0],
      apiKey: '',
      coachLanguage: 'Automatic',
      connections: { googleHealth: false },
      onboarded: false,
      setOnboarded: onboarded => set({ onboarded }),
      setAiProvider: provider =>
        set({ aiProvider: provider, model: PROVIDERS[provider].models[0] }),
      setModel: model => set({ model }),
      setApiKey: apiKey => set({ apiKey }),
      setCoachLanguage: language => set({ coachLanguage: language }),
      setConnection: (source, connected) =>
        set(state => ({
          connections: { ...state.connections, [source]: connected },
        })),
    }),
    {
      name: 'app-settings',
      storage: createJSONStorage(() => secureStorage),
      // Persist only the coach config; the health connection state is re-derived
      // from the sign-in SDK on launch, so it is intentionally not stored.
      partialize: state => ({
        aiProvider: state.aiProvider,
        model: state.model,
        apiKey: state.apiKey,
        coachLanguage: state.coachLanguage,
        onboarded: state.onboarded,
      }),
    },
  ),
);
