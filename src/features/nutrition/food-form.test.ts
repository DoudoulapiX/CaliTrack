import { ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import type { Food } from '@/db/types'
import { foodFromForm, formFromFood, type FoodForm } from './food-form'

const NB = '\u00a0'

const nutella: Food = {
  id: 'off:3017620422003',
  source: 'off',
  name: 'Pâte à tartiner',
  brand: 'Nutella',
  barcode: '3017620422003',
  per100: {
    kcal: 539,
    protein: 6.3,
    carbs: 57.5,
    fat: 30.9,
    fiber: null,
    sugars: 56.3,
    satFat: 10.6,
    salt: 0.11,
  },
  servingG: 15,
  createdAt: '2026-10-01T08:00:00.000Z',
  updatedAt: '2026-10-01T08:00:00.000Z',
}

const form = (patch: Partial<FoodForm> = {}): FoodForm => ({
  ...formFromFood(null),
  name: 'Granola maison',
  macros: { kcal: 450, protein: 10, carbs: 60, fat: 18 },
  ...patch,
})

describe('formulaire d’un aliment', () => {
  it('part d’un aliment vide, prérempli du nom cherché ou du code scanné', () => {
    expect(formFromFood(null, { name: 'Granola', barcode: '3017620422003' })).toMatchObject({
      name: 'Granola',
      brand: '',
      barcode: '3017620422003',
      macros: { kcal: null, protein: null, carbs: null, fat: null },
      servingG: null,
    })
  })

  it('reprend les valeurs d’un aliment existant', () => {
    expect(formFromFood(nutella)).toEqual({
      name: 'Pâte à tartiner',
      brand: 'Nutella',
      macros: { kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
      fiber: null,
      sugars: 56.3,
      satFat: 10.6,
      salt: 0.11,
      servingG: 15,
      barcode: '3017620422003',
    })
  })

  it('crée un aliment perso aux valeurs nettoyées', () => {
    const result = foodFromForm(
      form({ name: '  Granola maison ', brand: ' Moi ', barcode: ' 3017620422003 ', servingG: 40 }),
      null,
      'id-1',
      'now',
    )
    expect(result).toEqual({
      ok: true,
      food: {
        id: 'id-1',
        source: 'custom',
        name: 'Granola maison',
        brand: 'Moi',
        barcode: '3017620422003',
        per100: { ...ZERO_NUTRIENTS, kcal: 450, protein: 10, carbs: 60, fat: 18 },
        servingG: 40,
        createdAt: 'now',
        updatedAt: 'now',
      },
    })
  })

  it('calcule les calories quand seuls les macronutriments sont donnés', () => {
    const result = foodFromForm(
      form({ macros: { kcal: null, protein: 10, carbs: 60, fat: 18 } }),
      null,
      'id',
      'now',
    )
    expect(result.ok && result.food.per100.kcal).toBe(442)
  })

  it('garde l’identifiant d’un produit corrigé à la main, qui devient un aliment perso', () => {
    const result = foodFromForm(formFromFood(nutella), nutella, 'autre', 'now')
    expect(result.ok && result.food).toMatchObject({
      id: 'off:3017620422003',
      source: 'custom',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: 'now',
    })
  })

  it('refuse un aliment incomplet ou impossible', () => {
    const error = (patch: Partial<FoodForm>) => {
      const result = foodFromForm(form(patch), null, 'id', 'now')
      return result.ok ? null : result.error
    }
    expect(error({ name: '  ' })).toBe('Donne un nom à cet aliment.')
    expect(error({ macros: { kcal: null, protein: null, carbs: null, fat: null } })).toBe(
      `Indique les calories pour 100${NB}g.`,
    )
    expect(error({ macros: { kcal: 400, protein: 50, carbs: 40, fat: 20 } })).toBe(
      `Pour 100${NB}g, protéines, glucides et lipides ne dépassent pas 100${NB}g en tout.`,
    )
    expect(error({ macros: { kcal: 950, protein: 0, carbs: 0, fat: 100 } })).toBe(
      `Pour 100${NB}g, un aliment ne dépasse pas 900${NB}kcal.`,
    )
    expect(error({ sugars: 61 })).toBe(
      `Les sucres font partie des glucides${NB}: ils ne peuvent pas les dépasser.`,
    )
    expect(error({ satFat: 19 })).toBe(
      `Les acides gras saturés font partie des lipides${NB}: ils ne peuvent pas les dépasser.`,
    )
    expect(error({ barcode: '3017620422004' })).toBe(
      `Ce code-barres n’est pas valable${NB}: vérifie les chiffres.`,
    )
    expect(error({ servingG: 6000 })).toBe(`La portion doit faire entre 1${NB}g et 5\u202f000${NB}g.`)
    expect(error({ sugars: 60, satFat: 18, barcode: '', servingG: null })).toBeNull()
  })
})
