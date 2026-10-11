import type { EquipmentItem, EquipmentKind, Exercise, ExperienceLevel, Profile } from '@/db/types'
import { canDoWith, kindsAt } from '@/content/exercises/catalog'
import { LEVEL_TEST_ITEMS, type LevelTestKey } from '@/content/level-test'
import type { Ladder, LadderStep } from './ladders'
import { loadsFor } from './loads'

/** Ce qu'il faut pour savoir si un exercice est faisable : la liste des exercices et le matériel du lieu. */
export interface TrainingContext {
  exercises: ReadonlyMap<string, Exercise>
  kinds: ReadonlySet<EquipmentKind>
  /** Charges disponibles pour un exercice, croissantes. */
  loadsOf: (exercise: Exercise) => number[]
}

export function trainingContext(
  exercises: ReadonlyMap<string, Exercise>,
  items: readonly EquipmentItem[],
  locationId: string | null,
): TrainingContext {
  return {
    exercises,
    kinds: kindsAt(items, locationId),
    loadsOf: (exercise) => loadsFor(exercise, items, locationId),
  }
}

export interface ResolvedStep {
  exerciseId: string
  /** Charge de départ pour un échelon chargé, sinon null. */
  loadKg: number | null
}

/** Exercice faisable pour un échelon (le premier dont on a le matériel), ou null. */
export function resolveStep(step: LadderStep, context: TrainingContext): ResolvedStep | null {
  for (const id of step.exerciseIds) {
    const exercise = context.exercises.get(id)
    if (!exercise || !canDoWith(exercise, context.kinds)) continue
    if (step.minLoadKg === undefined) return { exerciseId: id, loadKg: null }
    const minKg = step.minLoadKg
    const start = context.loadsOf(exercise).find((kg) => kg >= minKg)
    if (start !== undefined) return { exerciseId: id, loadKg: start }
  }
  return null
}

/** Premier échelon faisable après `index`, ou -1. */
export function nextAvailableStep(ladder: Ladder, index: number, context: TrainingContext): number {
  for (let i = index + 1; i < ladder.steps.length; i++) {
    const s = ladder.steps[i]
    if (s && resolveStep(s, context)) return i
  }
  return -1
}

/** Dernier échelon faisable avant `index`, ou -1. */
export function previousAvailableStep(ladder: Ladder, index: number, context: TrainingContext): number {
  for (let i = Math.min(index, ladder.steps.length) - 1; i >= 0; i--) {
    const s = ladder.steps[i]
    if (s && resolveStep(s, context)) return i
  }
  return -1
}

/* ------------------------------------------------------------------ */
/* Niveau                                                              */
/* ------------------------------------------------------------------ */

export type LevelEstimates = Record<LevelTestKey, number>

/** Résultat typique d'un test pour un niveau déclaré (quand le test n'a pas été fait). */
export function typicalResult(key: LevelTestKey, experience: ExperienceLevel): number {
  const item = LEVEL_TEST_ITEMS.find((i) => i.key === key)
  if (!item) return 0
  const [intermediate, advanced] = item.thresholds
  if (experience === 'advanced') return advanced
  if (experience === 'intermediate') return Math.round(intermediate + (advanced - intermediate) / 4)
  return Math.round(intermediate * 0.4)
}

/** Résultats du test de niveau ; les tests non faits sont estimés d'après le niveau déclaré. */
export function levelEstimates(profile: Pick<Profile, 'experience' | 'levelTest'>): {
  values: LevelEstimates
  measured: LevelTestKey[]
} {
  const measured: LevelTestKey[] = []
  const values = {} as LevelEstimates
  for (const item of LEVEL_TEST_ITEMS) {
    const value = profile.levelTest?.[item.key] ?? null
    if (value === null) values[item.key] = typicalResult(item.key, profile.experience)
    else {
      values[item.key] = value
      measured.push(item.key)
    }
  }
  return { values, measured }
}

/** Échelons exprimés en répétitions du test : ils supposent des séries de 5, à ajuster pour 8 ou 12. */
const REFERENCE_REPS = 5

/**
 * Échelon de départ : le plus dur que le résultat du test permet et dont on a le matériel.
 * -1 si aucun n'est accessible (matériel manquant, niveau encore trop juste).
 */
export function startStepIndex(
  ladder: Ladder,
  estimates: LevelEstimates,
  minReps: number,
  context: TrainingContext,
): number {
  const value = ladder.test === null ? 0 : estimates[ladder.test]
  const unit = LEVEL_TEST_ITEMS.find((i) => i.key === ladder.test)?.unit
  const scale = unit === 'reps' ? minReps / REFERENCE_REPS : 1
  let best = -1
  ladder.steps.forEach((s, i) => {
    if (s.entry * scale <= value && resolveStep(s, context)) best = i
  })
  return best
}
