import type { ExerciseMeasure, WorkoutExercise, WorkoutSet } from '@/db/types'
import { formatDuration } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { formatNumber, formatWeight, type WeightUnit } from '@/lib/units'
import type { RecordEntry, RecordHit, RecordKind } from './records'
import { setValue } from './workout'

/** « 8 rép. », « 45 s », « 8 rép. · 10 kg ». */
export function formatSetResult(set: WorkoutSet, measure: ExerciseMeasure, unit: WeightUnit): string {
  const value = setValue(set, measure)
  const main = value === null ? '—' : measure === 'time' ? formatDuration(value) : `${String(value)} rép.`
  return set.loadKg !== null ? `${main} · ${formatWeight(set.loadKg, unit)}` : main
}

/** Séries faites d'un exercice en une ligne : « 8, 8, 7 rép. · 10 kg », « 30, 30 s », « Pas fait ». */
export function formatDoneSets(
  exercise: WorkoutExercise,
  measure: ExerciseMeasure,
  unit: WeightUnit,
): string {
  const done = exercise.sets.filter((s) => s.done)
  const values = done.map((s) => setValue(s, measure)).filter((v): v is number => v !== null)
  if (values.length === 0) return 'Pas fait'
  // Secondes seules (« 30, 25 s ») tant qu'aucune série ne dépasse la minute.
  const short = measure === 'reps' || values.every((v) => v < 60)
  const list = values.map((v) => (short ? String(v) : formatDuration(v))).join(', ')
  const suffix = !short ? '' : measure === 'time' ? ' s' : ' rép.'
  const loads = [...new Set(done.map((s) => s.loadKg))]
  const load =
    loads.length === 1 && loads[0] !== null && loads[0] !== undefined
      ? ` · ${formatWeight(loads[0], unit)}`
      : loads.some((l) => l !== null)
        ? ' · chargé'
        : ''
  return `${list}${suffix}${load}`
}

export const RECORD_LABEL: Record<RecordKind, string> = {
  reps: 'Plus de répétitions',
  hold: 'Maintien le plus long',
  load: 'Charge la plus lourde',
}

/** « 12 rép. », « 1 min 5 s », « 20 kg × 5 ». */
export function formatRecord(kind: RecordKind, entry: RecordEntry, unit: WeightUnit): string {
  if (kind === 'reps') {
    const load = entry.loadKg !== null ? ` · ${formatWeight(entry.loadKg, unit)}` : ''
    return `${formatNumber(entry.value)} rép.${load}`
  }
  if (kind === 'hold') return formatDuration(entry.value)
  const detail =
    entry.reps !== null
      ? ` × ${String(entry.reps)}`
      : entry.durationSec !== null
        ? ` · ${formatDuration(entry.durationSec)}`
        : ''
  return `${formatWeight(entry.value, unit)}${detail}`
}

/** « Plus de répétitions : 12 rép. (avant : 10 rép.) ». */
export function formatRecordHit(hit: RecordHit, unit: WeightUnit): string {
  const now = formatRecord(hit.kind, hit.entry, unit)
  const before = formatRecord(hit.kind, hit.previous, unit)
  return frenchSpacing(`${RECORD_LABEL[hit.kind]} : ${now} (avant : ${before})`)
}
