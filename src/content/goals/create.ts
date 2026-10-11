import { bouldersOf } from '@/content/climbing/labels'
import { PROFILE_LIMITS } from '@/content/profile'
import type { Skill } from '@/content/skills'
import type { Goal, GoalKind, Grade } from '@/db/types'
import { formatDuration, type ISODate } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { formatBodyWeight, formatNumber, formatWeight, type WeightUnit } from '@/lib/units'
import type { GoalMetric } from './progress'

/** Ce qui se règle pour tout objectif. */
export interface GoalBasics {
  /** Vide : le titre proposé pour ce genre d'objectif. */
  title: string
  deadline: ISODate | null
  /** Affiché sur l'écran d'accueil. */
  pinned: boolean
}

export const GOAL_TITLE_MAX = 80
/** Plus grand nombre de blocs que l'on peut viser. */
export const MAX_CLIMB_COUNT = 100

function emptyGoal(
  kind: GoalKind,
  title: string,
  basics: GoalBasics,
  now: string,
  newId: () => string,
): Goal {
  return {
    id: newId(),
    kind,
    title: basics.title.trim() || title,
    pinned: basics.pinned,
    archived: false,
    achievedAt: null,
    deadline: basics.deadline,
    skillId: null,
    milestones: [],
    exerciseId: null,
    metric: null,
    startValue: null,
    targetValue: null,
    scaleId: null,
    gradeKey: null,
    targetCount: null,
    manualProgress: 0,
    createdAt: now,
    updatedAt: now,
  }
}

/** Une figure : ses étapes deviennent les étapes de l'objectif (modifiables ensuite). */
export function skillGoal(
  skill: Skill,
  basics: GoalBasics,
  exerciseName: (id: string) => string,
  now: string,
  newId: () => string,
): Goal {
  return {
    ...emptyGoal('skill', skill.name, basics, now, newId),
    skillId: skill.id,
    milestones: skill.steps.map((step) => ({
      id: newId(),
      title: exerciseName(step.exerciseId),
      criterion: { kind: step.target.kind, exerciseId: step.exerciseId, value: step.target.value },
      achievedAt: null,
    })),
  }
}

/** « 12 rép. », « 1 min 30 s », « 20 kg ». */
export function formatGoalValue(value: number, metric: GoalMetric, unit: WeightUnit): string {
  if (metric === 'reps') return `${formatNumber(value)} rép.`
  if (metric === 'time') return formatDuration(value)
  return formatWeight(value, unit)
}

export function exerciseGoalTitle(
  name: string,
  metric: GoalMetric,
  target: number,
  unit: WeightUnit,
): string {
  return frenchSpacing(`${name} : ${formatGoalValue(target, metric, unit)}`)
}

/** Un exercice : plus de répétitions, un maintien plus long ou une charge plus lourde que `start`. */
export function exerciseGoal(
  args: {
    exerciseId: string
    name: string
    metric: GoalMetric
    start: number
    target: number
    unit: WeightUnit
  },
  basics: GoalBasics,
  now: string,
  newId: () => string,
): Goal {
  return {
    ...emptyGoal(
      'exercise',
      exerciseGoalTitle(args.name, args.metric, args.target, args.unit),
      basics,
      now,
      newId,
    ),
    exerciseId: args.exerciseId,
    metric: args.metric,
    startValue: args.start,
    targetValue: args.target,
  }
}

export function bodyweightGoalTitle(targetKg: number, unit: WeightUnit): string {
  return `Peser ${formatBodyWeight(targetKg, unit)}`
}

/** Son poids : en perdre ou en prendre, de `startKg` à `targetKg`. */
export function bodyweightGoal(
  args: { startKg: number; targetKg: number; unit: WeightUnit },
  basics: GoalBasics,
  now: string,
  newId: () => string,
): Goal {
  return {
    ...emptyGoal('bodyweight', bodyweightGoalTitle(args.targetKg, args.unit), basics, now, newId),
    startValue: args.startKg,
    targetValue: args.targetKg,
  }
}

/** « 1 bloc noir », « 5 blocs bleus », « 3 blocs en 6A ». */
export function climbingGoalTitle(count: number, grade: Pick<Grade, 'label'>): string {
  return bouldersOf(count, grade)
}

/** L'escalade : réussir `count` blocs du niveau choisi ou plus durs. */
export function climbingGoal(
  args: { scaleId: string; grade: Grade; count: number },
  basics: GoalBasics,
  now: string,
  newId: () => string,
): Goal {
  return {
    ...emptyGoal('climbing', climbingGoalTitle(args.count, args.grade), basics, now, newId),
    scaleId: args.scaleId,
    gradeKey: args.grade.key,
    targetCount: args.count,
  }
}

