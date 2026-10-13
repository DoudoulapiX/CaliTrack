import type { FoodItem } from '@/content/nutrition/foods'
import { isMealKey, MEAL_ORDER } from '@/content/nutrition/meals'
import {
  kcalFromMacros,
  roundNutrients,
  scaleNutrients,
  sumNutrients,
  ZERO_NUTRIENTS,
} from '@/content/nutrition/nutrients'
import type { OffLookup } from '@/content/nutrition/off'
import { ACTIVITY_FACTOR, type MacroTargets, type TargetsResult } from '@/content/nutrition/targets'
import type { ActivityLevel, FoodEntry, MealKey, NutritionGoals, NutritionPhase, Nutrients } from '@/db/types'
import { addDaysISO, isISODate, type ISODate } from '@/lib/dates'
import { frenchSpacing, joinFrench, lowerFirst, NBSP } from '@/lib/typography'
import { formatNumber } from '@/lib/units'
import type { CameraProblem } from './scanner'

/* Textes et calculs des écrans de nutrition. */

/** « 1 250 kcal ». */
export function formatKcal(kcal: number): string {
  return `${formatNumber(Math.round(kcal))}${NBSP}kcal`
}

/** « 150 g », « 7,5 g » (au dixième sous 10 g). */
export function formatGrams(grams: number): string {
  const rounded = grams < 10 ? Math.round(grams * 10) / 10 : Math.round(grams)
  return `${formatNumber(rounded, 1)}${NBSP}g`
}

/** Ce que montre une ligne du journal : « 150 g · 218 kcal », ou les calories seules (saisie rapide). */
export function entryLine(entry: Pick<FoodEntry, 'grams' | 'nutrients'>): string {
  const kcal = formatKcal(entry.nutrients.kcal)
  return entry.grams === null ? kcal : `${formatGrams(entry.grams)} · ${kcal}`
}

/** « 145 kcal pour 100 g ». */
export function per100Line(per100: Pick<Nutrients, 'kcal'>): string {
  return `${formatKcal(per100.kcal)} pour 100${NBSP}g`
}

/** Les aliments notés, rangés par repas (dans l'ordre de la journée). */
export function entriesByMeal(entries: readonly FoodEntry[]): Record<MealKey, FoodEntry[]> {
  const byMeal = Object.fromEntries(MEAL_ORDER.map((meal) => [meal, [] as FoodEntry[]])) as Record<
    MealKey,
    FoodEntry[]
  >
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  for (const entry of sorted) byMeal[entry.meal].push(entry)
  return byMeal
}

/** Le total d'une liste d'aliments notés. */
export function totalOf(entries: readonly Pick<FoodEntry, 'nutrients'>[]): Nutrients {
  return sumNutrients(entries.map((entry) => entry.nutrients))
}

/** « au déjeuner », « à la collation » : là où l'on ajoute un aliment. */
export function mealTo(meal: MealKey): string {
  switch (meal) {
    case 'breakfast':
      return 'au petit-déjeuner'
    case 'lunch':
      return 'au déjeuner'
    case 'snack':
      return 'à la collation'
    case 'dinner':
      return 'au dîner'
  }
}

/** Calories restantes : « Il te reste 850 kcal », « 120 kcal de plus que ton objectif ». */
export function remainingLine(eatenKcal: number, targetKcal: number): { text: string; over: boolean } {
  const left = Math.round(targetKcal - eatenKcal)
  if (left >= 0) return { text: `Il te reste ${formatKcal(left)}`, over: false }
  return { text: `${formatKcal(-left)} de plus que ton objectif`, over: true }
}

export interface MacroRow {
  key: 'protein' | 'carbs' | 'fat'
  label: string
  eaten: number
  target: number
  /** Part de l'objectif atteinte, de 0 à 100 (la barre ne dépasse pas). */
  percent: number
}

/** Les trois macronutriments du jour face à leurs objectifs. */
export function macroRows(eaten: Nutrients, targets: MacroTargets): MacroRow[] {
  const row = (key: MacroRow['key'], label: string, target: number): MacroRow => ({
    key,
    label,
    eaten: eaten[key],
    target,
    percent: target > 0 ? Math.min(100, Math.round((eaten[key] / target) * 100)) : 0,
  })
  return [
    row('protein', 'Protéines', targets.proteinG),
    row('carbs', 'Glucides', targets.carbsG),
    row('fat', 'Lipides', targets.fatG),
  ]
}

/** « 85 / 145 g ». */
export function macroLine(eaten: number, target: number): string {
  return `${formatNumber(Math.round(eaten))} / ${formatNumber(Math.round(target))}${NBSP}g`
}

/** Le jour demandé dans l'adresse, s'il est valable et pas dans le futur ; sinon aujourd'hui. */
export function dayFromParam(value: string | null, today: ISODate): ISODate {
  return value !== null && isISODate(value) && value <= today ? value : today
}

