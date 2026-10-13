import { costOf } from '@/content/ai/cost'
import type { AiUsage } from '@/content/ai/structured'
import { recordAiUsage } from '@/db/ai-usage'
import { db, type CaliTrackDB } from '@/db/db'
import { today } from '@/lib/dates'

/**
 * Ajoute une demande à Claude au compteur du mois, au prix du modèle qui a répondu. Rien sans jetons
 * facturés (null : aucune réponse n'est revenue). Ne lève jamais d'erreur : le compteur n'est qu'une
 * estimation, il ne doit pas faire échouer la demande.
 */
export async function recordCallUsage(
  usage: AiUsage | null,
  model: string,
  database: CaliTrackDB = db,
): Promise<void> {
  if (usage === null) return
  await recordAiUsage(usage, costOf(usage, model), today().slice(0, 7), database).catch(() => undefined)
}
