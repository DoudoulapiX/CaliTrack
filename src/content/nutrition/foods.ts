import type { Food, Nutrients } from '@/db/types'
import type { CiqualFile, CiqualRow } from './ciqual-build'

/** Un aliment que l'on peut noter : de la table Ciqual ou de la liste perso (aliments créés, produits scannés). */
export interface FoodItem {
  /** « ciqual:13050 », « off:3017620422003 » ou l'identifiant d'un aliment perso. */
  id: string
  source: 'ciqual' | 'off' | 'custom'
  name: string
  /** Groupe Ciqual ou marque ('' : aucun). */
  detail: string
  per100: Nutrients
  /** Portion habituelle en grammes ; null : inconnue. */
  portionG: number | null
}

export const CIQUAL_PREFIX = 'ciqual:'

function ciqualItem(row: CiqualRow, groups: Record<string, string>): FoodItem {
  const [code, name, group, kcal, protein, carbs, fat, fiber, sugars, satFat, salt, portionG] = row
  return {
    id: `${CIQUAL_PREFIX}${String(code)}`,
    source: 'ciqual',
    name,
    detail: groups[group] ?? '',
    per100: { kcal, protein, carbs, fat, fiber, sugars, satFat, salt },
    portionG,
  }
}

/** Un aliment perso ou un produit scanné, présenté comme les aliments Ciqual. */
export function foodItem(food: Food): FoodItem {
  return {
    id: food.id,
    source: food.source,
    name: food.name,
    detail: food.brand,
    per100: food.per100,
    portionG: food.servingG,
  }
}

let ciqualPromise: Promise<FoodItem[]> | null = null

/**
 * Charge la table Ciqual (plus de 3 000 aliments) à la demande, une seule fois : elle est dans un fichier
 * à part pour ne pas ralentir l'ouverture de l'appli.
 */
export function loadCiqual(): Promise<FoodItem[]> {
  ciqualPromise ??= import('@/data/ciqual.json?raw')
    .then((module) => {
      const file = JSON.parse(module.default) as CiqualFile
      return file.foods.map((row) => ciqualItem(row, file.groups))
    })
    .catch((error: unknown) => {
      // Échec (hors ligne avant la première mise en cache…) : on réessaiera au prochain appel.
      ciqualPromise = null
      throw error
    })
  return ciqualPromise
}

/* ------------------------------------------------------------------ */
/* Recherche                                                           */
/* ------------------------------------------------------------------ */

/** Mots trop courants pour compter dans une recherche. */
const STOP_WORDS = new Set([
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'l',
  'd',
  'a',
  'au',
  'aux',
  'et',
  'en',
  'un',
  'une',
])

/** Minuscules, sans accents ni ligatures : « Œuf à la coque » → « oeuf a la coque ». */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Un mot au singulier, à peu près : « pommes » → « pomme », « choux » → « chou ». */
function singular(word: string): string {
  return word.length > 3 && /[sx]$/.test(word) ? word.slice(0, -1) : word
}

/**
 * Les mots d'un texte, normalisés et au singulier. Un « é » final reste distinct (« pâté » → « patee »)
 * pour que « pâtes » ne donne pas d'abord des pâtés.
 */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .map((word) => singular(normalize(word.replace(/é(s?)$/, 'ee$1'))))
}

function queryWords(query: string): string[] {
  return words(query).filter((word) => !STOP_WORDS.has(word))
}

/**
 * Note d'un aliment pour une recherche (null : il ne correspond pas). Chaque mot cherché doit commencer
 * un mot du nom ; un nom qui commence par le premier mot cherché passe devant, puis les noms courts
 * (« Pomme, crue » avant « Compote de pomme… »).
 */
export function matchScore(name: string, query: readonly string[]): number | null {
  if (query.length === 0) return null
  const nameWords = words(name)
  let score = 0
  for (const [i, word] of query.entries()) {
    const position = nameWords.findIndex((candidate) => candidate.startsWith(word))
    if (position < 0) return null
    if (nameWords[position] === word) score += 2
    if (i === 0 && position === 0) score += 10
    score -= position * 0.2
  }
  return score - name.length / 100
}

/** Les aliments qui correspondent à la recherche, les meilleurs d'abord. */
export function searchFoods(items: readonly FoodItem[], query: string, limit = 50): FoodItem[] {
  const terms = queryWords(query)
  if (terms.length === 0) return []
  const scored: { item: FoodItem; score: number }[] = []
  for (const item of items) {
    const score = matchScore(
      item.detail && item.source !== 'ciqual' ? `${item.name} ${item.detail}` : item.name,
      terms,
    )
    if (score !== null) scored.push({ item, score })
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'fr'))
  return scored.slice(0, limit).map((entry) => entry.item)
}
