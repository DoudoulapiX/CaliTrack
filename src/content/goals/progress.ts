import { gradeIndex } from '@/content/grades'
import { LEVEL_TEST_ITEMS } from '@/content/level-test'
import type {
  BlockKind,
  BodyMetric,
  ClimbingSession,
  Goal,
  GoalMilestone,
  Grade,
  GradeScale,
  LevelTest,
  Workout,
  WorkoutSet,
} from '@/db/types'
import { localDateOf, type ISODate } from '@/lib/dates'

/*
 * Avancement des objectifs, recalculé à partir des données : séances terminées, test de niveau,
 * pesées et blocs d'escalade. Rien n'est recopié dans l'objectif, sauf ce qui est coché à la main.
 */

export type GoalMetric = 'reps' | 'time' | 'load'

const METRICS: readonly GoalMetric[] = ['reps', 'time', 'load']

/** La meilleure série d'une séance sur un exercice (ou le résultat du test de niveau). */
export interface Performance {
  date: ISODate
  value: number
  /** Séance d'où elle vient ; null pour le test de niveau. */
  workoutId: string | null
}

/** Performances par exercice et par mesure, dans l'ordre chronologique. */
export type PerformanceIndex = ReadonlyMap<string, readonly Performance[]>

/** Une pesée. */
export interface WeightEntry {
  date: ISODate
  kg: number
}

export interface GoalContext {
  performances: PerformanceIndex
  /** Pesées, de la plus ancienne à la plus récente. */
  weights: readonly WeightEntry[]
  /** Poids du profil, pris comme poids actuel tant qu'aucune pesée n'est notée. */
  profileWeightKg: number | null
  climbs: readonly ClimbingSession[]
  scales: ReadonlyMap<string, GradeScale>
}

function indexKey(exerciseId: string, metric: GoalMetric): string {
  return `${exerciseId}|${metric}`
}

/** L'échauffement et les étirements ne comptent pas, comme pour les records. */
const IGNORED_BLOCKS: readonly (BlockKind | null)[] = ['warmup', 'cooldown']

function setValue(set: WorkoutSet, metric: GoalMetric): number | null {
  const value = metric === 'reps' ? set.reps : metric === 'time' ? set.durationSec : set.loadKg
  return value !== null && value > 0 ? value : null
}

function byTime(a: Pick<Workout, 'date' | 'startedAt'>, b: Pick<Workout, 'date' | 'startedAt'>): number {
  return a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt)
}

/**
 * Meilleures séries de chaque séance terminée, par exercice et par mesure. Une série faite avec une
 * aide (élastique…) ne compte pas : l'objectif se réussit sans aide. Le test de niveau compte comme
 * une performance du jour où il a été fait.
 */
export function buildPerformanceIndex(
  workouts: readonly Workout[],
  levelTest: LevelTest | null,
): PerformanceIndex {
  const index = new Map<string, Performance[]>()
  const add = (key: string, performance: Performance) => {
    const list = index.get(key)
    if (list) list.push(performance)
    else index.set(key, [performance])
  }
  if (levelTest) {
    for (const item of LEVEL_TEST_ITEMS) {
      const value = levelTest[item.key]
      if (value === null || value <= 0) continue
      add(indexKey(item.exerciseId, item.unit === 'sec' ? 'time' : 'reps'), {
        date: levelTest.date,
        value,
        workoutId: null,
      })
    }
  }
  const done = workouts.filter((w) => w.status === 'done').sort(byTime)
  for (const workout of done) {
    const best = new Map<string, number>()
    for (const exercise of workout.exercises) {
      if (IGNORED_BLOCKS.includes(exercise.block)) continue
      for (const set of exercise.sets) {
        if (!set.done || set.assistance !== null) continue
        for (const metric of METRICS) {
          const value = setValue(set, metric)
          const key = indexKey(exercise.exerciseId, metric)
          if (value !== null && value > (best.get(key) ?? 0)) best.set(key, value)
        }
      }
    }
    for (const [key, value] of best) add(key, { date: workout.date, value, workoutId: workout.id })
  }
  // Le test passe avant les séances du même jour (tri stable).
  for (const list of index.values()) list.sort((a, b) => a.date.localeCompare(b.date))
  return index
}

