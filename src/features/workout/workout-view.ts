import { BLOCK_TITLE } from '@/content/programs/edit'
import { formatTarget } from '@/content/programs/format'
import { formatRecord } from '@/content/workouts/format'
import type { ExerciseRecords, RecordKind } from '@/content/workouts/records'
import { workoutDurationSec, workoutStats } from '@/content/workouts/stats'
import { measureOf, nextPendingSet, suggestedValue, type PendingSet } from '@/content/workouts/workout'
import type { BlockKind, Exercise, ExerciseMeasure, Workout, WorkoutExercise } from '@/db/types'
import { capitalize, formatDuration, formatMonth } from '@/lib/dates'
import { keepTogether } from '@/lib/typography'
import { formatNumber, formatWeight, kgToUnit, unitToKg, type WeightUnit } from '@/lib/units'

/* Textes et regroupements des écrans de séance (séance en cours, bilan, historique, records). */

/** Bloc d'un exercice ajouté pendant la séance, d'après sa catégorie. */
export function blockFor(exercise: Pick<Exercise, 'category'>): BlockKind {
  switch (exercise.category) {
    case 'stretching':
    case 'mobility':
      return 'cooldown'
    case 'cardio':
      return 'conditioning'
    case 'skill':
      return 'skill'
    default:
      return 'strength'
  }
}

export interface ExerciseGroup {
  key: string
  title: string
  exercises: WorkoutExercise[]
}

/** Exercices regroupés par bloc, dans l'ordre de la séance (Échauffement, Renforcement…). */
export function groupByBlock(exercises: readonly WorkoutExercise[]): ExerciseGroup[] {
  const groups: (ExerciseGroup & { block: BlockKind | null })[] = []
  for (const exercise of exercises) {
    const last = groups.at(-1)
    if (last && last.block === exercise.block) {
      last.exercises.push(exercise)
    } else {
      groups.push({
        key: exercise.id,
        block: exercise.block,
        title: exercise.block ? BLOCK_TITLE[exercise.block] : 'Autres exercices',
        exercises: [exercise],
      })
    }
  }
  return groups.map(({ key, title, exercises: list }) => ({ key, title, exercises: list }))
}

/** La série à faire maintenant : la suivante après la dernière validée, sinon la première à faire. */
export function currentSet(workout: Pick<Workout, 'exercises'>): PendingSet | null {
  let last: { exerciseId: string; setId: string; at: string } | null = null
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      if (set.done && set.completedAt && (!last || set.completedAt >= last.at)) {
        last = { exerciseId: exercise.id, setId: set.id, at: set.completedAt }
      }
    }
  }
  return nextPendingSet(workout, last ?? undefined)
}

/** « 8 rép. », « 45 s » : une valeur de série. */
export function formatValue(value: number, measure: ExerciseMeasure): string {
  return measure === 'time' ? formatDuration(value) : `${String(value)} rép.`
}

/** Ce qui vient ensuite, à l'écran et à voix haute. */
export function describePending(
  pending: PendingSet,
  name: string,
  fallback: ExerciseMeasure = 'reps',
): { text: string; spoken: string } {
  const count = pending.exercise.sets.length
  const position = count > 1 ? `série ${String(pending.index + 1)} sur ${String(count)}` : null
  const measure = measureOf(pending.exercise, fallback)
  const value = suggestedValue(pending.exercise, pending.index, measure)
  const text = [name, position, value === null ? null : formatValue(value, measure)]
    .filter(Boolean)
    .join(' · ')
  return { text, spoken: position ? `${name}, ${position}` : name }
}

/** « 3 × 5 à 8 rép. », « 1 série », avec la charge de la première série. */
export function prescriptionOf(exercise: WorkoutExercise, unit: WeightUnit, unilateral = false): string {
  const count = exercise.sets.length
  const sets = count > 1 ? `${String(count)} séries` : '1 série'
  const base = exercise.target
    ? count > 1
      ? `${String(count)} × ${formatTarget(exercise.target)}`
      : formatTarget(exercise.target)
    : sets
  const side = exercise.target && unilateral ? ' par côté' : ''
  const load = exercise.sets[0]?.loadKg ?? null
  return load === null ? `${base}${side}` : `${base}${side} · ${formatWeight(load, unit)}`
}

/** Ancre d'un exercice de la séance, pour y faire défiler l'écran. */
export function exerciseAnchor(workoutExerciseId: string): string {
  return `exercice-${workoutExerciseId}`
}

/** Charge à afficher dans l'unité choisie : au centième en kilos, au dixième en livres. */
export function loadToDisplay(kg: number | null, unit: WeightUnit): number | null {
  if (kg === null) return null
  const digits = unit === 'kg' ? 100 : 10
  return Math.round(kgToUnit(kg, unit) * digits) / digits
}

