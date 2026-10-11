import { describe, expect, it } from 'vitest'
import { defaultGradeScales, VERTICAL_ART_SCALE_ID } from '@/content/grades'
import { skillFor } from '@/content/skills'
import type {
  BlockKind,
  BoulderResult,
  ClimbingSession,
  Goal,
  LevelTest,
  Workout,
  WorkoutSet,
} from '@/db/types'
import { sequentialIds } from '@/test/fixtures'
import { bodyweightGoal, climbingGoal, customGoal, exerciseGoal, skillGoal } from './create'
import {
  bestPerformance,
  buildGoalContext,
  buildPerformanceIndex,
  firstReached,
  goalProgress,
  goalsAdvancedBy,
  type GoalContext,
  type SkillProgress,
} from './progress'

const NOW = '2026-10-01T08:00:00.000Z'
const BASICS = { title: '', deadline: null, pinned: true }

interface SetSpec {
  reps?: number
  sec?: number
  kg?: number
  done?: boolean
  assisted?: boolean
}

function set(spec: SetSpec, i: number): WorkoutSet {
  return {
    id: `s${String(i)}`,
    reps: spec.reps ?? null,
    durationSec: spec.sec ?? null,
    loadKg: spec.kg ?? null,
    assistance: spec.assisted ? 'Élastique' : null,
    rpe: null,
    done: spec.done ?? true,
    completedAt: null,
  }
}

/** Une séance terminée ce jour-là, à 18 h (heure de Paris). */
function workout(
  id: string,
  date: string,
  exercises: { id: string; block?: BlockKind | null; sets: SetSpec[] }[],
  status: Workout['status'] = 'done',
): Workout {
  return {
    id,
    date,
    startedAt: `${date}T16:00:00.000Z`,
    endedAt: status === 'done' ? `${date}T17:00:00.000Z` : null,
    title: 'Séance',
    programId: null,
    programSessionId: null,
    plannedFor: null,
    eventId: null,
    exercises: exercises.map((e, i) => ({
      id: `${id}-e${String(i)}`,
      exerciseId: e.id,
      slotId: null,
      block: e.block === undefined ? 'strength' : e.block,
      target: null,
      restSec: 90,
      sets: e.sets.map(set),
      note: '',
    })),
    rpe: null,
    notes: '',
    status,
    deload: false,
    progression: [],
  }
}

function levelTest(patch: Partial<LevelTest>): LevelTest {
  return {
    date: '2026-09-28',
    pushUps: null,
    pullUps: null,
    dips: null,
    squats: null,
    plankSec: null,
    deadHangSec: null,
    ...patch,
  }
}

function context(sources: Partial<Parameters<typeof buildGoalContext>[0]> = {}): GoalContext {
  return buildGoalContext({
    workouts: [],
    levelTest: null,
    metrics: [],
    profileWeightKg: null,
    climbs: [],
    scales: defaultGradeScales(),
    ...sources,
  })
}

function muscleUpGoal(): Goal {
  const skill = skillFor('muscleUp')
  if (!skill) throw new Error('muscleUp')
  return skillGoal(skill, BASICS, (id) => id, NOW, sequentialIds('m'))
}

function skill(goal: Goal, ctx: GoalContext): SkillProgress {
  const progress = goalProgress(goal, ctx)
  if (progress.kind !== 'skill') throw new Error(progress.kind)
  return progress
}