/** Performances sur un exercice, de la plus ancienne à la plus récente. */
export function performancesOf(
  index: PerformanceIndex,
  exerciseId: string,
  metric: GoalMetric,
): readonly Performance[] {
  return index.get(indexKey(exerciseId, metric)) ?? []
}

/** Meilleure performance (à égalité, la première). */
export function bestPerformance(
  index: PerformanceIndex,
  exerciseId: string,
  metric: GoalMetric,
): Performance | null {
  let best: Performance | null = null
  for (const performance of index.get(indexKey(exerciseId, metric)) ?? []) {
    if (!best || performance.value > best.value) best = performance
  }
  return best
}

/** Première performance qui atteint une valeur. */
export function firstReached(
  index: PerformanceIndex,
  exerciseId: string,
  metric: GoalMetric,
  value: number,
): Performance | null {
  return (index.get(indexKey(exerciseId, metric)) ?? []).find((p) => p.value >= value) ?? null
}

/** Pesées notées, dans l'ordre (les mesures sans poids sont laissées de côté). */
export function weightEntries(metrics: readonly BodyMetric[]): WeightEntry[] {
  return metrics
    .filter((m): m is BodyMetric & { weightKg: number } => m.weightKg !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ date: m.date, kg: m.weightKg }))
}

export function buildGoalContext(sources: {
  workouts: readonly Workout[]
  levelTest: LevelTest | null
  metrics: readonly BodyMetric[]
  profileWeightKg: number | null
  climbs: readonly ClimbingSession[]
  scales: readonly GradeScale[]
}): GoalContext {
  return {
    performances: buildPerformanceIndex(sources.workouts, sources.levelTest),
    weights: weightEntries(sources.metrics),
    profileWeightKg: sources.profileWeightKg,
    climbs: sources.climbs,
    scales: new Map(sources.scales.map((scale) => [scale.id, scale])),
  }
}

/* ------------------------------------------------------------------ */
/* Avancement                                                          */
/* ------------------------------------------------------------------ */

export type StepStatus = 'done' | 'current' | 'todo'

/** Comment une étape a été franchie : en séance, au test de niveau, cochée à la main, ou parce qu'une étape plus dure l'a été. */
export type StepReachedBy = 'workout' | 'test' | 'manual' | 'later'

export interface StepProgress {
  milestone: GoalMilestone
  status: StepStatus
  /** Meilleure performance sur l'exercice de l'étape (null : jamais faite, ou étape sans exercice). */
  best: Performance | null
  reachedBy: StepReachedBy | null
  reachedOn: ISODate | null
  /** Avancement dans l'étape, de 0 à 1. */
  ratio: number
}

interface BaseProgress {
  /** De 0 à 1. */
  ratio: number
  achieved: boolean
  achievedOn: ISODate | null
}

export interface SkillProgress extends BaseProgress {
  kind: 'skill'
  steps: StepProgress[]
  /** L'étape à travailler (null : toutes franchies). */
  current: StepProgress | null
  doneCount: number
}

export interface ExerciseProgress extends BaseProgress {
  kind: 'exercise'
  metric: GoalMetric | null
  best: Performance | null
  start: number
  target: number | null
}

export interface BodyweightProgress extends BaseProgress {
  kind: 'bodyweight'
  /** Dernier poids connu (null : ni pesée ni poids dans le profil). */
  current: { kg: number; date: ISODate | null } | null
  start: number | null
  target: number | null
}

export interface ClimbingProgress extends BaseProgress {
  kind: 'climbing'
  /** Blocs réussis à ce niveau ou plus dur. */
  count: number
  target: number | null
  scale: GradeScale | null
  grade: Grade | null
}

export interface CustomProgress extends BaseProgress {
  kind: 'custom'
}

export type GoalProgress =
  SkillProgress | ExerciseProgress | BodyweightProgress | ClimbingProgress | CustomProgress

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function manualDate(timestamp: string | null): ISODate | null {
  return timestamp === null ? null : localDateOf(timestamp)
}

/**
 * Étapes d'une figure. Une étape franchie valide aussi celles d'avant (qui réussit un muscle-up
 * n'a plus besoin de prouver ses tractions) ; l'étape suivante avance avec le record sur son exercice.
 */
