import { nowISO } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import { aiUsageSchema } from './schema'
import type { AiUsage, AiUsageRow } from './types'

/**
 * Ajoute une demande à Claude au compteur du mois (AAAA-MM), sur cet appareil seulement. Le coût de la
 * demande, en dollars, est calculé par l'appelant au prix du modèle qui a répondu.
 */
export async function recordAiUsage(
  usage: AiUsage,
  costUsd: number,
  month: string,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  const now = nowISO()
  // La demande seule est vérifiée d'abord : un nombre négatif ne doit pas se cacher dans un total.
  const call = aiUsageSchema.parse({
    month,
    calls: 1,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    costUsd,
    updatedAt: now,
  })
  await database.transaction('rw', database.aiUsage, async () => {
    const row = await database.aiUsage.get(month)
    await database.aiUsage.put(
      aiUsageSchema.parse({
        month,
        calls: (row?.calls ?? 0) + call.calls,
        inputTokens: (row?.inputTokens ?? 0) + call.inputTokens,
        outputTokens: (row?.outputTokens ?? 0) + call.outputTokens,
        cacheReadTokens: (row?.cacheReadTokens ?? 0) + call.cacheReadTokens,
        cacheWriteTokens: (row?.cacheWriteTokens ?? 0) + call.cacheWriteTokens,
        costUsd: (row?.costUsd ?? 0) + call.costUsd,
        updatedAt: now,
      }),
    )
  })
}

/** Les demandes à Claude d'un mois (AAAA-MM) sur cet appareil ; undefined : aucune. */
export async function usageOfMonth(
  month: string,
  database: CaliTrackDB = defaultDb,
): Promise<AiUsageRow | undefined> {
  return database.aiUsage.get(month)
}
