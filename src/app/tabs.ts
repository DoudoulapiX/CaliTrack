import {
  BookOpen,
  CalendarDays,
  Dumbbell,
  Ellipsis,
  House,
  Mountain,
  Target,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
import type { AppSettings, TabKey } from '@/db/types'
import { MAX_TABS } from '@/db/defaults'

export interface TabDef {
  key: TabKey | 'more'
  label: string
  icon: LucideIcon
  to: string
}

export const TAB_DEFS: Record<TabKey, TabDef> = {
  today: { key: 'today', label: 'Aujourd’hui', icon: House, to: '/' },
  calendar: { key: 'calendar', label: 'Calendrier', icon: CalendarDays, to: '/calendar' },
  training: { key: 'training', label: 'Entraînement', icon: Dumbbell, to: '/training' },
  nutrition: { key: 'nutrition', label: 'Nutrition', icon: Utensils, to: '/nutrition' },
  climbing: { key: 'climbing', label: 'Escalade', icon: Mountain, to: '/climbing' },
  goals: { key: 'goals', label: 'Objectifs', icon: Target, to: '/goals' },
  library: { key: 'library', label: 'Exercices', icon: BookOpen, to: '/library' },
}

export const MORE_TAB: TabDef = { key: 'more', label: 'Plus', icon: Ellipsis, to: '/more' }

export const ALL_TAB_KEYS = Object.keys(TAB_DEFS) as TabKey[]

/** Onglets réellement affichés : ceux choisis (modules masqués exclus), puis « Plus ». */
export function visibleTabs(settings: Pick<AppSettings, 'tabs' | 'hiddenModules'>): TabDef[] {
  const tabs = settings.tabs
    .filter((key, index, list) => list.indexOf(key) === index)
    .filter((key) => !(key === 'climbing' && settings.hiddenModules.includes('climbing')))
    .slice(0, MAX_TABS)
    .map((key) => TAB_DEFS[key])
  return [...tabs, MORE_TAB]
}

/** Partie de l'appli à laquelle appartient une adresse (null : aucune, l'accueil par exemple). */
export function sectionOf(pathname: string): TabDef['key'] | null {
  switch (pathname.split('/')[1] ?? '') {
    case '':
      return 'today'
    case 'calendar':
      return 'calendar'
    case 'training':
    case 'workout':
      return 'training'
    case 'nutrition':
      return 'nutrition'
    case 'climbing':
      return 'climbing'
    case 'goals':
      return 'goals'
    case 'library':
      return 'library'
    case 'more':
      return 'more'
    default:
      return null
  }
}

/**
 * Onglet mis en avant pour une adresse : celui de sa partie de l'appli, ou « Plus » quand cette
 * partie n'a pas d'onglet dans la barre (on y arrive par « Plus »).
 */
export function activeTab(pathname: string, tabs: readonly TabDef[]): TabDef['key'] | null {
  const section = sectionOf(pathname)
  if (section === null) return null
  return tabs.some((tab) => tab.key === section) ? section : MORE_TAB.key
}
