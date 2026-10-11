import type { Nutrients } from '@/db/types'
import {
  kcalFromMacros,
  per100Of,
  roundNutrients,
  scaleNutrients,
  sumNutrients,
  ZERO_NUTRIENTS,
} from './nutrients'

const rice: Nutrients = {
  kcal: 145,
  protein: 2.9,
  carbs: 31.4,
  fat: 0.4,
  fiber: 1.3,
  sugars: 0,
  satFat: 0.1,
  salt: 0.01,
}

describe('valeurs nutritionnelles', () => {
  it('calcule les valeurs d’une quantité', () => {
    expect(scaleNutrients(rice, 250)).toEqual({
      kcal: 363,
      protein: 7.3,
      carbs: 78.5,
      fat: 1,
      fiber: 3.3,
      sugars: 0,
      satFat: 0.3,
      salt: 0.03,
    })
    expect(scaleNutrients(rice, 0).kcal).toBe(0)
  })

  it('retrouve les valeurs pour 100 g d’une portion estimée', () => {
    const plate: Nutrients = { ...ZERO_NUTRIENTS, kcal: 300, protein: 30, carbs: 20, fat: 10 }
    expect(per100Of(plate, 200)).toEqual({ ...ZERO_NUTRIENTS, kcal: 150, protein: 15, carbs: 10, fat: 5 })
  })

  it('additionne les aliments, en gardant inconnu ce qu’aucun ne donne', () => {
    const total = sumNutrients([rice, { ...ZERO_NUTRIENTS, kcal: 100, protein: 10, carbs: 0, fat: 7 }])
    expect(total).toEqual({
      kcal: 245,
      protein: 12.9,
      carbs: 31.4,
      fat: 7.4,
      fiber: 1.3,
      sugars: 0,
      satFat: 0.1,
      salt: 0.01,
    })
    expect(sumNutrients([])).toEqual(ZERO_NUTRIENTS)
  })

  it('arrondit sans fausses décimales', () => {
    expect(roundNutrients({ ...ZERO_NUTRIENTS, kcal: 99.6, protein: 0.1 + 0.2, salt: 0.125 })).toMatchObject({
      kcal: 100,
      protein: 0.3,
      salt: 0.13,
    })
    expect(kcalFromMacros({ protein: 10, carbs: 20, fat: 5 })).toBe(165)
  })
})
