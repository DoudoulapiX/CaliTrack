import { defaultSettings } from '@/db/defaults'
import { activeTab, sectionOf, visibleTabs } from './tabs'

const keys = (settings: Parameters<typeof visibleTabs>[0]) => visibleTabs(settings).map((tab) => tab.key)

describe('onglets', () => {
  it('affiche les onglets choisis, sans doublon ni module masqué, puis « Plus »', () => {
    const settings = defaultSettings('2026-10-01T08:00:00.000Z')
    expect(keys(settings)).toEqual(['today', 'training', 'nutrition', 'climbing', 'more'])
    expect(keys({ ...settings, hiddenModules: ['climbing'] })).toEqual([
      'today',
      'training',
      'nutrition',
      'more',
    ])
    expect(keys({ ...settings, tabs: ['goals', 'goals', 'today'] })).toEqual(['goals', 'today', 'more'])
    expect(keys({ ...settings, tabs: ['today', 'calendar', 'training', 'climbing', 'goals'] })).toHaveLength(
      5,
    )
  })

  it('range chaque adresse dans sa partie de l’appli', () => {
    expect(sectionOf('/')).toBe('today')
    expect(sectionOf('/calendar')).toBe('calendar')
    expect(sectionOf('/training/programs/p1')).toBe('training')
    expect(sectionOf('/workout/w1')).toBe('training')
    expect(sectionOf('/nutrition/add')).toBe('nutrition')
    expect(sectionOf('/climbing/stats')).toBe('climbing')
    expect(sectionOf('/goals/new')).toBe('goals')
    expect(sectionOf('/library/pullup')).toBe('library')
    expect(sectionOf('/more/settings')).toBe('more')
    expect(sectionOf('/onboarding')).toBeNull()
  })

  it('met en avant « Plus » pour un écran sans onglet', () => {
    const tabs = visibleTabs(defaultSettings('2026-10-01T08:00:00.000Z'))
    expect(activeTab('/training/history', tabs)).toBe('training')
    expect(activeTab('/nutrition/foods', tabs)).toBe('nutrition')
    expect(activeTab('/calendar', tabs)).toBe('more')
    expect(activeTab('/goals/g1', tabs)).toBe('more')
    expect(activeTab('/library', tabs)).toBe('more')
    expect(activeTab('/more/backup', tabs)).toBe('more')
    expect(activeTab('/inconnue', tabs)).toBeNull()
  })
})
