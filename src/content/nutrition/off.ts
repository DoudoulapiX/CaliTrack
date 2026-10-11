import type { Food, Nutrients } from '@/db/types'
import { roundNutrients } from './nutrients'

/*
 * Produits du commerce par leur code-barres, grâce à Open Food Facts (base libre, licence ODbL).
 * L'API autorise les appels depuis une page web ; aucune clé n'est nécessaire pour lire un produit.
 */

export const OFF_PREFIX = 'off:'
const FIELDS = 'code,product_name,product_name_fr,generic_name_fr,brands,nutriments,serving_quantity'

export function offProductUrl(barcode: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${barcode}?fields=${FIELDS}&lc=fr`
}

/** Un code-barres de produit (EAN-13, EAN-8, UPC-A ou GTIN-14) dont la clé de contrôle est juste. */
export function isValidBarcode(code: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(code)) return false
  // Que des chiffres (vérifié juste avant) : un caractère par chiffre.
  const digits = Array.from({ length: code.length }, (_, i) => Number(code.charAt(i)))
  const check = digits.pop() ?? 0
  // Poids 3 et 1 en alternance, en partant du chiffre qui précède la clé.
  const sum = digits.reverse().reduce((total, digit, i) => total + digit * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10 === check
}

/** Un nombre lu dans la fiche (Open Food Facts mélange nombres et textes). */
function number(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

/** Les valeurs pour 100 g (ou 100 ml) d'une fiche ; null si l'énergie ou les macronutriments manquent. */
export function offNutrients(nutriments: Record<string, unknown>): Nutrients | null {
  const kj = number(nutriments['energy-kj_100g']) ?? number(nutriments.energy_100g)
  const kcal = number(nutriments['energy-kcal_100g']) ?? (kj === null ? null : kj / 4.184)
  const protein = number(nutriments.proteins_100g)
  const carbs = number(nutriments.carbohydrates_100g)
  const fat = number(nutriments.fat_100g)
  if (kcal === null || protein === null || carbs === null || fat === null) return null
  return roundNutrients({
    kcal,
    protein,
    carbs,
    fat,
    fiber: number(nutriments.fiber_100g),
    sugars: number(nutriments.sugars_100g),
    satFat: number(nutriments['saturated-fat_100g']),
    salt: number(nutriments.salt_100g),
  })
}

export type OffLookup =
  /** Produit trouvé avec ses valeurs nutritionnelles. */
  | { status: 'found'; food: Food }
  /** Produit connu, mais sans valeurs nutritionnelles : à compléter à la main. */
  | { status: 'incomplete'; name: string; brand: string }
  | { status: 'notFound' }
  /** Pas de réseau, ou Open Food Facts ne répond pas. */
  | { status: 'offline' }

/** Lit la réponse d'Open Food Facts pour un code-barres. */
export function parseOffProduct(barcode: string, body: unknown, now: string): OffLookup {
  const data = (body ?? {}) as { status?: unknown; product?: Record<string, unknown> }
  const product = data.product
  if (data.status !== 1 || !product) return { status: 'notFound' }
  const text = (value: unknown) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '')
  const name =
    text(product.product_name_fr) ||
    text(product.product_name) ||
    text(product.generic_name_fr) ||
    'Produit sans nom'
  // « Marque A, Marque B » : la première suffit.
  const brand = text(product.brands).split(',')[0]?.trim() ?? ''
  const per100 = offNutrients((product.nutriments ?? {}) as Record<string, unknown>)
  if (!per100) return { status: 'incomplete', name, brand }
  const serving = number(product.serving_quantity)
  return {
    status: 'found',
    food: {
      id: `${OFF_PREFIX}${barcode}`,
      source: 'off',
      name,
      brand,
      barcode,
      per100,
      servingG: serving !== null && serving > 0 ? Math.round(serving * 10) / 10 : null,
      createdAt: now,
      updatedAt: now,
    },
  }
}

/** Cherche un produit sur Open Food Facts. */
export async function lookupBarcode(
  barcode: string,
  now: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OffLookup> {
  let response: Response
  try {
    response = await fetchImpl(offProductUrl(barcode), { headers: { Accept: 'application/json' } })
  } catch {
    return { status: 'offline' }
  }
  // 404 : produit inconnu ; une autre erreur : le service est indisponible.
  if (response.status === 404) return { status: 'notFound' }
  if (!response.ok) return { status: 'offline' }
  try {
    return parseOffProduct(barcode, await response.json(), now)
  } catch {
    return { status: 'offline' }
  }
}
