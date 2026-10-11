import { formatGoalValue } from '@/content/goals/create'
import type { GoalProgress, StepProgress } from '@/content/goals/progress'
import type { Goal, GoalKind, GoalMilestone } from '@/db/types'
import { capitalize, diffDays, formatDay, relativeDayLabel, type ISODate } from '@/lib/dates'
import { frenchSpacing, lowerFirst } from '@/lib/typography'
import { formatBodyWeight, kgToUnit, type WeightUnit } from '@/lib/units'

export const GOAL_KIND_LABEL: Record<GoalKind, string> = {
  skill: 'Figure',
  exercise: 'Exercice',
  bodyweight: 'Poids',
  climbing: 'Escalade',
  custom: 'Objectif libre',
}

/** Poids affiché dans l'unité choisie, au dixième. */
export function weightInUnit(kg: number, unit: WeightUnit): number {
  return Math.round(kgToUnit(kg, unit) * 10) / 10
}

export function goalPath(id: string): string {
  return `/goals/${id}`
}

/**
 * Pourcentage arrondi à l'unité inférieure, sans les erreurs d'arrondi des nombres décimaux : de 75 à
 * 72 kg, à 73,2 kg, on est à 60 % (et pas 59 %, car 75 − 73,2 donne 1,7999…).
 */
export function floorPercent(ratio: number): number {
  return Math.floor(ratio * 100 + 1e-6)
}

/** Pourcentage affiché : 100 seulement une fois l'objectif atteint. */
export function percentOf(progress: Pick<GoalProgress, 'ratio' | 'achieved'>): number {
  return progress.achieved ? 100 : Math.min(99, floorPercent(progress.ratio))
}

/** « 37 % ». */
export function percentLabel(progress: Pick<GoalProgress, 'ratio' | 'achieved'>): string {
  return `${String(percentOf(progress))}\u00a0%`
}

/** « 12 octobre », avec l'année quand ce n'est pas celle d'aujourd'hui. */
export function shortDate(date: ISODate, today: ISODate): string {
  return formatDay(date, date.slice(0, 4) === today.slice(0, 4) ? 'd MMMM' : 'd MMMM yyyy')
}

/** « Aujourd’hui », « Hier », « Samedi 10 octobre », « 12 mars 2025 » (pesées, séances passées). */
export function dayLabel(date: ISODate, today: ISODate): string {
  if (date.slice(0, 4) !== today.slice(0, 4)) return formatDay(date, 'd MMMM yyyy')
  return capitalize(relativeDayLabel(date, today))
}

/** Ce que vise une étape : « 8 rép. », « 15 s » (rien pour une étape sans exercice). */
export function stepTarget(milestone: GoalMilestone, unit: WeightUnit): string | null {
  const criterion = milestone.criterion
  return criterion ? formatGoalValue(criterion.value, criterion.kind, unit) : null
}

/** Nom d'une étape : celui de son exercice, ou le nom enregistré si l'exercice a disparu. */
export function stepName(milestone: GoalMilestone, exerciseName: (id: string) => string | undefined): string {
  const id = milestone.criterion?.exerciseId
  return (id === undefined ? undefined : exerciseName(id)) ?? milestone.title
}

export interface LineOptions {
  exerciseName: (id: string) => string | undefined
  unit: WeightUnit
  today: ISODate
}

/** Où en est un objectif, en une ligne. */
export function progressLine(progress: GoalProgress, { exerciseName, unit, today }: LineOptions): string {
  if (progress.achieved) {
    return progress.achievedOn ? `Atteint le ${shortDate(progress.achievedOn, today)}` : 'Atteint'
  }
  switch (progress.kind) {
    case 'skill': {
      const current = progress.current
      if (!current) return 'Aucune étape'
      const position = `Étape ${String(progress.doneCount + 1)} sur ${String(progress.steps.length)}`
      return frenchSpacing(`${position} : ${stepName(current.milestone, exerciseName)}`)
    }
    case 'exercise': {
      if (progress.metric === null || progress.target === null) return 'Objectif incomplet'
      const target = formatGoalValue(progress.target, progress.metric, unit)
      return progress.best
        ? frenchSpacing(
            `Record : ${formatGoalValue(progress.best.value, progress.metric, unit)} · objectif ${target}`,
          )
        : `Pas encore fait · objectif ${target}`
    }
    case 'bodyweight': {
      if (progress.target === null) return 'Objectif incomplet'
      const target = formatBodyWeight(progress.target, unit)
      return progress.current
        ? `${formatBodyWeight(progress.current.kg, unit)} · objectif ${target}`
        : `Note ton poids · objectif ${target}`
    }
    case 'climbing': {
      if (!progress.grade || progress.target === null) return 'Niveau introuvable'
      return `${String(progress.count)} sur ${String(progress.target)} · ${lowerFirst(progress.grade.label)} ou plus dur`
    }
    case 'custom':
      return 'Avancement noté à la main'
  }
}

