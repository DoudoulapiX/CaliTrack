import type { EstimatedItem } from '@/content/ai/meal-photo'
import { roundNutrients, ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import type { MealKey, Nutrients } from '@/db/types'
import { formatGrams, formatKcal, mealTo } from './nutrition-view'

/** Un aliment reconnu sur la photo, gardé ou non dans le repas. */
export interface PhotoItem extends EstimatedItem {
  id: string
  keep: boolean
}

export function photoItems(items: readonly EstimatedItem[]): PhotoItem[] {
  return items.map((item, index) => ({ ...item, id: String(index), keep: true }))
}

/** « 150 g · 248 kcal ». */
export function photoItemLine(item: EstimatedItem): string {
  return `${formatGrams(item.grams)} · ${formatKcal(item.nutrients.kcal)}`
}

/** Les valeurs pour une autre quantité, proportionnelles à l'estimation. */
export function rescaleItem(item: EstimatedItem, grams: number): EstimatedItem {
  if (item.grams <= 0) return { ...item, grams }
  const factor = grams / item.grams
  const scale = (value: number | null) => (value === null ? null : value * factor)
  const n = item.nutrients
  return {
    ...item,
    grams,
    nutrients: roundNutrients({
      kcal: n.kcal * factor,
      protein: n.protein * factor,
      carbs: n.carbs * factor,
      fat: n.fat * factor,
      fiber: scale(n.fiber),
      sugars: scale(n.sugars),
      satFat: scale(n.satFat),
      salt: scale(n.salt),
    }),
  }
}

/** Le total des aliments gardés. */
export function keptTotal(items: readonly PhotoItem[]): Nutrients {
  return roundNutrients(
    items
      .filter((item) => item.keep)
      .reduce(
        (sum, item) => ({
          ...sum,
          kcal: sum.kcal + item.nutrients.kcal,
          protein: sum.protein + item.nutrients.protein,
          carbs: sum.carbs + item.nutrients.carbs,
          fat: sum.fat + item.nutrients.fat,
        }),
        ZERO_NUTRIENTS,
      ),
  )
}

const aliments = (count: number) => (count === 1 ? '1 aliment' : `${String(count)} aliments`)

/** Le bouton d'ajout : « Ajouter 3 aliments au déjeuner ». */
export function addItemsLabel(count: number, meal: MealKey): string {
  return count === 0 ? 'Garde au moins un aliment' : `Ajouter ${aliments(count)} ${mealTo(meal)}`
}

/** Le message après l'ajout : « 3 aliments ajoutés au déjeuner ». */
export function itemsAddedText(count: number, meal: MealKey): string {
  return `${aliments(count)} ${count === 1 ? 'ajouté' : 'ajoutés'} ${mealTo(meal)}`
}
