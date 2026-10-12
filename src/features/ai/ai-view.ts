import type { AiProblem } from '@/content/ai/client'
import { frenchSpacing, keepTogether } from '@/lib/typography'

/** Où régler l'IA dans l'appli. */
export const AI_SETTINGS_PATH = '/more/ai'

/** Ce qu'on dit quand Claude n'a pas pu répondre. */
export const AI_PROBLEM_TEXT: Record<AiProblem, string> = {
  offline: frenchSpacing('Pas de connexion : réessaie une fois connecté.'),
  invalidKey: frenchSpacing(
    'Ta clé Claude est refusée : vérifie-la ou remplace-la dans les réglages de l’IA.',
  ),
  noCredit: frenchSpacing('Ton compte Claude n’a plus de crédit : recharge-le sur platform.claude.com.'),
  busy: frenchSpacing('Claude est très demandé en ce moment : réessaie dans un instant.'),
  model: frenchSpacing(
    'Ce modèle n’est pas ouvert à ta clé : choisis-en un autre dans les réglages de l’IA.',
  ),
  refused: 'Claude n’a pas voulu analyser cette photo. Essaie avec une autre.',
  cancelled: 'Analyse annulée.',
  failed: 'L’analyse n’a pas abouti. Réessaie, ou note le repas à la main.',
}

/** Les demandes faites à Claude, pour dire ce qui n'a pas marché avec les bons mots. */
export type AiTask = 'photo' | 'daily' | 'body' | 'fridge' | 'ideas' | 'chat'

/** Refus et échecs de chaque demande du coach (ceux de la photo de repas sont dans AI_PROBLEM_TEXT). */
const TASK_TEXT: Record<Exclude<AiTask, 'photo'>, { refused: string; failed: string }> = {
  daily: {
    refused: 'Le coach n’a pas voulu répondre à cette demande.',
    failed: 'Le coach n’a pas pu préparer ton conseil. Réessaie.',
  },
  body: {
    refused: 'Claude n’analyse pas ces photos. Essaie avec d’autres, en tenue de sport.',
    failed: 'L’analyse n’a pas abouti. Réessaie.',
  },
  fridge: {
    refused: 'Claude n’a pas voulu analyser cette photo.',
    failed: 'Impossible de lire cette photo. Réessaie avec une photo plus nette.',
  },
  ideas: {
    refused: 'Le coach n’a pas voulu proposer d’idées pour cette demande.',
    failed: 'Le coach n’a pas pu proposer d’idées. Réessaie.',
  },
  chat: {
    refused: 'Le coach ne répond pas à ce message.',
    failed: 'Le coach n’a pas pu répondre. Réessaie.',
  },
}

/** Ce qu'on dit quand une demande à Claude n'a pas abouti. */
export function problemText(problem: AiProblem, task: AiTask): string {
  if (task === 'photo' || (problem !== 'refused' && problem !== 'failed')) {
    return frenchSpacing(AI_PROBLEM_TEXT[problem])
  }
  return frenchSpacing(TASK_TEXT[task][problem])
}

/**
 * Le prix d'une demande ordinaire, avant de la faire : « Environ 8 centimes avec Opus 5.5 » (arrondi au
 * centime supérieur), ou « Moins d'un centime avec Haiku 5.5 ».
 */
export function costHintText(costUsd: number, modelLabel: string): string {
  const cents = costUsd * 100
  const model = keepTogether(modelLabel)
  if (cents < 1) return frenchSpacing(`Moins d’un centime avec ${model}`)
  // Sans la marge, 7 centimes calculés en 7,000000001 s'afficheraient 8.
  const rounded = Math.ceil(cents - 1e-9)
  const amount = keepTogether(`${String(rounded)} centime${rounded > 1 ? 's' : ''}`)
  return frenchSpacing(`Environ ${amount} avec ${model}`)
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