/** Ce qui reste à faire, en une phrase (écran d'un objectif). */
export function remainingLine(progress: GoalProgress, unit: WeightUnit): string | null {
  if (progress.achieved) return null
  switch (progress.kind) {
    case 'exercise': {
      if (progress.metric === null || progress.target === null) return null
      const missing = progress.target - (progress.best?.value ?? 0)
      return `Encore ${formatGoalValue(missing, progress.metric, unit)}`
    }
    case 'bodyweight': {
      if (progress.target === null || !progress.current) return null
      const delta = progress.current.kg - progress.target
      return `Encore ${formatBodyWeight(Math.abs(delta), unit)} à ${delta > 0 ? 'perdre' : 'prendre'}`
    }
    case 'climbing': {
      if (progress.target === null || !progress.grade) return null
      const missing = progress.target - progress.count
      return `Encore ${String(missing)} bloc${missing > 1 ? 's' : ''}`
    }
    case 'skill': {
      const left = progress.steps.length - progress.doneCount
      return left > 0 ? `Encore ${String(left)} étape${left > 1 ? 's' : ''}` : null
    }
    case 'custom':
      return null
  }
}

/** « Échéance le 31 décembre · dans 81 jours », « Échéance passée depuis 3 jours ». */
export function deadlineLine(deadline: ISODate, today: ISODate): { text: string; late: boolean } {
  const days = diffDays(deadline, today)
  if (days < 0) {
    return {
      text: days === -1 ? 'Échéance passée depuis hier' : `Échéance passée depuis ${String(-days)} jours`,
      late: true,
    }
  }
  if (days === 0) return { text: 'Échéance aujourd’hui', late: false }
  if (days === 1) return { text: 'Échéance demain', late: false }
  return { text: `Échéance le ${shortDate(deadline, today)} · dans ${String(days)} jours`, late: false }
}

/** Comment une étape franchie l'a été : « Réussie le 5 octobre », « D'après ton test de niveau »… */
export function stepReachedLine(step: StepProgress, today: ISODate): string | null {
  if (step.status !== 'done') return null
  const day = step.reachedOn ? shortDate(step.reachedOn, today) : null
  switch (step.reachedBy) {
    case 'workout':
      return day ? `Réussie le ${day}` : 'Réussie'
    case 'test':
      return 'D’après ton test de niveau'
    case 'manual':
      return day ? `Cochée le ${day}` : 'Cochée à la main'
    case 'later':
      return 'Validée par une étape plus dure'
    case null:
      return null
  }
}

interface Sorted {
  goal: Goal
  progress: GoalProgress
}

/**
 * Objectifs en cours (épinglés d'abord, puis par échéance, puis du plus ancien au plus récent, puis
 * par nom), atteints (le plus récent d'abord) et archivés.
 */
export function sortGoals<T extends Sorted>(
  entries: readonly T[],
): { active: T[]; achieved: T[]; archived: T[] } {
  const active = entries
    .filter((e) => !e.goal.archived && !e.progress.achieved)
    .sort(
      (a, b) =>
        Number(b.goal.pinned) - Number(a.goal.pinned) ||
        (a.goal.deadline ?? '9999').localeCompare(b.goal.deadline ?? '9999') ||
        a.goal.createdAt.localeCompare(b.goal.createdAt) ||
        a.goal.title.localeCompare(b.goal.title, 'fr'),
    )
  const achieved = entries
    .filter((e) => !e.goal.archived && e.progress.achieved)
    .sort((a, b) => (b.progress.achievedOn ?? '').localeCompare(a.progress.achievedOn ?? ''))
  const archived = entries
    .filter((e) => e.goal.archived)
    .sort((a, b) => b.goal.updatedAt.localeCompare(a.goal.updatedAt))
  return { active, achieved, archived }
}
