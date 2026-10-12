import type { AiModel } from '@/db/types'
import type { AiUsage } from './structured'

/** Prix d'un million de jetons, en dollars. */
export interface AiPrice {
  input: number
  output: number
  /** Relecture du cache, bien moins chère qu'une entrée ordinaire. */
  cacheRead: number
  /** Écriture dans le cache (5 minutes) : 1,25 fois le prix d'entrée. */
  cacheWrite: number
}

/** Les prix publics de l'API Claude pour chaque modèle proposé. */
export const AI_PRICES: Record<AiModel, AiPrice> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
}

/** Les prix d'un modèle ; un modèle inconnu compte au prix d'Opus, le plus cher (estimation prudente). */
export function priceOf(model: string): AiPrice {
  return model in AI_PRICES ? AI_PRICES[model as AiModel] : AI_PRICES['claude-opus-5-5']
}

/** Le coût d'une demande, en dollars. */
export function costOf(usage: AiUsage, model: string): number {
  const price = priceOf(model)
  return (
    (usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite) /
    1_000_000
  )
}

/** Les demandes faites à Claude par l'appli. */
export type AiAction = 'daily' | 'mealPhoto' | 'body' | 'fridge' | 'ideas' | 'chat'

/** Les jetons d'une demande ordinaire de chaque sorte (la sortie compte la réflexion). */
export const TYPICAL_USAGE: Record<AiAction, AiUsage> = {
  daily: { inputTokens: 6000, outputTokens: 2500, cacheReadTokens: 0, cacheWriteTokens: 0 },
  mealPhoto: { inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  body: { inputTokens: 6000, outputTokens: 3000, cacheReadTokens: 0, cacheWriteTokens: 0 },
  fridge: { inputTokens: 2500, outputTokens: 1500, cacheReadTokens: 0, cacheWriteTokens: 0 },
  ideas: { inputTokens: 4500, outputTokens: 3500, cacheReadTokens: 0, cacheWriteTokens: 0 },
  chat: { inputTokens: 2000, outputTokens: 800, cacheReadTokens: 5000, cacheWriteTokens: 1500 },
}

/** Un mois d'usage ordinaire : demandes de chaque sorte. */
export const MONTHLY_PLAN: Record<AiAction, number> = {
  daily: 30,
  mealPhoto: 30,
  chat: 60,
  ideas: 12,
  fridge: 8,
  body: 4,
}

/** Le coût ordinaire d'une demande, en dollars. */
export function actionCost(action: AiAction, model: string): number {
  return costOf(TYPICAL_USAGE[action], model)
}

/** Le coût d'un mois d'usage ordinaire, en dollars. */
export function monthlyEstimate(model: string): number {
  return (Object.keys(MONTHLY_PLAN) as AiAction[]).reduce(
    (total, action) => total + MONTHLY_PLAN[action] * actionCost(action, model),
    0,
  )
}
