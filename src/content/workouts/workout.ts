import type {
  BlockKind,
  ExerciseMeasure,
  ProgramSession,
  SlotTarget,
  Workout,
  WorkoutExercise,
  WorkoutSet,
} from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { deloadSets } from '@/content/programs/schedule'

/*
 * Séance en cours : préparée d'après une séance du programme (ou libre), puis remplie série après
 * série. Fonctions sans effet de bord : chacune rend une nouvelle séance, que l'écran enregistre.
 */

export const FREE_WORKOUT_TITLE = 'Séance libre'

/** Séries ajoutées par défaut à un exercice ajouté en route. */
export const DEFAULT_NEW_SETS = 3

export function emptySet(newId: () => string, loadKg: number | null = null): WorkoutSet {
  return {
    id: newId(),
    reps: null,
    durationSec: null,
    loadKg,
    assistance: null,
    rpe: null,
    done: false,
    completedAt: null,
  }
}

/** Séance à faire d'après une séance du programme ; moitié moins de séries en semaine allégée. */
export function workoutFromSession(args: {
  programId: string
  session: ProgramSession
  date: ISODate
  now: string
  deload: boolean
  newId: () => string
}): Workout {
  const { session, newId } = args
  const exercises: WorkoutExercise[] = session.blocks.flatMap((block) =>
    block.slots.map((slot) => ({
      id: newId(),
      exerciseId: slot.exerciseId,
      slotId: slot.id,
      block: block.kind,
      target: slot.target,
      restSec: slot.restSec,
      sets: Array.from({ length: args.deload ? deloadSets(slot.sets) : slot.sets }, () =>
        emptySet(newId, slot.loadKg),
      ),
      note: '',
    })),
  )
  return {
    id: newId(),
    date: args.date,
    startedAt: args.now,
    endedAt: null,
    title: session.name,
    programId: args.programId,
    programSessionId: session.id,
    eventId: null,
    exercises,
    rpe: null,
    notes: '',
    status: 'active',
    deload: args.deload,
    progression: [],
  }
}

/** Séance hors programme : on ajoute les exercices au fur et à mesure. */
export function freeWorkout(args: {
  date: ISODate
  now: string
  newId: () => string
  title?: string
}): Workout {
  return {
    id: args.newId(),
    date: args.date,
    startedAt: args.now,
    endedAt: null,
    title: args.title?.trim() || FREE_WORKOUT_TITLE,
    programId: null,
    programSessionId: null,
    eventId: null,
    exercises: [],
    rpe: null,
    notes: '',
    status: 'active',
    deload: false,
    progression: [],
  }
}

/** Ce que mesure un exercice de la séance : son objectif, sinon sa fiche. */
export function measureOf(exercise: WorkoutExercise, fallback: ExerciseMeasure = 'reps'): ExerciseMeasure {
  return exercise.target?.kind ?? fallback
}

/** Valeur d'une série selon la mesure (répétitions ou secondes). */
export function setValue(set: WorkoutSet, measure: ExerciseMeasure): number | null {
  return measure === 'time' ? set.durationSec : set.reps
}

/** Valeur proposée pour une série : celle de la série faite juste avant, sinon le haut de la fourchette. */
export function suggestedValue(
  exercise: WorkoutExercise,
  setIndex: number,
  measure: ExerciseMeasure,
): number | null {
  for (let i = setIndex - 1; i >= 0; i--) {
    const set = exercise.sets[i]
    const value = set?.done ? setValue(set, measure) : null
    if (value !== null) return value
  }
  return exercise.target?.max ?? null
}

function mapExercise(
  workout: Workout,
  exerciseId: string,
  fn: (exercise: WorkoutExercise) => WorkoutExercise,
): Workout {
  return {
    ...workout,
    exercises: workout.exercises.map((e) => (e.id === exerciseId ? fn(e) : e)),
  }
}

function mapSet(
  workout: Workout,
  exerciseId: string,
  setId: string,
  fn: (set: WorkoutSet) => WorkoutSet,
): Workout {
  return mapExercise(workout, exerciseId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? fn(s) : s)),
  }))
}

export interface AddedExercise {
  restSec: number
  newId: () => string
  target?: SlotTarget | null
  sets?: number
  /** Charge de départ de chaque série. */
  loadKg?: number | null
  /** Bloc auquel l'exercice ressemble (étirement, renforcement…), pour les records. */
  block?: BlockKind | null
}

/** Ajoute un exercice en fin de séance. */
export function addExercise(workout: Workout, exerciseId: string, options: AddedExercise): Workout {
  const added: WorkoutExercise = {
    id: options.newId(),
    exerciseId,
    slotId: null,
    block: options.block ?? null,
    target: options.target ?? null,
    restSec: options.restSec,
    sets: Array.from({ length: options.sets ?? DEFAULT_NEW_SETS }, () =>
      emptySet(options.newId, options.loadKg ?? null),
    ),
    note: '',
  }
  return { ...workout, exercises: [...workout.exercises, added] }
}