describe('performances', () => {
  it('gardent la meilleure série de chaque séance, sans échauffement, aide ni série non cochée', () => {
    const index = buildPerformanceIndex(
      [
        workout('b', '2026-10-08', [{ id: 'pullup', sets: [{ reps: 7 }, { reps: 9, kg: 5 }] }]),
        workout('a', '2026-10-05', [
          { id: 'pullup', block: 'warmup', sets: [{ reps: 12 }] },
          { id: 'pullup', sets: [{ reps: 6 }, { reps: 15, done: false }, { reps: 11, assisted: true }] },
        ]),
        workout('c', '2026-10-09', [{ id: 'pullup', sets: [{ reps: 20 }] }], 'active'),
      ],
      levelTest({ pullUps: 4, plankSec: 75 }),
    )
    expect(index.get('pullup|reps')).toEqual([
      { date: '2026-09-28', value: 4, workoutId: null },
      { date: '2026-10-05', value: 6, workoutId: 'a' },
      { date: '2026-10-08', value: 9, workoutId: 'b' },
    ])
    expect(index.get('pullup|load')).toEqual([{ date: '2026-10-08', value: 5, workoutId: 'b' }])
    expect(index.get('plank|time')).toEqual([{ date: '2026-09-28', value: 75, workoutId: null }])
    expect(bestPerformance(index, 'pullup', 'reps')?.value).toBe(9)
    expect(bestPerformance(index, 'squat', 'reps')).toBeNull()
    expect(firstReached(index, 'pullup', 'reps', 5)?.date).toBe('2026-10-05')
    expect(firstReached(index, 'pullup', 'reps', 10)).toBeNull()
  })
})

describe('objectif « figure »', () => {
  it('commence à la première étape, sans rien de fait', () => {
    const progress = skill(muscleUpGoal(), context())
    expect(progress.ratio).toBe(0)
    expect(progress.doneCount).toBe(0)
    expect(progress.current?.milestone.criterion).toEqual({ kind: 'reps', exerciseId: 'pullup', value: 8 })
    expect(progress.steps.map((s) => s.status)).toEqual(['current', 'todo', 'todo', 'todo', 'todo', 'todo'])
    expect(progress.achieved).toBe(false)
  })

  it('avance avec le test de niveau et le record sur l’étape en cours', () => {
    const ctx = context({
      levelTest: levelTest({ pullUps: 10 }),
      workouts: [workout('a', '2026-10-05', [{ id: 'pullup-chest-to-bar', sets: [{ reps: 2 }] }])],
    })
    const progress = skill(muscleUpGoal(), ctx)
    expect(progress.steps[0]).toMatchObject({ status: 'done', reachedBy: 'test', reachedOn: '2026-09-28' })
    expect(progress.current).toMatchObject({ status: 'current', ratio: 0.4, best: { value: 2 } })
    expect(progress.ratio).toBeCloseTo(1.4 / 6)
  })

  it('valide les étapes d’avant quand une plus dure est réussie, et les étapes cochées à la main', () => {
    const goal = muscleUpGoal()
    const ctx = context({
      workouts: [workout('a', '2026-10-06', [{ id: 'muscleup', sets: [{ reps: 1 }] }])],
    })
    const progress = skill(goal, ctx)
    expect(progress.steps.map((s) => s.reachedBy)).toEqual([
      'later',
      'later',
      'later',
      'later',
      'workout',
      null,
    ])
    expect(progress.current).toMatchObject({ ratio: 0.2 })
    expect(progress.ratio).toBeCloseTo(5.2 / 6)

    const milestones = goal.milestones.map((m, i) =>
      i === 0 ? { ...m, achievedAt: '2026-10-02T10:00:00.000Z' } : m,
    )
    const manual = skill({ ...goal, milestones }, context())
    expect(manual.steps[0]).toMatchObject({ status: 'done', reachedBy: 'manual', reachedOn: '2026-10-02' })
    expect(manual.doneCount).toBe(1)
  })

  it('est atteint à la dernière étape', () => {
    const ctx = context({
      workouts: [
        workout('a', '2026-10-06', [{ id: 'muscleup', sets: [{ reps: 2 }] }]),
        workout('b', '2026-10-20', [{ id: 'muscleup', sets: [{ reps: 3 }, { reps: 5 }] }]),
      ],
    })
    const progress = skill(muscleUpGoal(), ctx)
    expect(progress).toMatchObject({ ratio: 1, achieved: true, achievedOn: '2026-10-20', current: null })
    expect(progress.doneCount).toBe(6)
  })
})

