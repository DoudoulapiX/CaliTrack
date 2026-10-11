import { isValidBarcode } from '@/content/nutrition/off'
import { MAX_GRAMS } from '@/db/nutrition'
import type { Food } from '@/db/types'
import { frenchSpacing, NBSP } from '@/lib/typography'
import { formatGrams, macrosOf, type MacroDraft } from './nutrition-view'

/** Ce que l'on tape pour créer ou corriger un aliment (valeurs pour 100 g). */
export interface FoodForm {
  name: string
  brand: string
  macros: MacroDraft
  fiber: number | null
  sugars: number | null
  satFat: number | null
  salt: number | null
  servingG: number | null
  barcode: string
}

/** Le formulaire d'un aliment existant, ou d'un nouvel aliment avec ce que l'on sait déjà. */
export function formFromFood(
  food: Food | null,
  prefill: { name?: string; brand?: string; barcode?: string } = {},
): FoodForm {
  if (!food) {
    return {
      name: prefill.name ?? '',
      brand: prefill.brand ?? '',
      macros: { kcal: null, protein: null, carbs: null, fat: null },
      fiber: null,
      sugars: null,
      satFat: null,
      salt: null,
      servingG: null,
      barcode: prefill.barcode ?? '',
    }
  }
  const { per100 } = food
  return {
    name: food.name,
    brand: food.brand,
    macros: { kcal: per100.kcal, protein: per100.protein, carbs: per100.carbs, fat: per100.fat },
    fiber: per100.fiber,
    sugars: per100.sugars,
    satFat: per100.satFat,
    salt: per100.salt,
    servingG: food.servingG,
    barcode: food.barcode ?? '',
  }
}

export type FoodFormResult = { ok: true; food: Food } | { ok: false; error: string }

/**
 * L'aliment à enregistrer, ou ce qui ne va pas. Un aliment corrigé à la main devient un aliment perso
 * (il passe alors avant la fiche d'Open Food Facts du même code-barres).
 */
export function foodFromForm(form: FoodForm, existing: Food | null, id: string, now: string): FoodFormResult {
  const name = form.name.trim()
  if (name === '') return { ok: false, error: 'Donne un nom à cet aliment.' }
  const macros = macrosOf(form.macros)
  if (macros === null) return { ok: false, error: `Indique les calories pour 100${NBSP}g.` }
  if (macros.protein + macros.carbs + macros.fat > 100) {
    return {
      ok: false,
      error: `Pour 100${NBSP}g, protéines, glucides et lipides ne dépassent pas 100${NBSP}g en tout.`,
    }
  }
  if (macros.kcal > 900)
    return { ok: false, error: `Pour 100${NBSP}g, un aliment ne dépasse pas 900${NBSP}kcal.` }
  if (form.sugars !== null && form.sugars > macros.carbs) {
    return {
      ok: false,
      error: frenchSpacing('Les sucres font partie des glucides : ils ne peuvent pas les dépasser.'),
    }
  }
  if (form.satFat !== null && form.satFat > macros.fat) {
    return {
      ok: false,
      error: frenchSpacing(
        'Les acides gras saturés font partie des lipides : ils ne peuvent pas les dépasser.',
      ),
    }
  }
  const barcode = form.barcode.replace(/\s/g, '')
  if (barcode !== '' && !isValidBarcode(barcode)) {
    return { ok: false, error: frenchSpacing('Ce code-barres n’est pas valable : vérifie les chiffres.') }
  }
  if (form.servingG !== null && (form.servingG <= 0 || form.servingG > MAX_GRAMS)) {
    return { ok: false, error: `La portion doit faire entre 1${NBSP}g et ${formatGrams(MAX_GRAMS)}.` }
  }
  return {
    ok: true,
    food: {
      id: existing?.id ?? id,
      source: 'custom',
      name,
      brand: form.brand.trim(),
      barcode: barcode === '' ? null : barcode,
      per100: { ...macros, fiber: form.fiber, sugars: form.sugars, satFat: form.satFat, salt: form.salt },
      servingG: form.servingG,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    },
  }
}
