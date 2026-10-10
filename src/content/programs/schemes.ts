import type { ExperienceLevel, GoalFocus, SlotTarget } from '@/db/types'

/** Façon de travailler : fourchettes de répétitions et de secondes, séries et repos. */
export interface Scheme {
  id: 'strength' | 'muscle' | 'endurance'
  reps: readonly [min: number, max: number]
  hold: readonly [min: number, max: number]
  sets: number
  restSec: number
}

const SCHEMES: Record<Scheme['id'], Omit<Scheme, 'restSec'> & { restSec: Record<ExperienceLevel, number> }> =
  {
    strength: {
      id: 'strength',
      reps: [5, 8],
      hold: [10, 30],
      sets: 3,
      restSec: { beginner: 90, intermediate: 120, advanced: 150 },
    },
    muscle: {
      id: 'muscle',
      reps: [8, 12],
      hold: [20, 40],
      sets: 3,
      restSec: { beginner: 75, intermediate: 90, advanced: 90 },
    },
    endurance: {
      id: 'endurance',
      reps: [12, 20],
      hold: [30, 60],
      sets: 3,
      restSec: { beginner: 60, intermediate: 60, advanced: 60 },
    },
  }

/** Le premier objectif « de force » choisi décide de la façon de travailler. */
export function schemeFor(focuses: readonly GoalFocus[], experience: ExperienceLevel): Scheme {
  const id: Scheme['id'] = focuses.includes('strength')
    ? 'strength'
    : focuses.includes('muscle')
      ? 'muscle'
      : focuses.includes('endurance') || focuses.includes('fatLoss')
        ? 'endurance'
        : 'strength'
  const scheme = SCHEMES[id]
  return { ...scheme, restSec: scheme.restSec[experience] }
}

/** Fourchette de base d'un exercice selon sa mesure. */
export function baseTarget(scheme: Scheme, measure: 'reps' | 'time'): SlotTarget {
  const [min, max] = measure === 'time' ? scheme.hold : scheme.reps
  return { kind: measure, min, max }
}

/** Fourchette d'un échelon de figure : de la moitié de l'objectif à l'objectif. */
export function goalTarget(goal: { kind: 'reps' | 'time'; value: number }): SlotTarget {
  const min =
    goal.kind === 'time' ? Math.max(5, Math.round(goal.value / 2)) : Math.max(1, Math.ceil(goal.value / 2))
  return { kind: goal.kind, min: Math.min(min, goal.value), max: goal.value }
}

/** Repos entre deux séries d'une figure (efforts courts et intenses). */
export const SKILL_REST_SEC = 120
/** Repos entre deux séries de gainage. */
export const CORE_REST_SEC = 60
