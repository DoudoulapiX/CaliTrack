import type { Nutrients } from '@/db/types'

export const ZERO_NUTRIENTS: Nutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: null,
  sugars: null,
  satFat: null,
  salt: null,
}

const OPTIONAL = ['fiber', 'sugars', 'satFat', 'salt'] as const

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Arrondis enregistrés : kcal à l'unité, grammes au dixième, sel au centième. */
export function roundNutrients(n: Nutrients): Nutrients {
  const optional = (value: number | null, digits: number) => (value === null ? null : round(value, digits))
  return {
    kcal: Math.round(n.kcal),
    protein: round(n.protein, 1),
    carbs: round(n.carbs, 1),
    fat: round(n.fat, 1),
    fiber: optional(n.fiber, 1),
    sugars: optional(n.sugars, 1),
    satFat: optional(n.satFat, 1),
    salt: optional(n.salt, 2),
  }
}

/** Les valeurs d'une quantité, à partir des valeurs pour 100 g. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const factor = grams / 100
  const optional = (value: number | null) => (value === null ? null : value * factor)
  return roundNutrients({
    kcal: per100.kcal * factor,
    protein: per100.protein * factor,
    carbs: per100.carbs * factor,
    fat: per100.fat * factor,
    fiber: optional(per100.fiber),
    sugars: optional(per100.sugars),
    satFat: optional(per100.satFat),
    salt: optional(per100.salt),
  })
}

/** Les valeurs pour 100 g, à partir de celles d'une quantité (estimation de l'IA). */
export function per100Of(nutrients: Nutrients, grams: number): Nutrients {
  return scaleNutrients(nutrients, (100 * 100) / grams)
}

/** Le total de plusieurs aliments ; une valeur facultative reste connue si au moins un aliment la donne. */
export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  const total: Nutrients = { ...ZERO_NUTRIENTS }
  for (const n of list) {
    total.kcal += n.kcal
    total.protein += n.protein
    total.carbs += n.carbs
    total.fat += n.fat
    for (const key of OPTIONAL) {
      const value = n[key]
      if (value !== null) total[key] = (total[key] ?? 0) + value
    }
  }
  return roundNutrients(total)
}

/** Énergie apportée par les macronutriments (4 kcal/g de protéines et de glucides, 9 kcal/g de lipides). */
export function kcalFromMacros(macros: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): number {
  return 4 * macros.protein + 4 * macros.carbs + 9 * macros.fat
}
