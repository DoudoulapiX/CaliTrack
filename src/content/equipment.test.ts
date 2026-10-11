import { describe, expect, it } from 'vitest'
import { equipmentKind } from '@/db/schema'
import { CALITRACK_EXERCISES } from './exercises/calisthenics'
import { EQUIPMENT_LABEL, EQUIPMENT_PRESETS, LOCATION_PRESETS, presetFor } from './equipment'

describe('matériel', () => {
  it('a un nom pour chaque type de matériel', () => {
    const missing = equipmentKind.options.filter((kind) => !EQUIPMENT_LABEL[kind])
    expect(missing).toEqual([])
  })

  it('propose chaque matériel utilisé par les exercices CaliTrack', () => {
    const used = new Set(CALITRACK_EXERCISES.flatMap((e) => e.equipment.flat()))
    const notOffered = [...used].filter((kind) => kind !== 'floor' && kind !== 'wall' && !presetFor(kind))
    expect(notOffered).toEqual([])
  })

  it('n’a pas de doublon dans les modèles', () => {
    const kinds = EQUIPMENT_PRESETS.map((p) => p.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it('propose des lieux cohérents', () => {
    const icons = LOCATION_PRESETS.map((l) => l.icon)
    expect(new Set(icons).size).toBe(icons.length)
    for (const location of LOCATION_PRESETS) {
      expect(new Set(location.suggestions).size, location.name).toBe(location.suggestions.length)
      for (const kind of [...location.suggestions, ...location.preselected]) {
        expect(presetFor(kind), `${location.name} : ${kind}`).toBeDefined()
      }
      expect(
        location.preselected.filter((k) => !location.suggestions.includes(k)),
        location.name,
      ).toEqual([])
    }
  })
})
