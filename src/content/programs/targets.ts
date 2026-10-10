import type { Exercise, SlotTarget } from '@/db/types'
import type { Ladder } from './ladders'
import { baseTarget, goalTarget, type Scheme } from './schemes'

/** Les négatives (descente lente) se font en peu de répétitions, quelle que soit la façon de travailler. */
export const NEGATIVE_TARGET: SlotTarget = { kind: 'reps', min: 3, max: 5 }

export function isNegative(exerciseId: string): boolean {
  return exerciseId.endsWith('-negative')
}

/** Fourchette d'un échelon de progression pour cette façon de travailler. */
export function targetForStep(
  ladder: Ladder,
  index: number,
  exercise: Pick<Exercise, 'id' | 'measure'>,
  scheme: Scheme,
): SlotTarget {
  const s = ladder.steps[index]
  if (s?.goal) return goalTarget(s.goal)
  if (isNegative(exercise.id)) return NEGATIVE_TARGET
  if (ladder.id === 'core' && exercise.measure === 'time') {
    return scheme.id === 'endurance' ? { kind: 'time', min: 30, max: 60 } : { kind: 'time', min: 20, max: 45 }
  }
  if (ladder.id === 'fingers') {
    // Poutre : suspensions courtes et intenses ; la suspension à la barre reste un exercice d'endurance.
    if (exercise.measure === 'reps') return { kind: 'reps', min: 4, max: 6 }
    return exercise.id === 'dead-hang'
      ? { kind: 'time', min: 20, max: 40 }
      : { kind: 'time', min: 7, max: 12 }
  }
  return baseTarget(scheme, exercise.measure)
}

export function sameTarget(a: SlotTarget, b: SlotTarget): boolean {
  return a.kind === b.kind && a.min === b.min && a.max === b.max
}
