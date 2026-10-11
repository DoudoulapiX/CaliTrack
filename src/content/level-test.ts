import type { EquipmentKind, ExperienceLevel, LevelTest } from '@/db/types'
import { formatDuration } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'

/** Résultats du test de niveau, sans la date. */
export type LevelTestValues = Omit<LevelTest, 'date'>
export type LevelTestKey = keyof LevelTestValues

export interface LevelTestItem {
  key: LevelTestKey
  label: string
  /** Fiche de l'exercice dans le répertoire. */
  exerciseId: string
  unit: 'reps' | 'sec'
  /** Valeurs à partir desquelles on est intermédiaire, puis avancé. */
  thresholds: readonly [intermediate: number, advanced: number]
  /** Valeur maximale acceptée à la saisie. */
  max: number
  /** Matériel indispensable pour faire ce test. */
  needs: EquipmentKind | null
  how: string
}

export const LEVEL_TEST_ITEMS: readonly LevelTestItem[] = [
  {
    key: 'pushUps',
    label: 'Pompes',
    exerciseId: 'pushup',
    unit: 'reps',
    thresholds: [15, 40],
    max: 300,
    needs: null,
    how: 'Corps gainé de la tête aux pieds, poitrine à un poing du sol, bras tendus en haut.',
  },
  {
    key: 'pullUps',
    label: 'Tractions',
    exerciseId: 'pullup',
    unit: 'reps',
    thresholds: [4, 12],
    max: 100,
    needs: 'pullupBar',
    how: 'Départ bras tendus, menton au-dessus de la barre, sans élan.',
  },
  {
    key: 'dips',
    label: 'Dips',
    exerciseId: 'dip',
    unit: 'reps',
    thresholds: [8, 20],
    max: 150,
    needs: 'dipBars',
    how: frenchSpacing('Aux barres parallèles : épaules sous les coudes en bas, bras tendus en haut.'),
  },
  {
    key: 'squats',
    label: 'Squats',
    exerciseId: 'squat',
    unit: 'reps',
    thresholds: [30, 60],
    max: 500,
    needs: null,
    how: 'Cuisses au moins parallèles au sol, talons au sol, sans pause.',
  },
  {
    key: 'plankSec',
    label: 'Gainage',
    exerciseId: 'plank',
    unit: 'sec',
    thresholds: [60, 120],
    max: 1800,
    needs: null,
    how: frenchSpacing('Sur les avant-bras, corps droit : arrête quand les hanches tombent.'),
  },
  {
    key: 'deadHangSec',
    label: 'Suspension',
    exerciseId: 'dead-hang',
    unit: 'sec',
    thresholds: [30, 60],
    max: 900,
    needs: 'pullupBar',
    how: frenchSpacing('Bras tendus à la barre, épaules actives : arrête quand tu lâches.'),
  },
]

export const LEVEL_TEST_INTRO = frenchSpacing(
  'Fais chaque test une seule fois, bien reposé, avec 3 minutes de pause entre deux. ' +
    'Compte seulement les répétitions propres et laisse vide ce que tu ne peux pas tester.',
)

export const EMPTY_LEVEL_TEST: LevelTestValues = {
  pushUps: null,
  pullUps: null,
  dips: null,
  squats: null,
  plankSec: null,
  deadHangSec: null,
}

const LEVELS: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'advanced']

export function itemLevel(item: LevelTestItem, value: number): ExperienceLevel {
  const [intermediate, advanced] = item.thresholds
  if (value >= advanced) return 'advanced'
  return value >= intermediate ? 'intermediate' : 'beginner'
}

/** Niveau d'ensemble : moyenne des tests faits, arrondie. Null si aucun test n'est rempli. */
export function overallLevel(values: LevelTestValues): ExperienceLevel | null {
  const scores = LEVEL_TEST_ITEMS.flatMap((item) => {
    const value = values[item.key]
    return value === null ? [] : [LEVELS.indexOf(itemLevel(item, value))]
  })
  if (scores.length === 0) return null
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length
  return LEVELS[Math.round(mean)] ?? 'beginner'
}

export function hasAnyResult(values: LevelTestValues): boolean {
  return LEVEL_TEST_ITEMS.some((item) => values[item.key] !== null)
}

/** « 12 répétitions », « 1 répétition », « 1 min 30 s ». */
export function formatTestValue(item: LevelTestItem, value: number): string {
  if (item.unit === 'sec') return formatDuration(value)
  return `${value} répétition${value > 1 ? 's' : ''}`
}