/** Charge saisie (dans l'unité choisie) vers des kilos au centième ; zéro ou rien : pas de charge. */
export function loadFromDisplay(value: number | null, unit: WeightUnit): number | null {
  if (value === null || value <= 0) return null
  return Math.round(unitToKg(value, unit) * 100) / 100
}

/**
 * Charge saisie, telle qu'elle sera relue après enregistrement (25 lb restent 25 lb). Zéro reste
 * affiché tel quel pendant la frappe (« 0,5 »).
 */
export function typedLoad(value: number | null, unit: WeightUnit): number | null {
  if (value === null || value <= 0) return value
  return loadToDisplay(loadFromDisplay(value, unit), unit)
}

/** Chrono de séance : « 4:05 », « 1:02:03 ». */
export function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${String(h)}:${String(m).padStart(2, '0')}:${sec}` : `${String(m)}:${sec}`
}

/** Durée d'une séance à la minute : « 52 min », « 1 h 05 » (au moins une minute). */
export function formatWorkoutDuration(totalSec: number): string {
  return formatDuration(Math.max(60, Math.round(totalSec / 60) * 60))
}

/** Chiffres d'une séance en tuiles : durée, séries, puis ce qui a été fait. */
export function statItems(
  workout: Pick<Workout, 'exercises'>,
  durationSec: number,
  unit: WeightUnit,
): { label: string; value: string }[] {
  const stats = workoutStats(workout)
  const sets =
    stats.setsDone === stats.setsTotal
      ? String(stats.setsDone)
      : `${String(stats.setsDone)} sur ${String(stats.setsTotal)}`
  const items = [
    { label: 'Durée', value: formatWorkoutDuration(durationSec) },
    { label: 'Séries', value: sets },
  ]
  if (stats.reps > 0) items.push({ label: 'Répétitions', value: formatNumber(stats.reps) })
  if (stats.holdSec > 0) items.push({ label: 'Maintien', value: formatDuration(stats.holdSec) })
  if (stats.volumeKg > 0) items.push({ label: 'Charge soulevée', value: formatWeight(stats.volumeKg, unit) })
  return items
}

/** Ressenti de la séance, du plus facile au plus dur (échelle d'effort sur 10). */
export const RPE_OPTIONS = [
  { value: 4, label: 'Facile' },
  { value: 6, label: 'Correct' },
  { value: 8, label: 'Dur' },
  { value: 10, label: 'À fond' },
] as const

export function rpeLabel(rpe: number | null): string | null {
  if (rpe === null) return null
  let best: (typeof RPE_OPTIONS)[number] = RPE_OPTIONS[0]
  for (const option of RPE_OPTIONS) {
    if (Math.abs(option.value - rpe) < Math.abs(best.value - rpe)) best = option
  }
  return best.label
}

/**
 * « 52 min · 14 séries · Dur » : une séance de l'historique en une ligne (chaque morceau reste sur une
 * même ligne).
 */
export function workoutSubtitle(workout: Workout): string {
  const { setsDone } = workoutStats(workout)
  const feeling = rpeLabel(workout.rpe)
  return [
    keepTogether(formatWorkoutDuration(workoutDurationSec(workout))),
    keepTogether(`${String(setsDone)} série${setsDone > 1 ? 's' : ''}`),
    feeling && keepTogether(feeling),
  ]
    .filter(Boolean)
    .join(' · ')
}

export interface MonthGroup {
  key: string
  title: string
  workouts: Workout[]
}

/** Séances regroupées par mois, dans l'ordre reçu (la plus récente d'abord). */
export function groupByMonth(workouts: readonly Workout[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const workout of workouts) {
    const key = workout.date.slice(0, 7)
    const last = groups.at(-1)
    if (last?.key === key) {
      last.workouts.push(workout)
    } else {
      const [year = 0, month = 1] = key.split('-').map(Number)
      groups.push({ key, title: capitalize(formatMonth(year, month - 1)), workouts: [workout] })
    }
  }
  return groups
}

/** Records d'un exercice, dans l'ordre où on les montre. */
export const RECORD_ORDER: readonly RecordKind[] = ['reps', 'hold', 'load']

/** Les records d'un exercice en une ligne : « 12 rép. · 20 kg × 5 ». */
export function recordsLine(records: ExerciseRecords, unit: WeightUnit): string {
  return RECORD_ORDER.flatMap((kind) => {
    const entry = records[kind]
    if (!entry) return []
    // La charge a son propre record : on ne la répète pas à côté des répétitions.
    return [formatRecord(kind, kind === 'reps' ? { ...entry, loadKg: null } : entry, unit)]
  }).join(' · ')
}
