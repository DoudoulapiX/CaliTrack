import type { FoodItem } from '@/content/nutrition/foods'
import { per100Of, roundNutrients, scaleNutrients } from '@/content/nutrition/nutrients'
import { nowISO, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { db as defaultDb, type CaliTrackDB } from './db'
import { foodEntrySchema, foodSchema, nutritionGoalsSchema } from './schema'
import type { Food, FoodEntry, MealKey, NutritionGoals, Nutrients } from './types'

/* ------------------------------------------------------------------ */
/* Journal des repas                                                   */
/* ------------------------------------------------------------------ */

/** Plus grande quantité acceptée pour un aliment, en grammes. */
export const MAX_GRAMS = 5000

/** Ce que l'on note : un aliment et sa quantité. */
export function entryFromFood(
  item: Pick<FoodItem, 'id' | 'source' | 'name' | 'per100'>,
  grams: number,
  date: ISODate,
  meal: MealKey,
  now: string = nowISO(),
): FoodEntry {
  return {
    id: newId(),
    date,
    meal,
    source: item.source,
    foodId: item.id,
    name: item.name,
    grams,
    per100: item.per100,
    nutrients: scaleNutrients(item.per100, grams),
    note: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** Un aliment estimé par l'IA sur une photo : ses valeurs pour la quantité vue. */
export function entryFromEstimate(
  estimate: { name: string; grams: number; nutrients: Nutrients },
  date: ISODate,
  meal: MealKey,
  now: string = nowISO(),
): FoodEntry {
  const nutrients = roundNutrients(estimate.nutrients)
  return {
    id: newId(),
    date,
    meal,
    source: 'ai',
    foodId: null,
    name: estimate.name,
    grams: estimate.grams,
    per100: per100Of(nutrients, estimate.grams),
    nutrients,
    note: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** Une saisie rapide : un nom et des valeurs, sans aliment ni quantité (« Repas au restaurant »). */
export function quickEntry(
  name: string,
  nutrients: Nutrients,
  date: ISODate,
  meal: MealKey,
  now: string = nowISO(),
): FoodEntry {
  return {
    id: newId(),
    date,
    meal,
    source: 'quick',
    foodId: null,
    name,
    grams: null,
    per100: null,
    nutrients: roundNutrients(nutrients),
    note: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** Enregistre des aliments notés (vérifiés). */
export async function addEntries(
  entries: readonly FoodEntry[],
  database: CaliTrackDB = defaultDb,
): Promise<FoodEntry[]> {
  const valid = entries.map((entry) => foodEntrySchema.parse(entry))
  await database.foodEntries.bulkPut(valid)
  return valid
}

export interface EntryPatch {
  meal?: MealKey
  date?: ISODate
  /** Nouvelle quantité : les valeurs sont recalculées (pas pour une saisie rapide). */
  grams?: number
  name?: string
  /** Nouvelles valeurs (saisie rapide seulement). */
  nutrients?: Nutrients
  note?: string
}

/** Change un aliment noté : repas, quantité (valeurs recalculées), nom ou note. */
export async function updateEntry(
  id: string,
  patch: EntryPatch,
  database: CaliTrackDB = defaultDb,
): Promise<FoodEntry> {
  return database.transaction('rw', database.foodEntries, async () => {
    const entry = await database.foodEntries.get(id)
    if (!entry) throw new Error('Cet aliment n’est plus dans le journal.')
    const next: FoodEntry = { ...entry, updatedAt: nowISO() }
    if (patch.meal !== undefined) next.meal = patch.meal
    if (patch.date !== undefined) next.date = patch.date
    if (patch.name !== undefined) next.name = patch.name.trim()
    if (patch.note !== undefined) next.note = patch.note
    if (patch.grams !== undefined && entry.per100 !== null) {
      next.grams = patch.grams
      next.nutrients = scaleNutrients(entry.per100, patch.grams)
    }
    if (patch.nutrients !== undefined && entry.per100 === null)
      next.nutrients = roundNutrients(patch.nutrients)
    const valid = foodEntrySchema.parse(next)
    await database.foodEntries.put(valid)
    return valid
  })
}

export async function deleteEntries(
  ids: readonly string[],
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.foodEntries.bulkDelete([...ids])
}

/** Recopie des aliments notés vers un autre jour ou un autre repas (« comme hier midi »). */
export async function copyEntries(
  entries: readonly FoodEntry[],
  date: ISODate,
  meal: MealKey,
  database: CaliTrackDB = defaultDb,
): Promise<FoodEntry[]> {
  const now = nowISO()
  return addEntries(
    entries.map((entry) => ({ ...entry, id: newId(), date, meal, createdAt: now, updatedAt: now })),
    database,
  )
}

/**
 * Les aliments notés récemment, du plus récent au plus ancien, une fois chacun : on les retrouve en
 * tête pour les noter à nouveau, avec la dernière quantité mangée.
 */
export async function recentFoods(limit = 30, database: CaliTrackDB = defaultDb): Promise<FoodItem[]> {
  const entries = await database.foodEntries.orderBy('date').reverse().limit(400).toArray()
  entries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  const seen = new Set<string>()
  const items: FoodItem[] = []
  for (const entry of entries) {
    if (entry.foodId === null || entry.per100 === null || entry.source === 'ai' || entry.source === 'quick')
      continue
    if (seen.has(entry.foodId)) continue
    seen.add(entry.foodId)
    items.push({
      id: entry.foodId,
      source: entry.source,
      name: entry.name,
      detail: '',
      per100: entry.per100,
      portionG: entry.grams,
    })
    if (items.length >= limit) break
  }
  return items
}

/* ------------------------------------------------------------------ */
/* Aliments perso et produits scannés                                  */
/* ------------------------------------------------------------------ */

/** Enregistre un aliment perso ou un produit scanné (vérifié). */
export async function saveFood(food: Food, database: CaliTrackDB = defaultDb): Promise<Food> {
  const valid = foodSchema.parse({
    ...food,
    name: food.name.trim(),
    brand: food.brand.trim(),
    updatedAt: nowISO(),
  })
  await database.foods.put(valid)
  return valid
}

export async function deleteFood(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.foods.delete(id)
}

/** Un aliment perso ou un produit déjà scanné qui porte ce code-barres. */
export async function foodByBarcode(
  barcode: string,
  database: CaliTrackDB = defaultDb,
): Promise<Food | undefined> {
  const found = await database.foods.where('barcode').equals(barcode).toArray()
  // Un aliment perso (corrigé à la main) passe avant la fiche d'Open Food Facts.
  return found.find((food) => food.source === 'custom') ?? found[0]
}

/* ------------------------------------------------------------------ */
/* Objectifs caloriques                                                */
/* ------------------------------------------------------------------ */

export type NutritionGoalsPatch = Partial<Omit<NutritionGoals, 'id' | 'createdAt' | 'updatedAt'>>

export async function updateNutritionGoals(
  patch: NutritionGoalsPatch,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.nutritionGoals, async () => {
    const goals = await database.nutritionGoals.get('me')
    if (!goals) throw new Error('Objectifs caloriques introuvables.')
    await database.nutritionGoals.put(nutritionGoalsSchema.parse({ ...goals, ...patch, updatedAt: nowISO() }))
  })
}
