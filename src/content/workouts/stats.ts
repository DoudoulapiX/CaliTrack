import type { Workout } from '@/db/types'

export interface WorkoutStats {
  setsDone: number
  setsTotal: number
  /** Répétitions faites (toutes séries comptées). */
  reps: number
  /** Secondes de maintien (gainage, figures tenues…). */
  holdSec: number
  /** Charge totale soulevée : répétitions × charge, en kg. */
  volumeKg: number
  /** Exercices avec au moins une série faite. */
  exercisesDone: number
}

export function workoutStats(workout: Pick<Workout, 'exercises'>): WorkoutStats {
  const stats: WorkoutStats = {
    setsDone: 0,
    setsTotal: 0,
    reps: 0,
    holdSec: 0,
    volumeKg: 0,
    exercisesDone: 0,
  }
  for (const exercise of workout.exercises) {
    let any = false
    for (const set of exercise.sets) {
      stats.setsTotal++
      if (!set.done) continue
      any = true
      stats.setsDone++
      stats.reps += set.reps ?? 0
      stats.holdSec += set.durationSec ?? 0
      stats.volumeKg += (set.reps ?? 0) * (set.loadKg ?? 0)
    }
    if (any) stats.exercisesDone++
  }
  stats.volumeKg = Math.round(stats.volumeKg * 10) / 10
  return stats
}

/** Durée de la séance en secondes (en cours : jusqu'à maintenant). */
export function workoutDurationSec(
  workout: Pick<Workout, 'startedAt' | 'endedAt'>,
  nowMs: number = Date.now(),
): number {
  const end = workout.endedAt ? Date.parse(workout.endedAt) : nowMs
  return Math.max(0, Math.round((end - Date.parse(workout.startedAt)) / 1000))
}
