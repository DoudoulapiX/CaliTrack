import type { Exercise, ProgramSlot, ProgressionChange, SlotTarget } from '@/db/types'
import { formatDuration } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { formatWeight, type WeightUnit } from '@/lib/units'

/** « 5 à 8 rép. », « 10 rép. », « 20 à 40 s », « 1 min à 1 min 30 s ». */
export function formatTarget(target: SlotTarget): string {
  const { min, max } = target
  if (target.kind === 'reps') return min === max ? `${max} rép.` : `${min} à ${max} rép.`
  if (max < 60) return min === max ? `${max} s` : `${min} à ${max} s`
  return min === max ? formatDuration(max) : `${formatDuration(min)} à ${formatDuration(max)}`
}

/** « 3 × 5 à 8 rép. par côté · 10 kg » ; une seule série : « 60 s ». */
export function formatPrescription(
  slot: Pick<ProgramSlot, 'sets' | 'target' | 'loadKg'>,
  exercise: Pick<Exercise, 'unilateral'> | undefined,
  unit: WeightUnit,
): string {
  const side = exercise?.unilateral ? ' par côté' : ''
  const base = slot.sets > 1 ? `${slot.sets} × ${formatTarget(slot.target)}` : formatTarget(slot.target)
  const load = slot.loadKg !== null ? ` · ${formatWeight(slot.loadKg, unit)}` : ''
  return `${base}${side}${load}`
}

/** « repos 1 min 30 s », ou vide sans repos. */
export function formatRest(restSec: number): string {
  return restSec > 0 ? `repos ${formatDuration(restSec)}` : ''
}

/** Termine une phrase par un point, sans doubler celui d'une abréviation (« rép. »). */
function sentence(text: string): string {
  return text.endsWith('.') ? text : `${text}.`
}

/** Ce qui change pour la prochaine fois, en une phrase. */
export function describeChange(
  change: ProgressionChange,
  nameOf: (exerciseId: string) => string,
  unit: WeightUnit,
): string {
  const to = nameOf(change.toExerciseId)
  const target = formatTarget(change.toTarget)
  const load = change.toLoadKg === null ? null : formatWeight(change.toLoadKg, unit)
  const goal = load ? `${target}, ${load}` : target
  const text: Record<ProgressionChange['kind'], string> = {
    levelUp: `Objectif atteint : la prochaine fois, ${to} (${goal})`,
    moreLoad:
      change.fromLoadKg === null
        ? `Objectif atteint : la prochaine fois, avec ${load ?? ''} de lest`
        : `Objectif atteint : la prochaine fois, ${load ?? ''}`,
    moreReps: `Objectif atteint : la prochaine fois, ${target}`,
    keep: 'Objectif atteint : c’est le plus dur prévu ici. Garde ce niveau ou choisis une variante plus dure',
    levelDown: `Deux séances difficiles : retour à ${to} (${goal}) pour consolider`,
    lessLoad:
      load === null
        ? 'Deux séances difficiles : sans lest la prochaine fois, pour consolider'
        : `Deux séances difficiles : ${load} la prochaine fois, pour consolider`,
    lessReps: `Deux séances difficiles : nouvel objectif, ${target}`,
  }
  return frenchSpacing(sentence(text[change.kind]))
}
