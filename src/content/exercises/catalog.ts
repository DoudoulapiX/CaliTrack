import type {
  EquipmentItem,
  EquipmentKind,
  Exercise,
  ExerciseCategory,
  ExerciseLevel,
  Muscle,
} from '@/db/types'
import { ALWAYS_AVAILABLE, EQUIPMENT_LABEL } from '@/content/equipment'
import { CALITRACK_EXERCISES } from './calisthenics'
import { CATEGORY_LABEL, MUSCLE_LABEL } from './labels'

/* ------------------------------------------------------------------ */
/* Chargement                                                          */
/* ------------------------------------------------------------------ */

let fedbPromise: Promise<Exercise[]> | null = null

/**
 * Charge la base générale (plus de 800 fiches) à la demande, une seule fois :
 * elle est dans un fichier à part pour ne pas ralentir l'ouverture de l'appli.
 */
export function loadFedbExercises(): Promise<Exercise[]> {
  fedbPromise ??= import('@/data/fedb.json?raw')
    .then((module) => JSON.parse(module.default) as Exercise[])
    .catch((error: unknown) => {
      // Échec (hors ligne avant la première mise en cache…) : on réessaiera au prochain appel.
      fedbPromise = null
      throw error
    })
  return fedbPromise
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export interface Catalog {
  /** Tous les exercices, triés par nom. */
  all: readonly Exercise[]
  byId: ReadonlyMap<string, Exercise>
}

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true })

export function compareByName(a: Pick<Exercise, 'name'>, b: Pick<Exercise, 'name'>): number {
  return collator.compare(a.name, b.name)
}

/** Réunit les exercices CaliTrack, la base générale et les exercices personnels (sans doublon d'identifiant). */
export function buildCatalog(fedb: readonly Exercise[], custom: readonly Exercise[]): Catalog {
  const byId = new Map<string, Exercise>()
  for (const exercise of [...CALITRACK_EXERCISES, ...fedb, ...custom]) {
    if (!byId.has(exercise.id)) byId.set(exercise.id, exercise)
  }
  return { all: [...byId.values()].sort(compareByName), byId }
}

/** Nom affiché pour un identifiant, même si l'exercice n'existe plus. */
export function exerciseName(catalog: Pick<Catalog, 'byId'>, id: string): string {
  return catalog.byId.get(id)?.name ?? 'Exercice supprimé'
}

/* ------------------------------------------------------------------ */
/* Matériel                                                            */
/* ------------------------------------------------------------------ */

/**
 * Matériel disponible dans un lieu. `locationId` null : tout le matériel possédé.
 * Un objet rangé dans aucun lieu est considéré comme disponible partout.
 */
export function kindsAt(items: readonly EquipmentItem[], locationId: string | null): Set<EquipmentKind> {
  const kinds = new Set<EquipmentKind>(ALWAYS_AVAILABLE)
  for (const item of items) {
    if (locationId === null || item.locationIds.length === 0 || item.locationIds.includes(locationId)) {
      kinds.add(item.kind)
    }
  }
  return kinds
}

/** Vrai si tout le matériel d'au moins une des alternatives est disponible. */
export function canDoWith(
  exercise: Pick<Exercise, 'equipment'>,
  available: ReadonlySet<EquipmentKind>,
): boolean {
  return (
    exercise.equipment.length === 0 ||
    exercise.equipment.some((group) => group.every((kind) => available.has(kind)))
  )
}

const NO_GEAR: ReadonlySet<EquipmentKind> = new Set<EquipmentKind>([...ALWAYS_AVAILABLE, 'mat'])

/** Faisable sans aucun matériel (le sol, un mur ou un tapis suffisent). */
export function isBodyweightOnly(exercise: Pick<Exercise, 'equipment'>): boolean {
  return canDoWith(exercise, NO_GEAR)
}

/** Matériel en clair : « Barre de traction ou Anneaux », « Haltères + Banc », « Sans matériel ». */
export function equipmentSummary(equipment: readonly (readonly EquipmentKind[])[], max = 2): string {
  if (equipment.length === 0) return 'Sans matériel'
  const groups = equipment
    .slice(0, max)
    .map((group) => group.map((kind) => EQUIPMENT_LABEL[kind]).join(' + '))
  const more = equipment.length > max ? '…' : ''
  return groups.join(' ou ') + more
}

/* ------------------------------------------------------------------ */
/* Recherche et filtres                                                */
/* ------------------------------------------------------------------ */

/** Texte comparable : minuscules, sans accents ni ponctuation. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Mots de la recherche ; un « s » final est ignoré (pompes → pompe, abdos → abdo). */
export function queryTokens(query: string): string[] {
  return normalizeText(query)
    .split(' ')
    .filter((token) => token.length > 0)
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
}

interface SearchEntry {
  name: string
  /** Nom avec les mêmes règles que la recherche (« Tractions » → « traction »). */
  stem: string
  nameWords: string[]
  alt: string
  all: string
}

const searchEntries = new WeakMap<Exercise, SearchEntry>()