/**
 * Remplace l'exercice (matériel pris, trop dur…) : mêmes séries, à refaire. L'exercice prévu ne
 * progressera pas cette fois (voir progressProgram).
 */
export function replaceExercise(
  workout: Workout,
  id: string,
  exerciseId: string,
  target: SlotTarget | null,
  loadKg: number | null = null,
): Workout {
  return mapExercise(workout, id, (e) => ({
    ...e,
    exerciseId,
    target,
    sets: e.sets.map((s) => ({
      ...s,
      reps: null,
      durationSec: null,
      loadKg,
      done: false,
      completedAt: null,
    })),
  }))
}

export function removeExercise(workout: Workout, id: string): Workout {
  return { ...workout, exercises: workout.exercises.filter((e) => e.id !== id) }
}

/** Monte (-1) ou descend (+1) un exercice dans la séance. */
export function moveExercise(workout: Workout, id: string, direction: -1 | 1): Workout {
  const index = workout.exercises.findIndex((e) => e.id === id)
  const target = index + direction
  if (index < 0 || target < 0 || target >= workout.exercises.length) return workout
  const exercises = [...workout.exercises]
  const [moved] = exercises.splice(index, 1)
  if (moved) exercises.splice(target, 0, moved)
  return { ...workout, exercises }
}

/** Une série de plus, avec la charge de la dernière. */
export function addSet(workout: Workout, id: string, newId: () => string): Workout {
  return mapExercise(workout, id, (e) => ({
    ...e,
    sets: [...e.sets, emptySet(newId, e.sets.at(-1)?.loadKg ?? null)],
  }))
}

/** Retire une série (il en reste toujours au moins une). */
export function removeSet(workout: Workout, id: string, setId: string): Workout {
  return mapExercise(workout, id, (e) =>
    e.sets.length <= 1 ? e : { ...e, sets: e.sets.filter((s) => s.id !== setId) },
  )
}

export interface SetValues {
  reps?: number | null
  durationSec?: number | null
  loadKg?: number | null
}

function cleanValues(values: SetValues): SetValues {
  const clean: SetValues = {}
  const count = (n: number | null | undefined) =>
    n === undefined ? undefined : n === null ? null : Math.max(0, Math.round(n))
  if (values.reps !== undefined) clean.reps = count(values.reps)
  if (values.durationSec !== undefined) clean.durationSec = count(values.durationSec)
  if (values.loadKg !== undefined) {
    clean.loadKg = values.loadKg === null || values.loadKg <= 0 ? null : Math.round(values.loadKg * 100) / 100
  }
  return clean
}

/** Change les valeurs d'une série (faite ou non). */
export function updateSet(workout: Workout, id: string, setId: string, values: SetValues): Workout {
  return mapSet(workout, id, setId, (s) => ({ ...s, ...cleanValues(values) }))
}

/** Change la charge d'une série, et des suivantes pas encore faites (on garde la même charge). */
export function updateLoad(workout: Workout, id: string, setId: string, loadKg: number | null): Workout {
  const { loadKg: clean = null } = cleanValues({ loadKg })
  return mapExercise(workout, id, (e) => {
    const index = e.sets.findIndex((s) => s.id === setId)
    if (index < 0) return e
    return {
      ...e,
      sets: e.sets.map((s, i) => (i === index || (i > index && !s.done) ? { ...s, loadKg: clean } : s)),
    }
  })
}

/** Série faite, avec ses valeurs. */
export function completeSet(
  workout: Workout,
  id: string,
  setId: string,
  values: SetValues,
  now: string,
): Workout {
  return mapSet(workout, id, setId, (s) => ({ ...s, ...cleanValues(values), done: true, completedAt: now }))
}

/** Série à refaire : elle garde ses valeurs. */
export function reopenSet(workout: Workout, id: string, setId: string): Workout {
  return mapSet(workout, id, setId, (s) => ({ ...s, done: false, completedAt: null }))
}

export function setExerciseNote(workout: Workout, id: string, note: string): Workout {
  return mapExercise(workout, id, (e) => ({ ...e, note }))
}

export interface PendingSet {
  exercise: WorkoutExercise
  set: WorkoutSet
  /** Rang de la série dans l'exercice, à partir de 0. */
  index: number
}

/** Prochaine série à faire, dans l'ordre de la séance (après `after` si donné). */
export function nextPendingSet(
  workout: Pick<Workout, 'exercises'>,
  after?: { exerciseId: string; setId: string },
): PendingSet | null {
  const all = workout.exercises.flatMap((exercise) =>
    exercise.sets.map((set, index) => ({ exercise, set, index })),
  )
  const start = after
    ? all.findIndex((p) => p.exercise.id === after.exerciseId && p.set.id === after.setId)
    : -1
  const rest = [...all.slice(start + 1), ...all.slice(0, start + 1)]
  return rest.find((p) => !p.set.done) ?? null
}

/** La séance a-t-elle au moins une série faite ? */
export function hasDoneSets(workout: Pick<Workout, 'exercises'>): boolean {
  return workout.exercises.some((e) => e.sets.some((s) => s.done))
}
