import type { BlockKind, Workout, WorkoutSet } from '@/db/types'
import type { ISODate } from '@/lib/dates'

/*
 * Records personnels, recalculés à partir de l'historique : plus de répétitions en une série,
 * maintien le plus long, charge la plus lourde. L'échauffement et les étirements ne comptent pas.
 */

export type RecordKind = 'reps' | 'hold' | 'load'

export interface RecordEntry {
  /** Répétitions, secondes ou kilos selon le record. */
  value: number
  date: ISODate
  workoutId: string
  /** La série du record. */
  reps: number | null
  durationSec: number | null
  loadKg: number | null
}

export interface ExerciseRecords {
  exerciseId: string
  reps: RecordEntry | null
  hold: RecordEntry | null
  load: RecordEntry | null
  /** Séances où l'exercice a été fait. */
  sessions: number
  lastDate: ISODate
}

const STATIC_BLOCKS: readonly (BlockKind | null)[] = ['warmup', 'cooldown']

function valueFor(kind: RecordKind, set: WorkoutSet): number | null {
  const value = kind === 'reps' ? set.reps : kind === 'hold' ? set.durationSec : set.loadKg
  return value !== null && value > 0 ? value : null
}

const KINDS: readonly RecordKind[] = ['reps', 'hold', 'load']

/** Meilleures séries d'une séance, par exercice et par sorte de record. */
function bestOf(workout: Workout): Map<string, Record<RecordKind, RecordEntry | null>> {
  const best = new Map<string, Record<RecordKind, RecordEntry | null>>()
  for (const exercise of workout.exercises) {
    if (STATIC_BLOCKS.includes(exercise.block)) continue
    for (const set of exercise.sets) {
      if (!set.done) continue
      const current = best.get(exercise.exerciseId) ?? { reps: null, hold: null, load: null }
      for (const kind of KINDS) {
        const value = valueFor(kind, set)
        const previous = current[kind]
        if (value === null || (previous && previous.value >= value)) continue
        current[kind] = {
          value,
          date: workout.date,
          workoutId: workout.id,
          reps: set.reps,
          durationSec: set.durationSec,
          loadKg: set.loadKg,
        }
      }
      best.set(exercise.exerciseId, current)
    }
  }
  return best
}

function byTime(a: Pick<Workout, 'date' | 'startedAt'>, b: Pick<Workout, 'date' | 'startedAt'>): number {
  return a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt)
}

function chronological(workouts: readonly Workout[]): Workout[] {
  return workouts.filter((w) => w.status === 'done').sort(byTime)
}

/** Records de chaque exercice d'après les séances terminées (à égalité, le premier garde le record). */
export function exerciseRecords(workouts: readonly Workout[]): Map<string, ExerciseRecords> {
  const records = new Map<string, ExerciseRecords>()
  for (const workout of chronological(workouts)) {
    for (const [exerciseId, best] of bestOf(workout)) {
      const current = records.get(exerciseId) ?? {
        exerciseId,
        reps: null,
        hold: null,
        load: null,
        sessions: 0,
        lastDate: workout.date,
      }
      for (const kind of KINDS) {
        const entry = best[kind]
        const held = current[kind]
        if (entry && (!held || entry.value > held.value)) current[kind] = entry
      }
      current.sessions++
      current.lastDate = workout.date
      records.set(exerciseId, current)
    }
  }
  return records
}

export interface RecordHit {
  exerciseId: string
  kind: RecordKind
  entry: RecordEntry
  previous: RecordEntry
}

/**
 * Records battus pendant une séance, comparée aux séances terminées avant elle. Une première fois
 * n'est pas un record : il faut battre une série déjà faite.
 */
export function recordsBeaten(workout: Workout, others: readonly Workout[]): RecordHit[] {
  const before = exerciseRecords(others.filter((w) => w.id !== workout.id && byTime(w, workout) < 0))
  const hits: RecordHit[] = []
  for (const [exerciseId, best] of bestOf(workout)) {
    const held = before.get(exerciseId)
    if (!held) continue
    for (const kind of KINDS) {
      const entry = best[kind]
      const previous = held[kind]
      if (entry && previous && entry.value > previous.value) hits.push({ exerciseId, kind, entry, previous })
    }
  }
  return hits
}

/**
 * Records battus depuis un jour donné (compris), de la séance la plus récente à la plus ancienne :
 * pour chaque exercice et sorte de record, le dernier battu seulement, comparé au record d'avant lui.
 */
export function recordHitsSince(workouts: readonly Workout[], from: ISODate): RecordHit[] {
  const held = new Map<string, Record<RecordKind, RecordEntry | null>>()
  const latest = new Map<string, { hit: RecordHit; order: number }>()
  chronological(workouts).forEach((workout, order) => {
    for (const [exerciseId, best] of bestOf(workout)) {
      const current = held.get(exerciseId) ?? { reps: null, hold: null, load: null }
      for (const kind of KINDS) {
        const entry = best[kind]
        const previous = current[kind]
        if (!entry || (previous && entry.value <= previous.value)) continue
        // Une première fois n'est pas un record : il faut battre une série déjà faite.
        if (previous && workout.date >= from) {
          latest.set(`${exerciseId}|${kind}`, { hit: { exerciseId, kind, entry, previous }, order })
        }
        current[kind] = entry
      }
      held.set(exerciseId, current)
    }
  })
  // Tri stable : dans une même séance, les records restent dans l'ordre des exercices.
  return [...latest.values()].sort((a, b) => b.order - a.order).map(({ hit }) => hit)
}
