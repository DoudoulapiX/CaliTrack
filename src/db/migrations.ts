import { DEFAULT_AI_MODEL, DEFAULT_DASHBOARD_CARDS, DEFAULT_TABS } from './defaults'

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
    aiModel: row.aiModel ?? DEFAULT_AI_MODEL,
    ouraClientId: row.ouraClientId ?? '',
    ouraRelayUrl: row.ouraRelayUrl ?? '',
  }
}
