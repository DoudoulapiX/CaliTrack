import { NBSP } from '../../lib/typography.ts'

/*
 * Transforme la table Ciqual 2025 de l'Anses (licence ouverte Etalab 2.0) en un fichier compact pour
 * l'appli : nom, groupe, énergie et macronutriments pour 100 g, portion habituelle (étude INCA3).
 * scripts/build-foods.ts écrit le résultat dans src/data/ciqual.json ; un test vérifie que ce fichier
 * correspond toujours aux sources (scripts/source).
 */

/** Valeur telle que publiée : nombre, « traces », « < 0,5 » ou absente. */
export type CiqualValue = number | string | null

/** Table Ciqual telle que recopiée depuis le fichier de l'Anses (scripts/source/ciqual-2025.json). */
export interface CiqualSource {
  source: string
  nutriments: string[]
  groupes: Record<string, string>
  /** [code, nom, groupe, sous-groupe, sous-sous-groupe, nom scientifique, valeurs dans l'ordre de `nutriments`]. */
  aliments: [number, string, string, string, string, string | null, CiqualValue[]][]
}

/** Portions de l'étude INCA3 (scripts/source/inca3-portions.json) : grammes et provenance de la valeur. */
export interface PortionSource {
  source: string
  /** a : mesurée pour cet aliment ; v : aliment voisin ; g : médiane de son groupe. */
  portions: Record<string, [number, string]>
}

/** Une ligne du fichier compact : code, nom, groupe, kcal, protéines, glucides, lipides, fibres, sucres, AG saturés, sel, portion. */
export type CiqualRow = [
  code: number,
  name: string,
  group: string,
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber: number | null,
  sugars: number | null,
  satFat: number | null,
  salt: number | null,
  portionG: number | null,
]

export interface CiqualFile {
  source: string
  /** Libellés des groupes utilisés, par code. */
  groups: Record<string, string>
  foods: CiqualRow[]
}

const NUTRIENTS = ['kcal', 'prot', 'gluc', 'lip', 'fibres', 'sucres', 'ags', 'sel', 'alcool'] as const

/**
 * Un nombre exploitable : « traces » et les valeurs sous le seuil de mesure (« < 0,5 ») comptent pour 0,
 * une valeur absente reste inconnue (null).
 */
export function ciqualNumber(value: CiqualValue): number | null {
  if (value === null) return null
  if (typeof value === 'number') return value
  const text = value.trim().toLowerCase()
  if (text === 'tr' || text === 'traces' || text.startsWith('<')) return 0
  const parsed = Number(text.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Nom tel qu'affiché : espaces simples, apostrophe typographique, espace insécable avant « : ; ! ? % »
 * (« steak haché 5% MG » → « steak haché 5 % MG »).
 */
export function cleanName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .replace(/\s+([,)])/g, '$1')
    .replace(/\(\s+/g, '(')
    .replace(/'/g, '’')
    .replace(/\s*([:;!?%])/g, `${NBSP}$1`)
    .trim()
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

/** Le groupe le plus précis qui a un nom (sous-groupe, sinon groupe). */
function groupOf(food: CiqualSource['aliments'][number], groups: Record<string, string>): string {
  const [, , group, subgroup] = food
  return subgroup in groups && !/^0+$/.test(subgroup) ? subgroup : group
}

export function buildCiqual(source: CiqualSource, portions: PortionSource): CiqualFile {
  const index = Object.fromEntries(NUTRIENTS.map((key) => [key, source.nutriments.indexOf(key)])) as Record<
    (typeof NUTRIENTS)[number],
    number
  >
  for (const [key, position] of Object.entries(index)) {
    if (position < 0) throw new Error(`Nutriment absent de la source : ${key}`)
  }

  const foods: CiqualRow[] = []
  const usedGroups = new Set<string>()
  for (const food of source.aliments) {
    const [code, rawName, , , , , values] = food
    const value = (key: (typeof NUTRIENTS)[number]) => ciqualNumber(values[index[key]] ?? null)
    const protein = value('prot')
    const carbs = value('gluc')
    const fat = value('lip')
    const fiber = value('fibres')
    const alcohol = value('alcool') ?? 0
    // Énergie manquante : calculée avec les coefficients du règlement européen 1169/2011.
    const kcal =
      value('kcal') ??
      (protein === null || carbs === null || fat === null
        ? null
        : 4 * protein + 4 * carbs + 9 * fat + 2 * (fiber ?? 0) + 7 * alcohol)
    // Sans énergie ni macronutriments connus, l'aliment ne peut pas être compté : il est laissé de côté.
    if (kcal === null || (protein === null && carbs === null && fat === null)) continue

    const group = groupOf(food, source.groupes)
    usedGroups.add(group)
    const portion = portions.portions[String(code)]
    const portionG = portion && portion[0] > 0 ? portion[0] : null
    const sugars = value('sucres')
    const satFat = value('ags')
    const salt = value('sel')
    foods.push([
      code,
      cleanName(rawName),
      group,
      Math.round(kcal),
      round(protein ?? 0, 1),
      round(carbs ?? 0, 1),
      round(fat ?? 0, 1),
      fiber === null ? null : round(fiber, 1),
      sugars === null ? null : round(sugars, 1),
      satFat === null ? null : round(satFat, 1),
      salt === null ? null : round(salt, 2),
      portionG,
    ])
  }
  foods.sort((a, b) => a[0] - b[0])

  const groups = Object.fromEntries(
    [...usedGroups].sort().map((code) => [code, source.groupes[code] ?? '']),
  ) as Record<string, string>
  return {
    source:
      'Anses, table de composition nutritionnelle des aliments Ciqual 2025 (licence ouverte Etalab 2.0) ; portions : étude INCA3 (Anses)',
    groups,
    foods,
  }
}

/** Le fichier tel qu'écrit dans src/data/ciqual.json : une ligne par aliment, pour des différences lisibles. */
export function serializeCiqual(file: CiqualFile): string {
  // Les espaces insécables restent visibles dans le fichier : \u00a0.
  const json = (value: unknown) => JSON.stringify(value).replace(/\u00a0/g, '\\u00a0')
  const rows = file.foods.map((row) => `    ${json(row)}`).join(',\n')
  return `{\n  "source": ${JSON.stringify(file.source)},\n  "groups": ${JSON.stringify(file.groups)},\n  "foods": [\n${rows}\n  ]\n}\n`
}
