import { DEFAULT_DASHBOARD_CARDS, DEFAULT_TABS } from './defaults'
import type { AiModel } from './types'

/*
 * Conversions des données d'une version à la suivante. Elles servent deux fois : à la mise à jour de
 * la base dans l'iPhone (db.ts) et à la restauration d'une ancienne sauvegarde (backup.ts).
 */

/** Onglets et cartes proposés par défaut en version 1 (avant la nutrition et Oura). */
export const V1_DEFAULT_TABS = ['today', 'calendar', 'training', 'climbing'] as const
export const V1_DEFAULT_DASHBOARD_CARDS = [
  'todaySession',
  'week',
  'goals',
  'climbing',
  'weight',
  'records',
] as const

/** Modèle d'IA par défaut en version 2 (Claude, avant le passage à OpenAI de la version 4). */
export const V2_DEFAULT_AI_MODEL = 'claude-opus-5-5'

/** Les cartes apparues en version 2. */
const V2_NEW_CARDS = ['recovery', 'nutrition'] as const

type Row = Record<string, unknown>

function sameList(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) && value.length === expected.length && value.every((item, i) => item === expected[i])
  )
}

/**
 * Réglages de la version 1 vers la version 2 : modèle d'IA et réglages Oura par défaut. Les onglets et
 * cartes restés tels quels prennent ceux de la version 2 (avec la nutrition) ; ceux que l'utilisateur
 * a choisis sont gardés, les nouvelles cartes s'ajoutent à la fin.
 */
export function settingsV1toV2(row: Row): Row {
  const cards = Array.isArray(row.dashboardCards) ? (row.dashboardCards as unknown[]) : []
  return {
    ...row,
    tabs: sameList(row.tabs, V1_DEFAULT_TABS) ? [...DEFAULT_TABS] : row.tabs,
    dashboardCards: sameList(cards, V1_DEFAULT_DASHBOARD_CARDS)
      ? [...DEFAULT_DASHBOARD_CARDS]
      : [...cards, ...V2_NEW_CARDS.filter((card) => !cards.includes(card))],
    aiModel: row.aiModel ?? V2_DEFAULT_AI_MODEL,
    ouraClientId: row.ouraClientId ?? '',
    ouraRelayUrl: row.ouraRelayUrl ?? '',
  }
}

/**
 * Modèles Claude des versions 2 et 3, et leur remplaçant chez OpenAI (version 4) : Opus, l'ancien
 * modèle par défaut, prend le nouveau modèle par défaut ; Haiku, choisi pour son prix, le moins cher.
 */
export const V4_MODEL_OF_CLAUDE: Readonly<Record<string, AiModel>> = {
  [V2_DEFAULT_AI_MODEL]: 'gpt-6.2-sol',
  'claude-sonnet-5-5': 'gpt-6.2-sol',
  'claude-haiku-5-5': 'gpt-6-luna',
}

/** Réglages de la version 3 vers la version 4 : l'IA passe de Claude (Anthropic) à ChatGPT (OpenAI). */
export function settingsV3toV4(row: Row): Row {
  const model = typeof row.aiModel === 'string' ? row.aiModel : ''
  return {
    ...row,
    aiModel: Object.hasOwn(V4_MODEL_OF_CLAUDE, model) ? V4_MODEL_OF_CLAUDE[model] : row.aiModel,
  }
}
