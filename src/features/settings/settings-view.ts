import { MAX_TABS } from '@/db/defaults'
import type { AppSettings, DashboardCardKey, ModuleKey, ThemeMode } from '@/db/types'
import type { WeightUnit } from '@/lib/units'

export const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Auto' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

export const WEIGHT_UNIT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'Kilos (kg)' },
  { value: 'lb', label: 'Livres (lb)' },
]

/** Cartes de l'accueil, dans l'ordre proposé par défaut. */
export const DASHBOARD_CARD_LABEL: Record<DashboardCardKey, string> = {
  todaySession: 'Au programme',
  week: 'Ma semaine',
  goals: 'Objectifs épinglés',
  climbing: 'Escalade',
  weight: 'Poids',
  records: 'Records récents',
}

export const ALL_DASHBOARD_CARDS = Object.keys(DASHBOARD_CARD_LABEL) as DashboardCardKey[]

/** Longueur maximale du nom de la salle d'escalade. */
export const GYM_NAME_MAX = 60

/** Rappels de sauvegarde proposés, en jours (0 : jamais). */
export const BACKUP_REMINDER_OPTIONS = [0, 3, 7, 14, 30] as const

export function backupReminderLabel(days: number): string {
  return days === 0 ? 'Jamais' : `Tous les ${String(days)} jours`
}

/** Ajoute l'élément (à la fin) ou le retire. */
export function toggleItem<T>(list: readonly T[], item: T, on: boolean): T[] {
  const without = list.filter((value) => value !== item)
  return on ? [...without, item] : without
}

/**
 * Masquer l'escalade retire aussi son onglet et sa carte de l'accueil ; la réafficher les remet
 * (l'onglet seulement s'il reste de la place dans la barre).
 */
export function climbingModulePatch(
  settings: Pick<AppSettings, 'hiddenModules' | 'tabs' | 'dashboardCards'>,
  shown: boolean,
): Pick<AppSettings, 'hiddenModules' | 'tabs' | 'dashboardCards'> {
  const hiddenModules = toggleItem(settings.hiddenModules, 'climbing', !shown)
  if (!shown) {
    return {
      hiddenModules,
      tabs: settings.tabs.filter((key) => key !== 'climbing'),
      dashboardCards: settings.dashboardCards.filter((key) => key !== 'climbing'),
    }
  }
  const addTab = !settings.tabs.includes('climbing') && settings.tabs.length < MAX_TABS
  return {
    hiddenModules,
    tabs: addTab ? [...settings.tabs, 'climbing'] : [...settings.tabs],
    dashboardCards: settings.dashboardCards.includes('climbing')
      ? [...settings.dashboardCards]
      : [...settings.dashboardCards, 'climbing'],
  }
}

/** Les cartes de l'accueil à afficher, dans l'ordre choisi (sans doublon ni module masqué). */
export function shownCards(settings: {
  dashboardCards: readonly DashboardCardKey[]
  hiddenModules: readonly ModuleKey[]
}): DashboardCardKey[] {
  return settings.dashboardCards.filter(
    (key, index, list) =>
      list.indexOf(key) === index && !(key === 'climbing' && settings.hiddenModules.includes('climbing')),
  )
}
