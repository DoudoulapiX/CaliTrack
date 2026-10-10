import { nowISO } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import { programSchema, workoutSchema } from './schema'
import type { Program, ProgressionChange, Workout } from './types'

/*
 * Séances réalisées. Une seule séance est en cours à la fois ; une fois terminée, elle rejoint
 * l'historique et fait progresser le programme dont elle vient.
 */

export class WorkoutInProgressError extends Error {
  readonly active: Workout

  constructor(active: Workout) {
    super('Une séance est déjà en cours.')
    this.name = 'WorkoutInProgressError'
    this.active = active
  }
}

/** La séance en cours, s'il y en a une. */
export async function getActiveWorkout(database: CaliTrackDB = defaultDb): Promise<Workout | undefined> {
  return database.workouts.where('status').equals('active').first()
}

/** Commence une séance (vérifiée) ; refusée si une autre est déjà en cours. */
export async function startWorkout(workout: Workout, database: CaliTrackDB = defaultDb): Promise<Workout> {
  const valid = workoutSchema.parse(workout)
  await database.transaction('rw', database.workouts, async () => {
    const active = await getActiveWorkout(database)
    if (active && active.id !== valid.id) throw new WorkoutInProgressError(active)
    await database.workouts.put(valid)
  })
  return valid
}

/** Modifie une séance à partir de sa version enregistrée, d'un seul tenant. */
export async function updateWorkout(
  id: string,
  change: (workout: Workout) => Workout,
  database: CaliTrackDB = defaultDb,
): Promise<Workout> {
  return database.transaction('rw', database.workouts, async () => {
    const current = await database.workouts.get(id)
    if (!current) throw new Error('Séance introuvable.')
    const next = workoutSchema.parse({ ...change(current), id })
    await database.workouts.put(next)
    return next
  })
}

/** Supprime une séance (abandonnée, ou retirée de l'historique). */
export async function deleteWorkout(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.workouts.delete(id)
}

export interface FinishInput {
  rpe: number | null
  notes: string
  endedAt?: string
}

/** Progression du programme d'après la séance (null : rien à appliquer). */
export type ProgressFn = (
  program: Program,
  workout: Workout,
) => { program: Program; changes: ProgressionChange[] } | null

/**
 * Termine la séance : elle rejoint l'historique, et le programme dont elle vient progresse
 * (séries faites comparées aux objectifs), d'un seul tenant.
 */
export async function finishWorkout(
  id: string,
  input: FinishInput,
  progress: ProgressFn,
  database: CaliTrackDB = defaultDb,
): Promise<Workout> {
  return database.transaction('rw', database.workouts, database.programs, async () => {
    const current = await database.workouts.get(id)
    if (!current) throw new Error('Séance introuvable.')
    if (current.status === 'done') return current
    const done: Workout = {
      ...current,
      status: 'done',
      endedAt: input.endedAt ?? nowISO(),
      rpe: input.rpe,
      notes: input.notes.trim(),
    }
    const program = current.programId ? await database.programs.get(current.programId) : undefined
    const result = program ? progress(program, done) : null
    if (program && result) {
      const next = programSchema.parse({ ...result.program, id: program.id, updatedAt: nowISO() })
      await database.programs.put(next)
      done.progression = result.changes
    }
    const valid = workoutSchema.parse(done)
    await database.workouts.put(valid)
    return valid
  })
}

/** Séances terminées, la plus récente d'abord. */
export async function listDoneWorkouts(database: CaliTrackDB = defaultDb): Promise<Workout[]> {
  const done = await database.workouts.where('status').equals('done').toArray()
  return done.sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt))
}