function skillProgress(goal: Goal, ctx: GoalContext): SkillProgress {
  const direct = goal.milestones.map((milestone) => {
    const criterion = milestone.criterion
    const best = criterion ? bestPerformance(ctx.performances, criterion.exerciseId, criterion.kind) : null
    const reached = criterion
      ? firstReached(ctx.performances, criterion.exerciseId, criterion.kind, criterion.value)
      : null
    if (reached) {
      return {
        best,
        reachedBy: (reached.workoutId === null ? 'test' : 'workout') as StepReachedBy,
        reachedOn: reached.date,
      }
    }
    if (milestone.achievedAt !== null) {
      return { best, reachedBy: 'manual' as StepReachedBy, reachedOn: manualDate(milestone.achievedAt) }
    }
    return { best, reachedBy: null, reachedOn: null }
  })
  const last = direct.findLastIndex((step) => step.reachedBy !== null)

  const steps: StepProgress[] = goal.milestones.map((milestone, i) => {
    const step = direct[i] ?? { best: null, reachedBy: null, reachedOn: null }
    if (i <= last) {
      return {
        milestone,
        status: 'done',
        best: step.best,
        reachedBy: step.reachedBy ?? 'later',
        reachedOn: step.reachedOn,
        ratio: 1,
      }
    }
    const criterion = milestone.criterion
    const ratio =
      i === last + 1 && criterion && step.best ? Math.min(0.99, step.best.value / criterion.value) : 0
    return {
      milestone,
      status: i === last + 1 ? 'current' : 'todo',
      best: step.best,
      reachedBy: null,
      reachedOn: null,
      ratio,
    }
  })

  const total = steps.length
  const current = steps[last + 1] ?? null
  const achieved = total > 0 && last === total - 1
  return {
    kind: 'skill',
    steps,
    current,
    doneCount: last + 1,
    ratio: total === 0 ? 0 : clamp01((last + 1 + (current?.ratio ?? 0)) / total),
    achieved,
    achievedOn: achieved ? (steps[total - 1]?.reachedOn ?? null) : null,
  }
}

function exerciseProgress(goal: Goal, ctx: GoalContext): ExerciseProgress {
  const { exerciseId, metric, targetValue: target } = goal
  const start = goal.startValue ?? 0
  const best = exerciseId && metric ? bestPerformance(ctx.performances, exerciseId, metric) : null
  if (!exerciseId || !metric || target === null) {
    return { kind: 'exercise', metric, best, start, target, ratio: 0, achieved: false, achievedOn: null }
  }
  const value = best?.value ?? null
  const achieved = value !== null && value >= target
  const ratio =
    value === null ? 0 : target > start ? clamp01((value - start) / (target - start)) : achieved ? 1 : 0
  return {
    kind: 'exercise',
    metric,
    best,
    start,
    target,
    ratio,
    achieved,
    achievedOn: achieved ? (firstReached(ctx.performances, exerciseId, metric, target)?.date ?? null) : null,
  }
}

/**
 * Poids : on compare le dernier poids connu à l'objectif, que ce soit pour en perdre ou en prendre.
 * Atteint tant que la dernière pesée est du bon côté de l'objectif, depuis la première pesée d'une
 * suite qui l'est restée.
 */
function bodyweightProgress(goal: Goal, ctx: GoalContext): BodyweightProgress {
  const start = goal.startValue
  const target = goal.targetValue
  const latest = ctx.weights.at(-1)
  const current = latest
    ? { kg: latest.kg, date: latest.date as ISODate | null }
    : ctx.profileWeightKg !== null
      ? { kg: ctx.profileWeightKg, date: null }
      : null
  if (start === null || target === null) {
    return { kind: 'bodyweight', current, start, target, ratio: 0, achieved: false, achievedOn: null }
  }
  const losing = target < start
  const reached = (kg: number) => (losing ? kg <= target : kg >= target)
  const achieved = current !== null && reached(current.kg)
  const ratio =
    current === null
      ? 0
      : start === target
        ? achieved
          ? 1
          : 0
        : clamp01((start - current.kg) / (start - target))
  let since: ISODate | null = null
  const created = localDateOf(goal.createdAt)
  for (const entry of ctx.weights) {
    if (entry.date < created) continue
    since = reached(entry.kg) ? (since ?? entry.date) : null
  }
  return { kind: 'bodyweight', current, start, target, ratio, achieved, achievedOn: achieved ? since : null }
}