describe('objectif « exercice »', () => {
  const goal = exerciseGoal(
    { exerciseId: 'pullup', name: 'Tractions', metric: 'reps', start: 8, target: 20, unit: 'kg' },
    BASICS,
    NOW,
    sequentialIds('e'),
  )

  it('se remplit entre le record de départ et la cible', () => {
    expect(goalProgress(goal, context())).toMatchObject({ ratio: 0, achieved: false, best: null })
    const ctx = context({ workouts: [workout('a', '2026-10-05', [{ id: 'pullup', sets: [{ reps: 14 }] }])] })
    expect(goalProgress(goal, ctx)).toMatchObject({ ratio: 0.5, achieved: false, best: { value: 14 } })
  })

  it('est atteint le jour où la cible est faite', () => {
    const ctx = context({
      workouts: [
        workout('a', '2026-10-05', [{ id: 'pullup', sets: [{ reps: 20 }] }]),
        workout('b', '2026-10-09', [{ id: 'pullup', sets: [{ reps: 22 }] }]),
      ],
    })
    expect(goalProgress(goal, ctx)).toMatchObject({ ratio: 1, achieved: true, achievedOn: '2026-10-05' })
  })

  it('suit aussi une charge, ou se marque atteint à la main', () => {
    const load = exerciseGoal(
      { exerciseId: 'pullup', name: 'Tractions', metric: 'load', start: 0, target: 20, unit: 'kg' },
      BASICS,
      NOW,
      sequentialIds('l'),
    )
    const ctx = context({
      workouts: [workout('a', '2026-10-05', [{ id: 'pullup', sets: [{ reps: 5, kg: 15 }] }])],
    })
    expect(goalProgress(load, ctx).ratio).toBe(0.75)
    const marked = goalProgress({ ...load, achievedAt: '2026-10-07T09:00:00.000Z' }, ctx)
    expect(marked).toMatchObject({ ratio: 1, achieved: true, achievedOn: '2026-10-07' })
  })
})

describe('objectif « poids »', () => {
  const metric = (date: string, kg: number) => ({
    id: date,
    date,
    weightKg: kg,
    bodyFatPct: null,
    waistCm: null,
    note: '',
    createdAt: `${date}T07:00:00.000Z`,
  })
  const losing = bodyweightGoal({ startKg: 82, targetKg: 75, unit: 'kg' }, BASICS, NOW, sequentialIds('w'))

  it('suit la dernière pesée, pour perdre comme pour prendre', () => {
    const ctx = context({ metrics: [metric('2026-10-08', 78), metric('2026-09-20', 82)] })
    const progress = goalProgress(losing, ctx)
    expect(progress).toMatchObject({ achieved: false, current: { kg: 78, date: '2026-10-08' } })
    expect(progress.ratio).toBeCloseTo(4 / 7)

    const gaining = bodyweightGoal({ startKg: 60, targetKg: 65, unit: 'kg' }, BASICS, NOW, sequentialIds('g'))
    expect(goalProgress(gaining, context({ metrics: [metric('2026-10-08', 62)] })).ratio).toBeCloseTo(0.4)
  })

  it('est atteint tant que la dernière pesée est au bon niveau', () => {
    const reached = context({
      metrics: [
        metric('2026-10-03', 74.8),
        metric('2026-10-10', 76),
        metric('2026-10-15', 75),
        metric('2026-10-20', 74.5),
      ],
    })
    expect(goalProgress(losing, reached)).toMatchObject({
      ratio: 1,
      achieved: true,
      achievedOn: '2026-10-15',
    })
    const regained = context({ metrics: [metric('2026-10-15', 75), metric('2026-10-20', 76)] })
    expect(goalProgress(losing, regained)).toMatchObject({ achieved: false, achievedOn: null })
  })

  it('prend le poids du profil sans pesée', () => {
    expect(goalProgress(losing, context({ profileWeightKg: 80 }))).toMatchObject({
      current: { kg: 80, date: null },
      ratio: 2 / 7,
    })
    expect(goalProgress(losing, context())).toMatchObject({ current: null, ratio: 0, achieved: false })
  })
})

