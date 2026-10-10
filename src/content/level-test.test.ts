import { describe, expect, it } from 'vitest'
import { CALITRACK_EXERCISES } from './exercises/calisthenics'
import {
  EMPTY_LEVEL_TEST,
  LEVEL_TEST_ITEMS,
  formatTestValue,
  hasAnyResult,
  itemLevel,
  overallLevel,
} from './level-test'

const item = (key: string) => {
  const found = LEVEL_TEST_ITEMS.find((i) => i.key === key)
  if (!found) throw new Error(key)
  return found
}

describe('test de niveau', () => {
  it('couvre chaque mesure du test, avec un exercice du répertoire', () => {
    expect(LEVEL_TEST_ITEMS.map((i) => i.key).sort()).toEqual(Object.keys(EMPTY_LEVEL_TEST).sort())
    const exercises = new Map(CALITRACK_EXERCISES.map((e) => [e.id, e]))
    for (const i of LEVEL_TEST_ITEMS) {
      const exercise = exercises.get(i.exerciseId)
      expect(exercise, i.exerciseId).toBeDefined()
      expect(exercise?.measure, i.key).toBe(i.unit === 'sec' ? 'time' : 'reps')
      expect(i.thresholds[0], i.key).toBeLessThan(i.thresholds[1])
      expect(i.thresholds[1], i.key).toBeLessThan(i.max)
    }
  })

  it('classe chaque résultat aux seuils', () => {
    const pullUps = item('pullUps')
    expect(itemLevel(pullUps, 0)).toBe('beginner')
    expect(itemLevel(pullUps, 3)).toBe('beginner')
    expect(itemLevel(pullUps, 4)).toBe('intermediate')
    expect(itemLevel(pullUps, 11)).toBe('intermediate')
    expect(itemLevel(pullUps, 12)).toBe('advanced')
  })

  it('donne un niveau d’ensemble à partir des tests remplis', () => {
    expect(overallLevel(EMPTY_LEVEL_TEST)).toBeNull()
    expect(hasAnyResult(EMPTY_LEVEL_TEST)).toBe(false)
    expect(overallLevel({ ...EMPTY_LEVEL_TEST, pullUps: 2 })).toBe('beginner')
    expect(overallLevel({ ...EMPTY_LEVEL_TEST, pullUps: 15, pushUps: 50 })).toBe('advanced')
    // Débutant + intermédiaire : la moyenne (0,5) s'arrondit vers le haut.
    expect(overallLevel({ ...EMPTY_LEVEL_TEST, pullUps: 1, pushUps: 20 })).toBe('intermediate')
    expect(overallLevel({ ...EMPTY_LEVEL_TEST, pullUps: 0, pushUps: 5, squats: 25, plankSec: 70 })).toBe(
      'beginner',
    )
    expect(hasAnyResult({ ...EMPTY_LEVEL_TEST, plankSec: 0 })).toBe(true)
  })

  it('écrit les résultats en français', () => {
    expect(formatTestValue(item('pushUps'), 0)).toBe('0 répétition')
    expect(formatTestValue(item('pushUps'), 1)).toBe('1 répétition')
    expect(formatTestValue(item('pushUps'), 12)).toBe('12 répétitions')
    expect(formatTestValue(item('plankSec'), 90)).toBe('1 min 30 s')
  })
})
