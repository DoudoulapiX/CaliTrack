import type { AiProblem } from '@/content/ai/client'
import { frenchSpacing } from '@/lib/typography'

/** Où régler l'IA dans l'appli. */
export const AI_SETTINGS_PATH = '/more/ai'

/** Ce qu'on dit quand Claude n'a pas pu répondre. */
export const AI_PROBLEM_TEXT: Record<AiProblem, string> = {
  offline: frenchSpacing('Pas de connexion : réessaie une fois connecté.'),
  invalidKey: frenchSpacing(
    'Ta clé Claude est refusée : vérifie-la ou remplace-la dans les réglages de l’IA.',
  ),
  noCredit: frenchSpacing('Ton compte Claude n’a plus de crédit : recharge-le sur console.anthropic.com.'),
  busy: frenchSpacing('Claude est très demandé en ce moment : réessaie dans un instant.'),
  model: frenchSpacing(
    'Ce modèle n’est pas ouvert à ta clé : choisis-en un autre dans les réglages de l’IA.',
  ),
  refused: 'Claude n’a pas voulu analyser cette photo. Essaie avec une autre.',
  cancelled: 'Analyse annulée.',
  failed: 'L’analyse n’a pas abouti. Réessaie, ou note le repas à la main.',
}

/** Les problèmes qui se règlent dans les réglages de l'IA. */
export function needsAiSettings(problem: AiProblem): boolean {
  return problem === 'invalidKey' || problem === 'model'
}

/** Les problèmes passagers, qu'un nouvel essai peut régler. */
export function canRetry(problem: AiProblem): boolean {
  return problem === 'offline' || problem === 'busy' || problem === 'failed'
}

/** La clé masquée, pour la reconnaître sans l'afficher (« sk-ant-…ghij »). */
export function maskKey(key: string): string {
  return key.length <= 12 ? '••••' : `${key.slice(0, 7)}…${key.slice(-4)}`
}
