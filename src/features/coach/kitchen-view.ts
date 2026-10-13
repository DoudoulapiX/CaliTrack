import { PLACE_ORDER, type IdeaItem, type Macros } from '@/content/coach/kitchen'
import { sumNutrients } from '@/content/nutrition/nutrients'
import type { PantryItem, PantryPlace } from '@/db/types'
import { formatDay, type ISODate } from '@/lib/dates'
import { frenchSpacing, keepTogether } from '@/lib/typography'
import { formatGrams, formatKcal } from '@/features/nutrition/nutrition-view'
import type { PhotoItem } from '@/features/nutrition/photo-view'

/* Textes et calculs des écrans « Frigo et placards ». */

/** Où l'on range : « au frigo », « aux placards ». */
const PLACE_TO: Record<PantryPlace, string> = {
  fridge: 'au frigo',
  freezer: 'au congélateur',
  cupboard: 'aux placards',
}

/** Où l'on regarde : « dans ton frigo », « dans tes placards ». */
const PLACE_IN: Record<PantryPlace, string> = {
  fridge: 'dans ton frigo',
  freezer: 'dans ton congélateur',
  cupboard: 'dans tes placards',
}

const REPLACE_LABEL: Record<PantryPlace, string> = {
  fridge: 'Remplacer le frigo',
  freezer: 'Remplacer le congélateur',
  cupboard: 'Remplacer les placards',
}

export const EMPTY_PANTRY_TEXT = 'Ton frigo est vide ici. Ajoute ce que tu as, ou prends-le en photo.'
export const STRICT_EMPTY_TEXT = 'Ajoute d’abord ce que tu as dans ton frigo.'

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

/** Les aliments rangés par place (frigo, congélateur, placards), chacun par ordre alphabétique. */
export function pantryByPlace(items: readonly PantryItem[]): { place: PantryPlace; items: PantryItem[] }[] {
  return PLACE_ORDER.map((place) => ({
    place,
    items: items.filter((item) => item.place === place).sort((a, b) => collator.compare(a.name, b.name)),
  }))
}

/** « 1 aliment », « 7 aliments ». */
export function aliments(count: number): string {
  return count === 1 ? '1 aliment' : `${String(count)} aliments`
}

/** « 9 aliments notés », « Aucun aliment noté ». */
export function pantryCountText(count: number): string {
  if (count === 0) return 'Aucun aliment noté'
  return `${aliments(count)} ${count === 1 ? 'noté' : 'notés'}`
}

/* ------------------------------------------------------------------ */
/* Photo du frigo                                                      */
/* ------------------------------------------------------------------ */

/** Un aliment lu sur la photo, à garder ou non, dont le nom et la quantité se corrigent. */
export interface ReviewItem {
  id: string
  name: string
  quantity: string
  keep: boolean
}

export function reviewItems(items: readonly { name: string; quantity: string }[]): ReviewItem[] {
  return items.map((item, index) => ({ ...item, id: String(index), keep: true }))
}

/** Les aliments à enregistrer : gardés, avec un nom. */
export function keptNames(items: readonly ReviewItem[]): { name: string; quantity: string }[] {
  return items
    .filter((item) => item.keep && item.name.trim() !== '')
    .map((item) => ({ name: item.name.trim(), quantity: item.quantity.trim() }))
}

/** Le bouton d'enregistrement : « Enregistrer 7 aliments ». */
export function savePantryLabel(count: number): string {
  return count === 0 ? 'Coche au moins un aliment' : `Enregistrer ${aliments(count)}`
}

/** Le choix « Remplacer le frigo », « Remplacer les placards ». */
export function replaceLabel(place: PantryPlace): string {
  return REPLACE_LABEL[place]
}

/** Ce que fait l'enregistrement de la liste, selon le choix. */
export function modeHint(mode: 'merge' | 'replace', place: PantryPlace): string {
  return frenchSpacing(
    mode === 'merge'
      ? 'Ce qui est déjà noté reste ; un aliment déjà là n’est pas ajouté deux fois.'
      : `Ce qui est noté ${PLACE_IN[place]} est effacé, puis remplacé par cette liste.`,
  )
}

/** Le message après l'enregistrement : « 7 aliments ajoutés au frigo ». */
export function pantrySavedText(added: number, place: PantryPlace): string {
  if (added === 0) return frenchSpacing(`Rien de nouveau : tout était déjà ${PLACE_IN[place]}.`)
  return `${aliments(added)} ${added === 1 ? 'ajouté' : 'ajoutés'} ${PLACE_TO[place]}`
}

/* ------------------------------------------------------------------ */
/* Idées de repas                                                      */
/* ------------------------------------------------------------------ */

/** Le titre de la carte de ce qui reste : « Reste pour aujourd’hui », « Reste pour le 19 octobre ». */
export function remainingTitle(day: ISODate, today: ISODate): string {
  if (day === today) return 'Reste pour aujourd’hui'
  return `Reste pour le ${formatDay(day, 'd MMMM')}`
}

/** « 15 min ». */
export function minutesText(minutes: number): string {
  return keepTogether(`${String(minutes)} min`)
}

/** Calories et macronutriments d'une idée de repas. */
export function ideaTotal(items: readonly Pick<IdeaItem, 'nutrients'>[]): Macros {
  const { kcal, protein, carbs, fat } = sumNutrients(items.map((item) => item.nutrients))
  return { kcal, protein, carbs, fat }
}

/**
 * Ce que l'idée laisse pour la journée : « Il te restera ensuite 1 269 kcal et 105 g de protéines. », ou
 * « 120 kcal de plus que ce qui te reste. » ; null quand les objectifs ne sont pas définis.
 */
export function afterIdeaText(total: Macros, remaining: Macros | null): string | null {
  if (remaining === null) return null
  const kcal = Math.round(remaining.kcal - total.kcal)
  if (kcal < 0) return `${formatKcal(-kcal)} de plus que ce qui te reste.`
  const protein = Math.max(0, remaining.protein - total.protein)
  return `Il te restera ensuite ${formatKcal(kcal)} et ${formatGrams(protein)} de protéines.`
}

/** Un ingrédient d'une idée choisie, à garder ou non (corrigé comme un aliment reconnu sur une photo). */
export type IdeaReviewItem = PhotoItem & { fromPantry: boolean }

export function ideaReviewItems(items: readonly IdeaItem[]): IdeaReviewItem[] {
  return items.map((item, index) => ({ ...item, id: String(index), keep: true }))
}

/** Le badge d'un ingrédient qui n'est pas dans le frigo. */
export const TO_BUY = 'à acheter'
