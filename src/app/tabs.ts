import {
  BookOpen,
  CalendarDays,
  Dumbbell,
  Ellipsis,
  House,
  Mountain,
  Target,
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
