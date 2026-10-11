import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProfile, useSettings } from '@/app/data-context'
import { buildGoalContext, goalProgress, type GoalContext, type GoalProgress } from '@/content/goals/progress'
import { db } from '@/db/db'
import type { BodyMetric, Goal } from '@/db/types'
import { today } from '@/lib/dates'
import { useCatalog } from '@/features/library/catalog-context'
import { useDoneWorkouts } from '@/features/workout/useWorkouts'
import type { LineOptions } from './goal-view'

/** Tous les objectifs (undefined pendant le chargement). */
export function useGoals(): Goal[] | undefined {
  return useLiveQuery(() => db.goals.toArray(), [])
}

/** Un objectif ; null s'il n'existe pas (undefined pendant le chargement). */
export function useGoal(id: string | undefined): Goal | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.goals.get(id)) ?? null) : null), [id])
}

/** Pesées et mensurations, de la plus ancienne à la plus récente. */
export function useBodyMetrics(): BodyMetric[] | undefined {
  return useLiveQuery(() => db.bodyMetrics.orderBy('date').toArray(), [])
}

/** Tout ce qui fait avancer les objectifs : séances, test de niveau, pesées, escalade. */
export function useGoalContext(): GoalContext | undefined {
  const profile = useProfile()
  const workouts = useDoneWorkouts()
  const metrics = useBodyMetrics()
  const climbs = useLiveQuery(() => db.climbingSessions.toArray(), [])
  const scales = useLiveQuery(() => db.gradeScales.toArray(), [])
  const { levelTest, weightKg } = profile
  return useMemo(
    () =>
      workouts && metrics && climbs && scales
        ? buildGoalContext({ workouts, levelTest, metrics, profileWeightKg: weightKg, climbs, scales })
        : undefined,
    [workouts, metrics, climbs, scales, levelTest, weightKg],
  )
}

export interface GoalEntry {
  goal: Goal
  progress: GoalProgress
}

/** Les objectifs avec leur avancement (undefined pendant le chargement). */
export function useGoalEntries(): GoalEntry[] | undefined {
  const goals = useGoals()
  const ctx = useGoalContext()
  return useMemo(
    () => (goals && ctx ? goals.map((goal) => ({ goal, progress: goalProgress(goal, ctx) })) : undefined),
    [goals, ctx],
  )
}

/** De quoi écrire où en est un objectif : noms des exercices, unité de poids, date du jour. */
export function useLineOptions(): LineOptions {
  const catalog = useCatalog()
  const { weightUnit } = useSettings()
  const day = today()
  return useMemo(
    () => ({ exerciseName: (id: string) => catalog.byId.get(id)?.name, unit: weightUnit, today: day }),
    [catalog, weightUnit, day],
  )
}
