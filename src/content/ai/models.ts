import type { AiModel } from '@/db/types'

export interface AiModelOption {
  id: AiModel
  label: string
  hint: string
}

/** Les modèles d'OpenAI proposés, du plus précis au moins cher. */
export const AI_MODEL_OPTIONS: readonly AiModelOption[] = [
  { id: 'gpt-6.2-astra', label: 'GPT-6.2 Astra', hint: 'Le plus précis, le plus cher.' },
  { id: 'gpt-6.2-sol', label: 'GPT-6.2 Sol', hint: 'Bon compromis entre précision et prix.' },
  { id: 'gpt-6-luna', label: 'GPT-6 Luna', hint: 'Le moins cher, un peu moins précis.' },
]

export function aiModelOption(id: AiModel): AiModelOption {
  return AI_MODEL_OPTIONS.find((option) => option.id === id) ?? (AI_MODEL_OPTIONS[1] as AiModelOption)
}
