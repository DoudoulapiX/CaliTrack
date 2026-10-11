import { computeTargets } from '@/content/nutrition/targets'
import { ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import { defaultNutritionGoals } from '@/db/defaults'
import type { FoodEntry, NutritionGoals } from '@/db/types'
import {
  addFoodPath,
  afterFoodSaved,
  autoPlaceholder,
  calculationLines,
  CAMERA_PROBLEM_TEXT,
  dayFromParam,
  entriesByMeal,
  entryLine,
  formatGrams,
  formatKcal,
  goalsSummary,
  journalPath,
  macroLine,
  macroRows,
  macrosOf,
  mealTo,
  missingLine,
  newFoodPath,
  nutrientsFor,
  nutrientTiles,
  per100Line,
  quantityOptions,
  remainingLine,
  scanProblemText,
  totalOf,
} from './nutrition-view'

/** Espace insécable fine des milliers (« 2 760 ») et espace insécable avant l'unité. */
const THIN = '\u202f'
const NB = '\u00a0'

function entry(patch: Partial<FoodEntry>): FoodEntry {
  return {
    id: 'e',
    date: '2026-10-21',
    meal: 'lunch',
    source: 'ciqual',
    foodId: 'ciqual:1',
    name: 'Riz',
    grams: 150,
    per100: { ...ZERO_NUTRIENTS, kcal: 145 },
    nutrients: { ...ZERO_NUTRIENTS, kcal: 218 },
    note: '',
    createdAt: '2026-10-21T12:00:00.000Z',
    updatedAt: '2026-10-21T12:00:00.000Z',
    ...patch,
  }
}

const goals = (patch: Partial<NutritionGoals> = {}): NutritionGoals => ({
  ...defaultNutritionGoals('x'),
  ...patch,
})
const charles = { sex: 'male' as const, birthYear: 1996, heightCm: 180 }

describe('textes de la nutrition', () => {
  it('écrit calories et grammes avec des espaces insécables', () => {
    expect(formatKcal(2759.6)).toBe(`2${THIN}760${NB}kcal`)
    expect(formatGrams(150.4)).toBe(`150${NB}g`)
    expect(formatGrams(7.46)).toBe(`7,5${NB}g`)
    expect(per100Line({ kcal: 145 })).toBe(`145${NB}kcal pour 100${NB}g`)
    expect(entryLine(entry({}))).toBe(`150${NB}g · 218${NB}kcal`)
    expect(entryLine(entry({ grams: null, per100: null }))).toBe(`218${NB}kcal`)
    expect(macroLine(84.6, 145)).toBe(`85 / 145${NB}g`)
  })

  it('range les aliments par repas, dans l’ordre où ils ont été notés', () => {
    const byMeal = entriesByMeal([
      entry({ id: 'b', createdAt: '2026-10-21T12:05:00.000Z' }),
      entry({ id: 'a', createdAt: '2026-10-21T12:00:00.000Z' }),
      entry({ id: 'c', meal: 'breakfast' }),
    ])
    expect(Object.keys(byMeal)).toEqual(['breakfast', 'lunch', 'snack', 'dinner'])
    expect(byMeal.lunch.map((item) => item.id)).toEqual(['a', 'b'])
    expect(byMeal.breakfast.map((item) => item.id)).toEqual(['c'])
    expect(byMeal.dinner).toEqual([])
    expect(totalOf([entry({}), entry({})]).kcal).toBe(436)
  })

  it('dit où va l’aliment ajouté', () => {
    expect(mealTo('breakfast')).toBe('au petit-déjeuner')
    expect(mealTo('lunch')).toBe('au déjeuner')
    expect(mealTo('snack')).toBe('à la collation')
    expect(mealTo('dinner')).toBe('au dîner')
  })

  it('dit ce qu’il reste à manger, ou de combien l’objectif est dépassé', () => {
    expect(remainingLine(1250, 2760)).toEqual({ text: `Il te reste 1${THIN}510${NB}kcal`, over: false })
    expect(remainingLine(2760, 2760)).toEqual({ text: `Il te reste 0${NB}kcal`, over: false })
    expect(remainingLine(2880, 2760)).toEqual({ text: `120${NB}kcal de plus que ton objectif`, over: true })
  })

  it('compare les macronutriments à leurs objectifs, barres bornées à 100 %', () => {
    const rows = macroRows(
      { ...ZERO_NUTRIENTS, protein: 72.5, carbs: 400, fat: 0 },
      { kcal: 2760, proteinG: 145, carbsG: 375, fatG: 75 },
    )
    expect(rows.map((row) => [row.label, row.percent])).toEqual([
      ['Protéines', 50],
      ['Glucides', 100],
      ['Lipides', 0],
    ])
    expect(macroRows(ZERO_NUTRIENTS, { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })[0]?.percent).toBe(0)
  })

  it('lit le jour de l’adresse : jamais dans le futur ni invalide', () => {
    expect(dayFromParam('2026-10-20', '2026-10-21')).toBe('2026-10-20')
    expect(dayFromParam('2026-10-22', '2026-10-21')).toBe('2026-10-21')
    expect(dayFromParam('hier', '2026-10-21')).toBe('2026-10-21')
    expect(dayFromParam(null, '2026-10-21')).toBe('2026-10-21')
    expect(journalPath('2026-10-21', '2026-10-21')).toBe('/nutrition')
    expect(journalPath('2026-10-20', '2026-10-21')).toBe('/nutrition?day=2026-10-20')
    expect(addFoodPath('2026-10-20', 'dinner')).toBe('/nutrition/add?day=2026-10-20&meal=dinner')
  })

  it('mène à la création d’un aliment, puis à son ajout au repas', () => {
    expect(newFoodPath({})).toBe('/nutrition/foods/new')
    expect(newFoodPath({ name: 'Pain d’épices', day: '2026-10-21', meal: 'snack' })).toBe(
      '/nutrition/foods/new?name=Pain+d%E2%80%99%C3%A9pices&day=2026-10-21&meal=snack',
    )
    expect(newFoodPath({ barcode: '3017620422003' })).toBe('/nutrition/foods/new?barcode=3017620422003')
    expect(newFoodPath({ name: 'Granola', brand: 'Bjorg', barcode: '3229820129488' })).toBe(
      '/nutrition/foods/new?name=Granola&brand=Bjorg&barcode=3229820129488',
    )
    // Une marque vide n'est pas transmise.
    expect(newFoodPath({ name: 'Granola', brand: '' })).toBe('/nutrition/foods/new?name=Granola')
    expect(afterFoodSaved('f1', '2026-10-21', 'snack')).toBe(
      '/nutrition/add?day=2026-10-21&meal=snack&food=f1',
    )
    expect(afterFoodSaved('f1', null, null)).toBe('/nutrition/foods')
    expect(afterFoodSaved('f1', '2026-10-21', 'gouter')).toBe('/nutrition/foods')
  })

  it('explique pourquoi un produit scanné n’a pas été ajouté tel quel', () => {
    const incomplete = scanProblemText({ status: 'incomplete', name: 'Granola', brand: 'Bjorg' })
    expect(incomplete.title).toBe('Valeurs manquantes')
    expect(incomplete.text).toBe(
      `«${NB}Granola${NB}» est dans Open Food Facts, mais sans ses valeurs nutritionnelles. Complète-les avec l’étiquette${NB}: il sera reconnu la prochaine fois.`,
    )
    expect(scanProblemText({ status: 'notFound' })).toEqual({
      title: 'Produit inconnu',
      text: `Ce code-barres n’est pas dans Open Food Facts. Crée le produit avec son étiquette${NB}: il sera reconnu la prochaine fois.`,
    })
    expect(scanProblemText({ status: 'offline' }).title).toBe('Pas de connexion')
  })

  it('dit quoi faire quand la caméra ne démarre pas', () => {
    expect(CAMERA_PROBLEM_TEXT.denied).toContain('Réglages › Safari › Appareil photo')
    expect(CAMERA_PROBLEM_TEXT.unavailable).toBe(
      `Pas de caméra disponible${NB}: tape le code-barres ci-dessous.`,
    )
    expect(CAMERA_PROBLEM_TEXT.error).toBe(`La caméra n’a pas démarré${NB}: tape le code-barres ci-dessous.`)
  })

  it('propose la portion habituelle et des quantités rondes, sans doublon', () => {
    expect(quantityOptions(110).map((option) => option.grams)).toEqual([110, 220, 50, 100, 150, 200])
    expect(quantityOptions(100).map((option) => option.grams)).toEqual([100, 200, 50, 150])
    expect(quantityOptions(100)[0]?.label).toBe(`1 portion · 100${NB}g`)
    expect(quantityOptions(null).map((option) => option.label)).toEqual([
      `50${NB}g`,
      `100${NB}g`,
      `150${NB}g`,
      `200${NB}g`,
    ])
  })

  it('montre ce qu’apporte une quantité', () => {
    const rice = { per100: { ...ZERO_NUTRIENTS, kcal: 145, protein: 2.9, carbs: 31.4, fat: 0.4 } }
    const nutrients = nutrientsFor(rice, 150)
    expect(nutrients).toMatchObject({ kcal: 218, protein: 4.4, carbs: 47.1, fat: 0.6 })
    expect(nutrientsFor(rice, null)).toBeNull()
    expect(nutrientsFor(rice, 0)).toBeNull()
    expect(nutrientTiles(nutrients ?? ZERO_NUTRIENTS)).toEqual([
      { label: 'Calories', value: `218${NB}kcal` },
      { label: 'Protéines', value: `4,4${NB}g` },
      { label: 'Glucides', value: `47${NB}g` },
      { label: 'Lipides', value: `0,6${NB}g` },
    ])
  })

  it('complète les valeurs tapées : macronutriments vides à 0, calories calculées sinon', () => {
    expect(macrosOf({ kcal: null, protein: null, carbs: null, fat: null })).toBeNull()
    expect(macrosOf({ kcal: 500, protein: null, carbs: null, fat: null })).toMatchObject({
      kcal: 500,
      protein: 0,
      fiber: null,
    })
    expect(macrosOf({ kcal: null, protein: 20, carbs: 50, fat: 10 })?.kcal).toBe(370)
    const base = { ...ZERO_NUTRIENTS, kcal: 900, fiber: 4 }
    expect(macrosOf({ kcal: 850, protein: 40, carbs: 80, fat: 35 }, base)).toMatchObject({
      kcal: 850,
      fiber: 4,
    })
  })
})

describe('textes des objectifs caloriques', () => {
  it('résume la phase et l’énergie visée', () => {
    expect(goalsSummary('maintain', 2760)).toBe(`Maintien · 2${THIN}760${NB}kcal`)
    expect(goalsSummary('cut', null)).toBe('Sèche')
  })

  it('dit ce qu’il manque au profil', () => {
    expect(missingLine(['âge'])).toBe('Ajoute ton âge à ton profil pour calculer tes besoins.')
    expect(missingLine(['âge', 'taille', 'poids'])).toBe(
      'Ajoute ton âge, ta taille et ton poids à ton profil pour calculer tes besoins.',
    )
  })

  it('montre la valeur calculée dans un champ vide', () => {
    expect(autoPlaceholder(2760)).toBe(`Auto${NB}: 2${THIN}760`)
    expect(autoPlaceholder(null)).toBe('Auto')
  })

  it('détaille le calcul de l’énergie', () => {
    const result = computeTargets(charles, 80, goals(), 2026)
    expect(calculationLines(result, goals())).toEqual([
      `Métabolisme de base${NB}: 1${THIN}780${NB}kcal`,
      `Dépense avec ton activité${NB}: 2${THIN}760${NB}kcal`,
      `En maintien${NB}: 2${THIN}760${NB}kcal`,
    ])
    const cut = goals({ phase: 'cut', kcal: 2100 })
    expect(calculationLines(computeTargets({ ...charles, sex: null }, 80, cut, 2026), cut)).toEqual([
      `Métabolisme de base${NB}: 1${THIN}697${NB}kcal`,
      `Dépense avec ton activité${NB}: 2${THIN}630${NB}kcal`,
      `En sèche${NB}: 2${THIN}100${NB}kcal`,
      `Fixé à la main${NB}: 2${THIN}100${NB}kcal`,
      `Sexe non indiqué dans ton profil${NB}: le calcul prend la moyenne homme-femme.`,
    ])
    const manual = goals({ kcal: 2000 })
    expect(
      calculationLines(computeTargets({ ...charles, heightCm: null }, 80, manual, 2026), manual),
    ).toEqual([`Fixé à la main${NB}: 2${THIN}000${NB}kcal`])
    expect(calculationLines(computeTargets(charles, null, goals(), 2026), goals())).toEqual([])
  })
})
