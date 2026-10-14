import { idleLimit, trimByCadence } from './cadence'
import { COUNTER_PARAMS } from './specs'

/** Des répétitions toutes les `every` ms, à partir de `from`. */
const reps = (count: number, every: number, from = 0) =>
  Array.from({ length: count }, (_, i) => from + i * every)

describe('trimByCadence', () => {
  it('garde une série régulière', () => {
    const times = reps(10, 2000)
    expect(trimByCadence(times)).toEqual({ kept: times, doubtful: [] })
  })

  it('écarte une ou deux répétitions loin du groupe (mise en place, haltères reposés)', () => {
    const set = reps(8, 2000, 10_000)
    // Médiane 2 s : coupure à max(5 s, 5 s) ; 7 s avant et 9 s après, c'est hors de la série.
    expect(trimByCadence([3000, ...set])).toEqual({ kept: set, doubtful: [3000] })
    expect(trimByCadence([...set, 33_000, 35_000])).toEqual({ kept: set, doubtful: [33_000, 35_000] })
  })

  it('garde un groupe de 3 après une pause (série avec pause)', () => {
    const first = reps(6, 2000)
    const second = reps(3, 2000, 30_000)
    expect(trimByCadence([...first, ...second])).toEqual({ kept: [...first, ...second], doubtful: [] })
  })

  it('ne touche à rien sous 4 répétitions', () => {
    expect(trimByCadence([0, 2000, 40_000])).toEqual({ kept: [0, 2000, 40_000], doubtful: [] })
    expect(trimByCadence([])).toEqual({ kept: [], doubtful: [] })
  })

  it('coupe à médiane + 3 s quand la cadence est rapide', () => {
    // Médiane 1 s : coupure à max(2,5 s, 4 s) = 4 s ; 3,9 s reste dans la série, 4,1 s non.
    expect(trimByCadence([0, 1000, 2000, 3000, 6900]).doubtful).toEqual([])
    expect(trimByCadence([0, 1000, 2000, 3000, 7100]).doubtful).toEqual([7100])
  })

  it('garde le premier groupe à égalité de taille', () => {
    const result = trimByCadence([0, 1000, 20_000, 21_000], { cadenceGapFactor: 2.5, cadenceGapMs: 3000 })
    expect(result).toEqual({ kept: [0, 1000], doubtful: [20_000, 21_000] })
  })
})

describe('idleLimit', () => {
  it('attend 10 s avant la troisième répétition', () => {
    expect(idleLimit([])).toBe(10_000)
    expect(idleLimit([0, 2000])).toBe(COUNTER_PARAMS.idleBefore3Ms)
  })

  it('attend ensuite trois intervalles habituels, de 6 à 12 s', () => {
    expect(idleLimit(reps(5, 2500))).toBe(7500)
    expect(idleLimit(reps(5, 1000))).toBe(6000)
    expect(idleLimit(reps(5, 5000))).toBe(12_000)
  })
})
