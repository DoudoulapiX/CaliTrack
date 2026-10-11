import { floorPercent, percentLabel, percentOf } from './goal-view'

describe('pourcentage d’un objectif', () => {
  it('arrondit à l’unité inférieure, sans les erreurs d’arrondi des décimaux', () => {
    // De 75 à 72 kg, à 73,2 kg : 1,8 kg perdus sur 3, soit 60 % (75 − 73,2 donne 1,7999…).
    expect(floorPercent((75 - 73.2) / (75 - 72))).toBe(60)
    expect(floorPercent(1 / 6)).toBe(16)
    expect(floorPercent(0.999)).toBe(99)
    expect(floorPercent(0)).toBe(0)
  })

  it('ne montre 100 % qu’une fois l’objectif atteint', () => {
    expect(percentOf({ ratio: 1, achieved: false })).toBe(99)
    expect(percentOf({ ratio: 1, achieved: true })).toBe(100)
    expect(percentOf({ ratio: (75 - 73.2) / (75 - 72), achieved: false })).toBe(60)
    expect(percentLabel({ ratio: 0.5, achieved: false })).toBe('50\u00a0%')
  })
})
