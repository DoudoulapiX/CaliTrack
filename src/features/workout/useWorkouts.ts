import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Workout } from '@/db/types'
import { getActiveWorkout, listDoneWorkouts } from '@/db/workouts'

/** La séance en cours ; null s'il n'y en a pas (undefined pendant le chargement). */
export function useActiveWorkout(): Workout | null | undefined {
  return useLiveQuery(async () => (await getActiveWorkout()) ?? null, [])
}

/** Une séance ; null si elle n'existe pas (undefined pendant le chargement). */
export function useWorkout(id: string | undefined): Workout | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.workouts.get(id)) ?? null) : null), [id])
}

/** Séances terminées, la plus récente d'abord (undefined pendant le chargement). */
export function useDoneWorkouts(): Workout[] | undefined {
  return useLiveQuery(() => listDoneWorkouts(), [])
}

/** Adresse de l'écran d'une séance (en cours, ou son bilan juste après). */
export function workoutPath(id: string): string {
  return `/workout/${id}`
}

/** Adresse d'une séance de l'historique. */
export function historyPath(id: string): string {
  return `/training/history/${id}`
}
