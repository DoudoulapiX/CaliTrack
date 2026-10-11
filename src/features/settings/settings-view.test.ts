import { DEFAULT_DASHBOARD_CARDS, DEFAULT_TABS } from '@/db/defaults'
import type { AppSettings } from '@/db/types'
import { backupReminderLabel, climbingModulePatch, shownCards, toggleItem } from './settings-view'

type Layout = Pick<AppSettings, 'hiddenModules' | 'tabs' | 'dashboardCards'>

const layout = (patch: Partial<Layout> = {}): Layout => ({
  hiddenModules: [],
  tabs: [...DEFAULT_TABS],
  dashboardCards: [...DEFAULT_DASHBOARD_CARDS],
  ...patch,
})

describe('toggleItem', () => {
  it('ajoute à la fin ou retire, sans doublon', () => {
    expect(toggleItem(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c'])
    expect(toggleItem(['a', 'b', 'c'], 'b', false)).toEqual(['a', 'c'])
    expect(toggleItem(['a', 'b'], 'a', true)).toEqual(['b', 'a'])
    expect(toggleItem(['a'], 'z', false)).toEqual(['a'])
  })
})

describe('climbingModulePatch', () => {
  it('masquer l’escalade retire son onglet et sa carte', () => {
    expect(climbingModulePatch(layout(), false)).toEqual({
      hiddenModules: ['climbing'],
      tabs: ['today', 'calendar', 'training'],
      dashboardCards: ['todaySession', 'week', 'goals', 'weight', 'records'],
    })
  })

  it('la réafficher remet l’onglet à la fin s’il reste de la place, et la carte', () => {
    const hidden = climbingModulePatch(layout(), false)
    expect(climbingModulePatch(hidden, true)).toEqual({
      hiddenModules: [],
      tabs: ['today', 'calendar', 'training', 'climbing'],
      dashboardCards: ['todaySession', 'week', 'goals', 'weight', 'records', 'climbing'],
    })
  })

  it('ne remet pas l’onglet quand la barre est pleine', () => {
    const full = layout({ hiddenModules: ['climbing'], tabs: ['today', 'calendar', 'training', 'goals'] })
    expect(climbingModulePatch(full, true).tabs).toEqual(['today', 'calendar', 'training', 'goals'])
  })

  it('garde la place de l’onglet et de la carte déjà présents', () => {
    const kept = layout({
      hiddenModules: ['climbing'],
      tabs: ['climbing', 'today'],
      dashboardCards: ['climbing', 'week'],
    })
    expect(climbingModulePatch(kept, true)).toEqual({
      hiddenModules: [],
      tabs: ['climbing', 'today'],
      dashboardCards: ['climbing', 'week'],
    })
  })
})

describe('shownCards', () => {
  it('garde l’ordre choisi, sans doublon', () => {
    expect(shownCards({ dashboardCards: ['week', 'goals', 'week'], hiddenModules: [] })).toEqual([
      'week',
      'goals',
    ])
  })

  it('cache la carte d’escalade quand le module est masqué', () => {
    expect(shownCards({ dashboardCards: ['climbing', 'weight'], hiddenModules: ['climbing'] })).toEqual([
      'weight',
    ])
  })
})

describe('backupReminderLabel', () => {
  it('nomme chaque délai', () => {
    expect(backupReminderLabel(0)).toBe('Jamais')
    expect(backupReminderLabel(7)).toBe('Tous les 7 jours')
  })
})