/** Noms à retrouver pour écrire le titre proposé d'un objectif. */
export interface TitleNames {
  exercise: (id: string) => string | undefined
  grade: (key: string) => Pick<Grade, 'label'> | undefined
}

/** Titre proposé d'après ce que vise l'objectif (null pour une figure, un objectif libre ou s'il manque une donnée). */
export function suggestedGoalTitle(goal: Goal, names: TitleNames, unit: WeightUnit): string | null {
  switch (goal.kind) {
    case 'exercise': {
      const name = goal.exerciseId === null ? undefined : names.exercise(goal.exerciseId)
      if (name === undefined || goal.metric === null || goal.targetValue === null) return null
      return exerciseGoalTitle(name, goal.metric, goal.targetValue, unit)
    }
    case 'bodyweight':
      return goal.targetValue === null ? null : bodyweightGoalTitle(goal.targetValue, unit)
    case 'climbing': {
      const grade = goal.gradeKey === null ? undefined : names.grade(goal.gradeKey)
      return grade === undefined || goal.targetCount === null
        ? null
        : climbingGoalTitle(goal.targetCount, grade)
    }
    case 'skill':
    case 'custom':
      return null
  }
}

/** Après une modification : un titre resté celui proposé suit la nouvelle cible (« Tractions : 15 rép. »). */
export function withSuggestedTitle(before: Goal, after: Goal, names: TitleNames, unit: WeightUnit): Goal {
  const was = suggestedGoalTitle(before, names, unit)
  if (was === null || before.title !== was || after.title !== before.title) return after
  return { ...after, title: suggestedGoalTitle(after, names, unit) ?? after.title }
}

/** Un objectif libre, dont on note l'avancement à la main. */
export function customGoal(basics: GoalBasics, now: string, newId: () => string): Goal {
  return emptyGoal('custom', '', basics, now, newId)
}

/* ------------------------------------------------------------------ */
/* Vérifications                                                       */
/* ------------------------------------------------------------------ */

/** L'échéance ne peut pas être déjà passée (sauf si on la garde telle quelle en modifiant l'objectif). */
export function deadlineError(deadline: ISODate | null, today: ISODate, unchanged = false): string | null {
  if (deadline === null || unchanged) return null
  return deadline < today ? 'L’échéance ne peut pas être déjà passée.' : null
}

export function exerciseGoalError(args: {
  exerciseId: string | null
  target: number | null
  start: number
  metric: GoalMetric
  unit: WeightUnit
}): string | null {
  if (args.exerciseId === null) return 'Choisis un exercice.'
  if (args.target === null || args.target <= 0) return 'Indique ce que tu vises.'
  if (args.target <= args.start) {
    return frenchSpacing(
      `Ton record est déjà de ${formatGoalValue(args.start, args.metric, args.unit)} : vise plus haut.`,
    )
  }
  return null
}

export function bodyweightGoalError(
  currentKg: number | null,
  targetKg: number | null,
  unit: WeightUnit,
): string | null {
  const { min, max } = PROFILE_LIMITS.weightKg
  if (currentKg === null) return 'Indique ton poids actuel.'
  if (targetKg === null) return 'Indique le poids que tu vises.'
  // Petite marge : une saisie en livres arrondie peut tomber juste à côté des bornes.
  const outside = (kg: number) => kg < min - 0.5 || kg > max + 0.5
  if (outside(currentKg) || outside(targetKg)) {
    return `Le poids doit être entre ${formatBodyWeight(min, unit)} et ${formatBodyWeight(max, unit)}.`
  }
  if (Math.abs(currentKg - targetKg) < 0.05) return 'Le poids visé doit être différent de ton poids actuel.'
  return null
}

/** `done` : blocs déjà réussis à ce niveau ou plus dur (un nouvel objectif doit viser plus). */
export function climbingGoalError(gradeKey: string | null, count: number, done = 0): string | null {
  if (gradeKey === null) return 'Choisis un niveau.'
  if (!Number.isInteger(count) || count < 1 || count > MAX_CLIMB_COUNT) {
    return `Le nombre de blocs doit être entre 1 et ${String(MAX_CLIMB_COUNT)}.`
  }
  if (count <= done) {
    const blocks = `${String(done)} bloc${done > 1 ? 's' : ''}`
    return frenchSpacing(`Tu as déjà réussi ${blocks} à ce niveau ou plus dur : vise plus haut.`)
  }
  return null
}

export function customGoalError(title: string): string | null {
  return title.trim() === '' ? 'Donne un nom à ton objectif.' : null
}
