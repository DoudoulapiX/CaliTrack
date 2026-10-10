import type { Location } from '@/db/types'
import { newEquipmentItem, newLocation } from '@/db/equipment'
import {
  LOCATION_ICON_ORDER,
  defaultLocationIds,
  defaultLocationName,
  equipmentAt,
  equipmentSummary,
  nextLocationIcon,
  shownWeight,
  sortLocations,
  weightsFromShown,
  weightsSummary,
} from './equipment-view'

const place = (icon: Location['icon'], name: string, id: string): Location => ({
  ...newLocation(icon, name),
  id,
})

describe('présentation du matériel', () => {
  const home = place('home', 'Maison', 'h')
  const park = place('park', 'Parc', 'p')
  const gym = place('gym', 'Salle', 'g')

  it('range les lieux dans un ordre stable', () => {
    expect(sortLocations([park, place('other', 'Bureau', 'o'), gym, home]).map((l) => l.id)).toEqual([
      'h',
      'g',
      'p',
      'o',
    ])
  })

  it('propose le premier type de lieu libre et son nom', () => {
    expect(nextLocationIcon([])).toBe('home')
    expect(nextLocationIcon([home, gym])).toBe('park')
    expect(nextLocationIcon(LOCATION_ICON_ORDER.map((icon) => place(icon, 'x', icon)))).toBe('other')
    expect(defaultLocationName('park')).toBe('Parc')
    expect(defaultLocationName('climb')).toBe('Salle d’escalade')
    expect(defaultLocationName('other')).toBe('')
  })

  it('range un nouvel objet dans le lieu actuel ou le seul lieu', () => {
    expect(defaultLocationIds([home, park], 'p')).toEqual(['p'])
    expect(defaultLocationIds([home, park], 'disparu')).toEqual([])
    expect(defaultLocationIds([home, park], null)).toEqual([])
    expect(defaultLocationIds([home], null)).toEqual(['h'])
    expect(defaultLocationIds([], null)).toEqual([])
  })

  it('compte le matériel utilisable dans un lieu', () => {
    const items = [
      newEquipmentItem('pullupBar', ['h', 'p']),
      newEquipmentItem('mat'),
      newEquipmentItem('dumbbells', ['h']),
    ]
    expect(equipmentAt(items, 'h')).toHaveLength(3)
    expect(equipmentAt(items, 'p')).toHaveLength(2)
  })

  it('résume les charges', () => {
    expect(weightsSummary([], 'kg')).toBe('')
    expect(weightsSummary([2, 7.5], 'kg')).toBe('2 kg, 7,5 kg')
    expect(weightsSummary([2, 4, 6, 20], 'kg')).toBe('2 à 20 kg (4 charges)')
    expect(weightsSummary([4.54, 9.07], 'lb')).toBe('10 lb, 20 lb')
  })

  it('résume un objet avec ses lieux', () => {
    const dumbbells = { ...newEquipmentItem('dumbbells', ['p', 'h']), weightsKg: [2, 5] }
    expect(equipmentSummary(dumbbells, [park, home], 'kg')).toBe('2 kg, 5 kg · Maison, Parc')
    expect(equipmentSummary(newEquipmentItem('bands'), [home], 'kg')).toBe('4 niveaux · Partout')
    // Sans lieu enregistré, inutile de préciser « Partout ».
    expect(equipmentSummary(newEquipmentItem('mat'), [], 'kg')).toBe('')
  })

  it('garde les charges exactes en kg quand on travaille en livres', () => {
    const current = [11.34]
    expect(shownWeight(11.34, 'lb')).toBe(25)
    expect(weightsFromShown([25], current, 'lb')).toEqual([11.34])
    const [added] = weightsFromShown([25, 35], current, 'lb').slice(1)
    expect(added).toBeCloseTo(15.876, 3)
    expect(weightsFromShown([2, 5], [2], 'kg')).toEqual([2, 5])
  })
})