describe('objectif « escalade »', () => {
  const scale = defaultGradeScales().find((s) => s.id === VERTICAL_ART_SCALE_ID)
  const blue = scale?.grades.find((g) => g.key === 'bleu')
  if (!scale || !blue) throw new Error('échelle')
  const goal = climbingGoal({ scaleId: scale.id, grade: blue, count: 3 }, BASICS, NOW, sequentialIds('c'))

  const session = (id: string, date: string, boulders: [string, BoulderResult][], scaleId = scale.id) =>
    ({
      id,
      date,
      gym: 'Vertical’Art',
      scaleId,
      durationMin: null,
      notes: '',
      eventId: null,
      boulders: boulders.map(([gradeKey, result], i) => ({
        id: `${id}-${String(i)}`,
        gradeKey,
        result,
        attempts: 1,
        styles: [],
        note: '',
        createdAt: `${date}T18:00:00.000Z`,
      })),
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    }) satisfies ClimbingSession

  it('compte les blocs réussis à ce niveau ou plus durs', () => {
    const climbs = [
      session('a', '2026-10-03', [
        ['bleu', 'sent'],
        ['vert', 'flash'],
        ['rouge', 'project'],
      ]),
      session('b', '2026-10-10', [
        ['rouge', 'flash'],
        ['bleu', 'failed'],
      ]),
      session('c', '2026-10-11', [['f6a', 'sent']], 'fontainebleau'),
    ]
    const progress = goalProgress(goal, context({ climbs }))
    expect(progress).toMatchObject({ count: 2, ratio: 2 / 3, achieved: false, grade: { key: 'bleu' } })

    const more = [
      ...climbs,
      session('d', '2026-10-17', [
        ['noir', 'sent'],
        ['bleu', 'sent'],
      ]),
    ]
    expect(goalProgress(goal, context({ climbs: more }))).toMatchObject({
      count: 4,
      ratio: 1,
      achieved: true,
      achievedOn: '2026-10-17',
    })
  })

  it('reste à zéro si le niveau n’existe plus', () => {
    const lost = { ...goal, gradeKey: 'or' }
    expect(goalProgress(lost, context())).toMatchObject({ ratio: 0, grade: null, achieved: false })
  })
})

describe('objectif libre', () => {
  it('suit l’avancement noté à la main', () => {
    const goal = customGoal({ ...BASICS, title: 'Semi-marathon' }, NOW, sequentialIds('x'))
    expect(goalProgress({ ...goal, manualProgress: 40 }, context())).toMatchObject({
      ratio: 0.4,
      achieved: false,
    })
    expect(
      goalProgress({ ...goal, manualProgress: 100, achievedAt: '2026-10-12T19:00:00.000Z' }, context()),
    ).toMatchObject({ ratio: 1, achieved: true, achievedOn: '2026-10-12' })
  })
})

describe('ce qu’une séance a fait avancer', () => {
  it('compare avant et après la séance, sans les séances suivantes', () => {
    const muscleUp = muscleUpGoal()
    const pullups = exerciseGoal(
      { exerciseId: 'pullup', name: 'Tractions', metric: 'reps', start: 5, target: 15, unit: 'kg' },
      BASICS,
      NOW,
      sequentialIds('p'),
    )
    const archived = { ...pullups, id: 'archivé', archived: true }
    const first = workout('a', '2026-10-05', [{ id: 'pullup', sets: [{ reps: 6 }] }])
    const today = workout('b', '2026-10-08', [{ id: 'pullup', sets: [{ reps: 9 }] }])
    const later = workout('c', '2026-10-12', [{ id: 'pullup', sets: [{ reps: 12 }] }])
    const all = [later, today, first]
    const goals = [muscleUp, pullups, archived]

    const advances = goalsAdvancedBy(today, goals, all, null)
    expect(advances.map((a) => a.goal.id)).toEqual([muscleUp.id, pullups.id])
    const [skillAdvance, exerciseAdvance] = advances
    expect(skillAdvance?.newSteps.map((s) => s.milestone.criterion?.exerciseId)).toEqual(['pullup'])
    expect(exerciseAdvance?.before.ratio).toBeCloseTo(0.1)
    expect(exerciseAdvance?.after.ratio).toBeCloseTo(0.4)

    // Un test de niveau déjà meilleur avant la séance : rien de neuf pour la figure.
    const tested = goalsAdvancedBy(today, goals, all, levelTest({ pullUps: 10 }))
    expect(tested).toEqual([])
    const nothing = workout('d', '2026-10-09', [{ id: 'squat', sets: [{ reps: 30 }] }])
    expect(goalsAdvancedBy(nothing, goals, [...all, nothing], null)).toEqual([])
  })
})