/** Escalade : blocs réussis (à vue ou après essais) au niveau visé ou plus dur, dans la même échelle. */
function climbingProgress(goal: Goal, ctx: GoalContext): ClimbingProgress {
  const scale = goal.scaleId ? (ctx.scales.get(goal.scaleId) ?? null) : null
  const min = scale && goal.gradeKey ? gradeIndex(scale, goal.gradeKey) : -1
  const grade = scale && min >= 0 ? (scale.grades[min] ?? null) : null
  const target = goal.targetCount
  if (!scale || !grade || target === null || target <= 0) {
    return { kind: 'climbing', count: 0, target, scale, grade, ratio: 0, achieved: false, achievedOn: null }
  }
  const sessions = ctx.climbs
    .filter((session) => session.scaleId === scale.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
  let count = 0
  let achievedOn: ISODate | null = null
  for (const session of sessions) {
    for (const boulder of session.boulders) {
      const sent = boulder.result === 'flash' || boulder.result === 'sent'
      if (!sent || gradeIndex(scale, boulder.gradeKey) < min) continue
      count++
      if (count === target) achievedOn = session.date
    }
  }
  return {
    kind: 'climbing',
    count,
    target,
    scale,
    grade,
    ratio: clamp01(count / target),
    achieved: count >= target,
    achievedOn,
  }
}

function customProgress(goal: Goal): CustomProgress {
  const achieved = goal.manualProgress >= 100
  return {
    kind: 'custom',
    ratio: clamp01(goal.manualProgress / 100),
    achieved,
    achievedOn: achieved ? manualDate(goal.achievedAt) : null,
  }
}

function computed(goal: Goal, ctx: GoalContext): GoalProgress {
  switch (goal.kind) {
    case 'skill':
      return skillProgress(goal, ctx)
    case 'exercise':
      return exerciseProgress(goal, ctx)
    case 'bodyweight':
      return bodyweightProgress(goal, ctx)
    case 'climbing':
      return climbingProgress(goal, ctx)
    case 'custom':
      return customProgress(goal)
  }
}

/** Avancement d'un objectif ; un objectif marqué « atteint » à la main l'est, quoi que disent les données. */
export function goalProgress(goal: Goal, ctx: GoalContext): GoalProgress {
  const progress = computed(goal, ctx)
  if (progress.achieved || goal.achievedAt === null) return progress
  return { ...progress, ratio: 1, achieved: true, achievedOn: manualDate(goal.achievedAt) }
}

/* ------------------------------------------------------------------ */
/* Ce qu'une séance a fait avancer                                     */
/* ------------------------------------------------------------------ */

export interface GoalAdvance {
  goal: Goal
  before: GoalProgress
  after: GoalProgress
  /** Étapes franchies pendant la séance (objectif « figure »). */
  newSteps: StepProgress[]
}

/**
 * Objectifs (figures et exercices) qu'une séance a fait avancer : on compare l'avancement juste
 * avant elle et juste après. Les séances faites plus tard ne comptent pas, ni un test de niveau
 * passé après elle.
 */
export function goalsAdvancedBy(
  workout: Workout,
  goals: readonly Goal[],
  workouts: readonly Workout[],
  levelTest: LevelTest | null,
): GoalAdvance[] {
  if (workout.status !== 'done') return []
  const earlier = workouts.filter((w) => w.id !== workout.id && w.status === 'done' && byTime(w, workout) < 0)
  const test = levelTest && levelTest.date <= workout.date ? levelTest : null
  const contextOf = (list: readonly Workout[]): GoalContext => ({
    performances: buildPerformanceIndex(list, test),
    weights: [],
    profileWeightKg: null,
    climbs: [],
    scales: new Map(),
  })
  const before = contextOf(earlier)
  const after = contextOf([...earlier, workout])
  const advances: GoalAdvance[] = []
  for (const goal of goals) {
    if (goal.archived || (goal.kind !== 'skill' && goal.kind !== 'exercise')) continue
    const was = goalProgress(goal, before)
    const now = goalProgress(goal, after)
    if (now.ratio <= was.ratio && now.achieved === was.achieved) continue
    const newSteps =
      now.kind === 'skill' && was.kind === 'skill'
        ? now.steps.filter((step, i) => step.status === 'done' && was.steps[i]?.status !== 'done')
        : []
    advances.push({ goal, before: was, after: now, newSteps })
  }
  return advances
}
