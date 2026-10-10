import { db as defaultDb, type CaliTrackDB } from './db'
import { exerciseSchema } from './schema'
import type { Exercise } from './types'

export const CUSTOM_PREFIX = 'perso-'

/** Enregistre un exercice personnel après avoir vérifié qu'il est complet et valide. */
export async function saveCustomExercise(
  exercise: Exercise,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  if (exercise.source !== 'custom' || !exercise.id.startsWith(CUSTOM_PREFIX)) {
    throw new Error('Seuls les exercices personnels peuvent être modifiés.')
  }
  await database.customExercises.put(exerciseSchema.parse(exercise))
}

export interface ExerciseUsage {
  /** Programmes qui utilisent l'exercice. */
  programs: string[]
  /** Nombre de séances de l'historique qui le contiennent. */
  workouts: number
  /** Objectifs qui le suivent. */
  goals: string[]
}

export async function exerciseUsage(
  exerciseId: string,
  database: CaliTrackDB = defaultDb,
): Promise<ExerciseUsage> {
  const [programs, workouts, goals] = await Promise.all([
    database.programs.toArray(),
    database.workouts.toArray(),
    database.goals.toArray(),
  ])
  return {
    programs: programs
      .filter((p) =>
        p.sessions.some((s) => s.blocks.some((b) => b.slots.some((slot) => slot.exerciseId === exerciseId))),
      )
      .map((p) => p.name),
    workouts: workouts.filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId)).length,
    goals: goals
      .filter(
        (g) =>
          g.exerciseId === exerciseId ||
          g.milestones.some((m) => m.criterion !== null && m.criterion.exerciseId === exerciseId),
      )
      .map((g) => g.title),
  }
}

export function isUsed(usage: ExerciseUsage): boolean {
  return usage.programs.length > 0 || usage.workouts > 0 || usage.goals.length > 0
}

/** Supprime un exercice personnel, seulement s'il n'est utilisé nulle part (pas de données orphelines). */
export async function deleteCustomExercise(
  exerciseId: string,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction(
    'rw',
    [database.customExercises, database.exerciseMeta, database.programs, database.workouts, database.goals],
    async () => {
      if (isUsed(await exerciseUsage(exerciseId, database))) {
        throw new Error('Cet exercice est utilisé : il ne peut pas être supprimé.')
      }
      await database.customExercises.delete(exerciseId)
      await database.exerciseMeta.delete(exerciseId)
    },
  )
}
