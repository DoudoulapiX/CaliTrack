import type { AiModel } from '@/db/types'

export interface AiModelOption {
  id: AiModel
  label: string
  hint: string
}

/** Les modèles Claude proposés, du plus précis au moins cher. */
export const AI_MODEL_OPTIONS: readonly AiModelOption[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5', hint: 'Le plus précis, le plus cher.' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5', hint: 'Bon compromis entre précision et prix.' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5', hint: 'Le moins cher, un peu moins précis.' },
]

export function aiModelOption(id: AiModel): AiModelOption {
  return AI_MODEL_OPTIONS.find((option) => option.id === id) ?? (AI_MODEL_OPTIONS[0] as AiModelOption)
}
