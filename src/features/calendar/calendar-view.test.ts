import { describe, expect, it } from 'vitest'
import { describeSeries, measuresLine } from './calendar-view'

describe('vue du calendrier', () => {
  it('décrit durée, distance et calories sans couper un nombre de son unité', () => {
    expect(measuresLine({ time: '09:30', durationMin: 42, distanceKm: 7.5, energyKcal: 480 })).toBe(
      '09:30 · 42 min · 7,5 km · 480 kcal',
    )
    expect(measuresLine({ time: null, durationMin: 90 })).toBe('90 min')
    expect(measuresLine({ time: null, durationMin: null, distanceKm: null, energyKcal: null })).toBe('')
  })

  it('décrit une séance répétée', () => {
    expect(describeSeries({ weekdays: [2, 4], intervalWeeks: 1, endDate: null })).toBe(
      'Chaque mardi et jeudi',
    )
    expect(describeSeries({ weekdays: [6], intervalWeeks: 2, endDate: '2026-12-19' })).toBe(
      'Toutes les 2 semaines, le samedi, jusqu’au 19 décembre 2026',
    )
  })
})
