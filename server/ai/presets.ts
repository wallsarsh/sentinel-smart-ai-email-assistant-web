import type { AiKind } from './types'

/** Starting points offered in the UI. No model names or prices are shipped; models come from the provider. */
export const PRESETS = [
  {
    id: 'claude',
    kind: 'anthropic' as AiKind,
    name: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    editableUrl: false,
  },
  {
    id: 'chatgpt',
    kind: 'openai' as AiKind,
    name: 'ChatGPT',
    baseUrl: 'https://api.openai.com/v1',
    editableUrl: false,
  },
  {
    id: 'compatible',
    kind: 'openai_compatible' as AiKind,
    name: 'OpenAI-compatible',
    baseUrl: '',
    editableUrl: true,
  },
] as const
