import { create } from 'zustand';

import { IconName } from '../components/Icon';

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
    name: 'On-device',
    tagline: 'Private · no key needed',
    icon: 'ondevice',
    models: ['Apple Intelligence', 'Gemini Nano'],
    keyPlaceholder: '',
  },
};

export const PROVIDER_ORDER: AiProvider[] = [
  'anthropic',
  'openai',
  'gemini',
  'ondevice',
];

export type HealthSource = 'googleHealth' | 'appleHealth';

interface AppState {
  aiProvider: AiProvider;
  model: string;
  apiKey: string;
  /** Connection toggles for health data sources. */
  connections: Record<HealthSource, boolean>;
  setAiProvider: (provider: AiProvider) => void;
  setModel: (model: string) => void;
  setApiKey: (key: string) => void;
  toggleConnection: (source: HealthSource) => void;
}

export const useAppStore = create<AppState>(set => ({
  aiProvider: 'anthropic',
  model: PROVIDERS.anthropic.models[0],
  apiKey: '',
  connections: { googleHealth: true, appleHealth: true },
  setAiProvider: provider =>
    set({ aiProvider: provider, model: PROVIDERS[provider].models[0] }),
  setModel: model => set({ model }),
  setApiKey: apiKey => set({ apiKey }),
  toggleConnection: source =>
    set(state => ({
      connections: {
        ...state.connections,
        [source]: !state.connections[source],
      },
    })),
}));
