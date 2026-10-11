import type { Goal } from '@/db/types'

/*
 * Modifications d'un objectif, sans toucher à la base : l'écran enregistre le résultat.
 */

/** Coche (ou décoche) une étape réussie en dehors de l'appli. */
export function withMilestoneAchieved(goal: Goal, milestoneId: string, achieved: boolean, now: string): Goal {
  return {
    ...goal,
    milestones: goal.milestones.map((m) =>
      m.id === milestoneId ? { ...m, achievedAt: achieved ? (m.achievedAt ?? now) : null } : m,
    ),
  }
}

/** Avancement noté à la main (objectif libre) : à 100 %, l'objectif est atteint. */
export function withManualProgress(goal: Goal, percent: number, now: string): Goal {
  const manualProgress = Math.round(Math.min(100, Math.max(0, percent)))
  return {
    ...goal,
    manualProgress,
    achievedAt: manualProgress >= 100 ? (goal.achievedAt ?? now) : null,
  }
}

/** Marque l'objectif atteint (réussi sans l'avoir noté dans l'appli), ou annule ce marquage. */
export function withAchieved(goal: Goal, achieved: boolean, now: string): Goal {
  return { ...goal, achievedAt: achieved ? (goal.achievedAt ?? now) : null }
}

/** Nouvelle cible d'une étape (répétitions ou secondes). */
export function withStepTarget(goal: Goal, milestoneId: string, value: number): Goal {
  return {
    ...goal,
    milestones: goal.milestones.map((m) =>
      m.id === milestoneId && m.criterion ? { ...m, criterion: { ...m.criterion, value } } : m,
    ),
  }
}

/** Retire une étape (il en reste toujours au moins une). */
export function withoutStep(goal: Goal, milestoneId: string): Goal {
  if (goal.milestones.length <= 1) return goal
  return { ...goal, milestones: goal.milestones.filter((m) => m.id !== milestoneId) }
}