/** Le journal d'un jour. */
export function journalPath(day: ISODate, today: ISODate): string {
  return day === today ? '/nutrition' : `/nutrition?day=${day}`
}

/** L'écran pour ajouter un aliment à un repas. */
export function addFoodPath(day: ISODate, meal: MealKey): string {
  return `/nutrition/add?day=${day}&meal=${meal}`
}

/** Le jour d'avant (navigation du journal). */
export function previousDay(day: ISODate): ISODate {
  return addDaysISO(day, -1)
}

/**
 * Quantités proposées en un geste : la portion habituelle (et deux portions) quand elle est connue,
 * puis quelques poids ronds.
 */
export function quantityOptions(portionG: number | null): { grams: number; label: string }[] {
  const options: { grams: number; label: string }[] = []
  if (portionG !== null && portionG > 0) {
    options.push({ grams: portionG, label: `1 portion · ${formatGrams(portionG)}` })
    options.push({ grams: portionG * 2, label: `2 portions · ${formatGrams(portionG * 2)}` })
  }
  for (const grams of [50, 100, 150, 200]) {
    if (!options.some((option) => option.grams === grams)) options.push({ grams, label: formatGrams(grams) })
  }
  return options
}

/** Ce qu'apporte une quantité d'un aliment, case par case : calories, protéines, glucides, lipides. */
export function nutrientTiles(
  nutrients: Pick<Nutrients, 'kcal' | 'protein' | 'carbs' | 'fat'>,
): { label: string; value: string }[] {
  return [
    { label: 'Calories', value: formatKcal(nutrients.kcal) },
    { label: 'Protéines', value: formatGrams(nutrients.protein) },
    { label: 'Glucides', value: formatGrams(nutrients.carbs) },
    { label: 'Lipides', value: formatGrams(nutrients.fat) },
  ]
}

/** Les valeurs pour une quantité d'un aliment. */
export function nutrientsFor(item: Pick<FoodItem, 'per100'>, grams: number | null): Nutrients | null {
  return grams === null || grams <= 0 ? null : scaleNutrients(item.per100, grams)
}

/* ------------------------------------------------------------------ */
/* Objectifs caloriques                                                */
/* ------------------------------------------------------------------ */

/** Le nom de chaque phase (« Sèche »), partagé par les objectifs et le coach physique. */
export const PHASE_LABEL: Record<NutritionPhase, string> = {
  cut: 'Sèche',
  maintain: 'Maintien',
  bulk: 'Prise de masse',
}

export const PHASE_OPTIONS: { value: NutritionPhase; label: string }[] = (
  ['cut', 'maintain', 'bulk'] as const
).map((value) => ({ value, label: PHASE_LABEL[value] }))

export const PHASE_HINT: Record<NutritionPhase, string> = {
  cut: frenchSpacing('Perdre du gras en gardant le muscle : 20 % de calories en moins, plus de protéines.'),
  maintain: frenchSpacing('Garder ton poids : autant de calories que tu en dépenses.'),
  bulk: frenchSpacing('Prendre du muscle : 10 % de calories en plus, sans trop de gras.'),
}

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sédentaire' },
  { value: 'light', label: 'Légère' },
  { value: 'moderate', label: 'Modérée' },
  { value: 'active', label: 'Active' },
  { value: 'veryActive', label: 'Très active' },
]

export const ACTIVITY_HINT: Record<ActivityLevel, string> = {
  sedentary: 'Peu ou pas de sport, travail assis.',
  light: '1 à 3 séances par semaine.',
  moderate: '3 à 5 séances par semaine.',
  active: '6 ou 7 séances par semaine.',
  veryActive: 'Sport intense chaque jour, ou métier physique en plus de l’entraînement.',
}

/** « Maintien · 2 760 kcal ». */
export function goalsSummary(phase: NutritionPhase, kcal: number | null): string {
  const label = PHASE_LABEL[phase]
  return kcal === null ? label : `${label} · ${formatKcal(kcal)}`
}

/** « Ajoute ton âge et ta taille à ton profil pour calculer tes besoins. » */
export function missingLine(missing: readonly string[]): string {
  return `Ajoute ${joinFrench(missing.map(withArticle))} à ton profil pour calculer tes besoins.`
}

function withArticle(item: string): string {
  return item === 'taille' ? 'ta taille' : `ton ${item}`
}

/** « Auto : 2 760 » : la valeur calculée, montrée dans un champ laissé vide. */
export function autoPlaceholder(value: number | null): string {
  return value === null ? 'Auto' : frenchSpacing(`Auto : ${formatNumber(value)}`)
}

/* ------------------------------------------------------------------ */
/* Saisie des valeurs                                                  */
/* ------------------------------------------------------------------ */

