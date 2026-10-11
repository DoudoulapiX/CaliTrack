import { isMealKey, mealAt, MEAL_LABEL, MEAL_ORDER } from './meals'

describe('repas', () => {
  it('propose le repas selon l’heure', () => {
    expect(mealAt(new Date(2026, 9, 21, 7, 30))).toBe('breakfast')
    expect(mealAt(new Date(2026, 9, 21, 10, 30))).toBe('lunch')
    expect(mealAt(new Date(2026, 9, 21, 16, 0))).toBe('snack')
    expect(mealAt(new Date(2026, 9, 21, 20, 15))).toBe('dinner')
  })

  it('reconnaît les repas et les nomme dans l’ordre de la journée', () => {
    expect(isMealKey('lunch')).toBe(true)
    expect(isMealKey('brunch')).toBe(false)
    expect(isMealKey(null)).toBe(false)
    expect(MEAL_ORDER.map((meal) => MEAL_LABEL[meal])).toEqual([
      'Petit-déjeuner',
      'Déjeuner',
      'Collation',
      'Dîner',
    ])
  })
})
