import type { MealKey } from '@/db/types'

export const MEAL_ORDER: readonly MealKey[] = ['breakfast', 'lunch', 'snack', 'dinner']

export const MEAL_LABEL: Record<MealKey, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  snack: 'Collation',
  dinner: 'Dîner',
}

/** Le repas le plus probable à cette heure : petit-déjeuner jusqu'à 10 h 30, déjeuner jusqu'à 15 h, etc. */
export function mealAt(date: Date): MealKey {
  const minutes = date.getHours() * 60 + date.getMinutes()
  if (minutes < 10 * 60 + 30) return 'breakfast'
  if (minutes < 15 * 60) return 'lunch'
  if (minutes < 18 * 60 + 30) return 'snack'
  return 'dinner'
}

export function isMealKey(value: string | null): value is MealKey {
  return value !== null && (MEAL_ORDER as readonly string[]).includes(value)
}