/** Les valeurs tapées dans un formulaire (null : champ vide). */
export interface MacroDraft {
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export const EMPTY_MACROS: MacroDraft = { kcal: null, protein: null, carbs: null, fat: null }

/**
 * Les valeurs d'un formulaire : un macronutriment laissé vide compte pour 0 et, sans calories, on
 * les calcule à partir des macronutriments. Null : rien d'indiqué. Les valeurs facultatives (fibres,
 * sucres…) viennent de `base`.
 */
export function macrosOf(draft: MacroDraft, base: Nutrients = ZERO_NUTRIENTS): Nutrients | null {
  const macros = { protein: draft.protein ?? 0, carbs: draft.carbs ?? 0, fat: draft.fat ?? 0 }
  const kcal = draft.kcal ?? (macros.protein + macros.carbs + macros.fat > 0 ? kcalFromMacros(macros) : null)
  if (kcal === null) return null
  return roundNutrients({ ...base, kcal, ...macros })
}

/**
 * L'écran pour créer un aliment, avec ce que l'on sait déjà (nom cherché, code-barres scanné) et le
 * repas où l'ajouter ensuite.
 */
export function newFoodPath(context: {
  name?: string
  brand?: string
  barcode?: string
  day?: ISODate
  meal?: MealKey
}): string {
  const params = new URLSearchParams()
  for (const key of ['name', 'brand', 'barcode', 'day', 'meal'] as const) {
    const value = context[key]
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return search === '' ? '/nutrition/foods/new' : `/nutrition/foods/new?${search}`
}

/** Après avoir créé un aliment : l'ajouter au repas d'où l'on vient, sinon revenir à la liste. */
export function afterFoodSaved(foodId: string, day: string | null, meal: string | null): string {
  return day !== null && isISODate(day) && isMealKey(meal)
    ? `${addFoodPath(day, meal)}&food=${encodeURIComponent(foodId)}`
    : '/nutrition/foods'
}

/**
 * Le détail du calcul de l'énergie : métabolisme de base, dépense avec l'activité, objectif de la phase
 * (quand le profil le permet), puis la valeur fixée à la main.
 */
export function calculationLines(
  result: TargetsResult,
  goals: Pick<NutritionGoals, 'phase' | 'activity' | 'kcal'>,
): string[] {
  if (!result.ok) return []
  const lines: string[] = []
  if (result.bmr !== null && result.computedKcal !== null) {
    const spent = Math.round((result.bmr * ACTIVITY_FACTOR[goals.activity]) / 10) * 10
    const phase = PHASE_LABEL[goals.phase]
    lines.push(
      `Métabolisme de base : ${formatKcal(result.bmr)}`,
      `Dépense avec ton activité : ${formatKcal(spent)}`,
      `En ${lowerFirst(phase)} : ${formatKcal(result.computedKcal)}`,
    )
  }
  if (goals.kcal !== null) lines.push(`Fixé à la main : ${formatKcal(goals.kcal)}`)
  if (result.sexUnknown)
    lines.push('Sexe non indiqué dans ton profil : le calcul prend la moyenne homme-femme.')
  return lines.map(frenchSpacing)
}

/* ------------------------------------------------------------------ */
/* Scan de code-barres                                                 */
/* ------------------------------------------------------------------ */

/** Ce que dit l'écran de scan quand la caméra ne peut pas servir. */
export const CAMERA_PROBLEM_TEXT: Record<CameraProblem, string> = {
  denied: frenchSpacing(
    'CaliTrack n’a pas accès à la caméra. Autorise-la dans Réglages › Safari › Appareil photo, ou tape le code ci-dessous.',
  ),
  unavailable: frenchSpacing('Pas de caméra disponible : tape le code-barres ci-dessous.'),
  error: frenchSpacing('La caméra n’a pas démarré : tape le code-barres ci-dessous.'),
}

/** Ce que dit l'écran de scan quand le produit n'a pas pu être ajouté tel quel. */
export function scanProblemText(lookup: Exclude<OffLookup, { status: 'found' }>): {
  title: string
  text: string
} {
  switch (lookup.status) {
    case 'incomplete':
      return {
        title: 'Valeurs manquantes',
        text: frenchSpacing(
          `« ${lookup.name} » est dans Open Food Facts, mais sans ses valeurs nutritionnelles. Complète-les avec l’étiquette : il sera reconnu la prochaine fois.`,
        ),
      }
    case 'notFound':
      return {
        title: 'Produit inconnu',
        text: frenchSpacing(
          'Ce code-barres n’est pas dans Open Food Facts. Crée le produit avec son étiquette : il sera reconnu la prochaine fois.',
        ),
      }
    case 'offline':
      return {
        title: 'Pas de connexion',
        text: 'Impossible de chercher ce produit sans internet. Réessaie une fois connecté, ou crée-le à la main.',
      }
  }
}