function searchEntry(exercise: Exercise): SearchEntry {
  let entry = searchEntries.get(exercise)
  if (!entry) {
    const name = normalizeText(exercise.name)
    const alt = normalizeText([exercise.nameEn ?? '', ...exercise.aliases].join(' '))
    const muscles = [...exercise.primaryMuscles, ...exercise.secondaryMuscles]
      .map((muscle) => `${MUSCLE_LABEL[muscle]} ${muscle}`)
      .join(' ')
    const gear = exercise.equipment.flat().map((kind) => EQUIPMENT_LABEL[kind])
    const other = normalizeText(
      [muscles, ...gear, CATEGORY_LABEL[exercise.category], exercise.unilateral ? 'unilateral' : ''].join(
        ' ',
      ),
    )
    entry = {
      name,
      stem: queryTokens(exercise.name).join(' '),
      nameWords: name.split(' '),
      alt,
      all: `${name} ${alt} ${other}`,
    }
    searchEntries.set(exercise, entry)
  }
  return entry
}

/** Pertinence d'un exercice pour une recherche (0 : ne correspond pas). */
export function searchScore(exercise: Exercise, tokens: readonly string[]): number {
  const first = tokens[0]
  if (first === undefined) return 1
  const entry = searchEntry(exercise)
  if (!tokens.every((token) => entry.all.includes(token))) return 0
  const phrase = tokens.join(' ')
  let score: number
  if (entry.stem === phrase) score = 1000
  else if (entry.stem.startsWith(phrase) || entry.name.startsWith(phrase)) score = 800
  else if (tokens.every((token) => entry.name.includes(token)))
    score = 600 + (entry.nameWords.some((word) => word.startsWith(first)) ? 100 : 0)
  else if (tokens.every((token) => entry.name.includes(token) || entry.alt.includes(token))) score = 400
  else score = 200
  // Les fiches personnelles et CaliTrack (avec animation) passent devant à pertinence égale.
  if (exercise.source === 'custom') score += 60
  else if (exercise.source === 'calitrack') score += 50
  return score
}

const LEVEL_RANK: Record<ExerciseLevel, number> = { beginner: 0, intermediate: 1, expert: 2 }

export type EquipmentFilter = 'all' | 'mine' | 'none'

export interface ExerciseFilter {
  query: string
  categories: readonly ExerciseCategory[]
  /** Muscles principaux. */
  muscles: readonly Muscle[]
  levels: readonly ExerciseLevel[]
  sources: readonly Exercise['source'][]
  equipment: EquipmentFilter
  favorites: boolean
}

export const EMPTY_FILTER: ExerciseFilter = {
  query: '',
  categories: [],
  muscles: [],
  levels: [],
  sources: [],
  equipment: 'all',
  favorites: false,
}

export interface FilterContext {
  /** Matériel disponible (filtre « avec mon matériel »). */
  available: ReadonlySet<EquipmentKind>
  favoriteIds: ReadonlySet<string>
}

/** Nombre de filtres actifs, recherche exclue. */
export function activeFilterCount(filter: ExerciseFilter): number {
  return (
    (filter.categories.length > 0 ? 1 : 0) +
    (filter.muscles.length > 0 ? 1 : 0) +
    (filter.levels.length > 0 ? 1 : 0) +
    (filter.sources.length > 0 ? 1 : 0) +
    (filter.equipment !== 'all' ? 1 : 0) +
    (filter.favorites ? 1 : 0)
  )
}

/**
 * Applique les filtres. Sans recherche, l'ordre d'origine (alphabétique) est conservé ;
 * avec une recherche, les résultats sont classés par pertinence.
 */
export function filterExercises(
  list: readonly Exercise[],
  filter: ExerciseFilter,
  context: FilterContext,
): Exercise[] {
  const tokens = queryTokens(filter.query)
  const scored: { exercise: Exercise; score: number }[] = []
  for (const exercise of list) {
    if (filter.categories.length > 0 && !filter.categories.includes(exercise.category)) continue
    if (filter.levels.length > 0 && !filter.levels.includes(exercise.level)) continue
    if (filter.sources.length > 0 && !filter.sources.includes(exercise.source)) continue
    if (filter.muscles.length > 0 && !exercise.primaryMuscles.some((m) => filter.muscles.includes(m)))
      continue
    if (filter.favorites && !context.favoriteIds.has(exercise.id)) continue
    if (filter.equipment === 'mine' && !canDoWith(exercise, context.available)) continue
    if (filter.equipment === 'none' && !isBodyweightOnly(exercise)) continue
    const score = searchScore(exercise, tokens)
    if (score > 0) scored.push({ exercise, score })
  }
  if (tokens.length > 0) {
    // À pertinence égale : les plus accessibles d'abord, puis par nom.
    scored.sort(
      (a, b) =>
        b.score - a.score ||
        LEVEL_RANK[a.exercise.level] - LEVEL_RANK[b.exercise.level] ||
        compareByName(a.exercise, b.exercise),
    )
  }
  return scored.map((s) => s.exercise)
}

/** Première lettre pour regrouper la liste (A, B… ; « # » pour les chiffres). */
export function initialOf(name: string): string {
  const letter = normalizeText(name).charAt(0).toUpperCase()
  return letter >= 'A' && letter <= 'Z' ? letter : '#'
}
