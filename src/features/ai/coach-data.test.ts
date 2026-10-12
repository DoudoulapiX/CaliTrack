import { ALL_SECTIONS, buildCoachContext } from '@/content/coach/context'
import { db } from '@/db/db'
import { ensureSeeded } from '@/db/seed'
import type { FoodEntry, Nutrients, ProgramSlot } from '@/db/types'
import { resetDb } from '@/test/db'
import {
  bodyReview,
  climbSession,
  doneWorkout,
  pantryItem,
  profile,
  programSession,
  testProgram,
} from '@/test/fixtures'
import { loadCoachData, workoutExerciseLine } from './coach-data'

const nutrients = (kcal: number, protein: number): Nutrients => ({
  kcal,
  protein,
  carbs: 100,
  fat: 20,
  fiber: null,
  sugars: null,
  satFat: null,
  salt: null,
})

function entry(id: string, date: string, kcal: number, protein: number): FoodEntry {
  return {
    id,
    date,
    meal: 'lunch',
    source: 'quick',
    foodId: null,
    name: 'Repas',
    grams: null,
    per100: null,
    nutrients: nutrients(kcal, protein),
    note: '',
    createdAt: `${date}T12:00:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
  }
}

const slot: ProgramSlot = {
  id: 'slot-1',
  ladderId: null,
  exerciseId: 'pullup',
  sets: 4,
  target: { kind: 'reps', min: 5, max: 8 },
  loadKg: null,
  restSec: 120,
  note: '',
  successStreak: 0,
  failStreak: 0,
}

async function fill() {
  await db.profile.put(
    profile({
      firstName: 'Charles',
      birthYear: 1996,
      sex: 'male',
      heightCm: 180,
      weightKg: 82,
      trainingDays: [1, 3, 4],
      climbingDays: [6],
      targetSkills: ['frontLever'],
    }),
  )
  await db.programs.put(
    testProgram({
      sessions: [
        {
          ...programSession('A', [1, 4]),
          blocks: [{ id: 'block-1', kind: 'strength', title: 'Force', slots: [slot] }],
        },
        programSession('B', [3]),
      ],
    }),
  )
  await db.bodyMetrics.bulkPut([
    { id: 'm1', date: '2026-09-01', weightKg: 83, bodyFatPct: null, waistCm: null, note: '', createdAt: '' },
    {
      id: 'm2',
      date: '2026-10-14',
      weightKg: 80.4,
      bodyFatPct: null,
      waistCm: null,
      note: '',
      createdAt: '',
    },
    { id: 'm3', date: '2026-10-20', weightKg: 80, bodyFatPct: null, waistCm: null, note: '', createdAt: '' },
    { id: 'm4', date: '2026-10-25', weightKg: 79, bodyFatPct: null, waistCm: null, note: '', createdAt: '' },
  ])
  await db.workouts.bulkPut([
    doneWorkout('w-old', '2026-10-01', [['pullup', [8, 8]]]),
    doneWorkout(
      'w1',
      '2026-10-19',
      [
        ['pullup', [8, 7, 6]],
        ['pushup', []],
      ],
      { rpe: 7 },
    ),
  ])
  await db.climbingSessions.put(climbSession('c1', '2026-10-17', [['5a', 'flash']]))
  await db.ouraDays.bulkPut([
    {
      date: '2026-10-21',
      sleepScore: 78,
      readinessScore: 82,
      activityScore: null,
      sleepMin: 430,
      sleepEfficiency: null,
      hrvMs: 45,
      lowestHr: null,
      temperatureDeviation: null,
      activeKcal: null,
      totalKcal: null,
      steps: null,
      syncedAt: '2026-10-21T07:00:00.000Z',
    },
  ])
  await db.foodEntries.bulkPut([
    entry('e1', '2026-10-21', 650, 45),
    entry('e2', '2026-10-20', 2000, 150),
    entry('e3', '2026-10-19', 1800, 140),
    entry('e4', '2026-10-19', 400, 30),
    entry('e5', '2026-10-10', 9000, 500),
  ])
  await db.bodyReviews.bulkPut([
    bodyReview({ date: '2026-10-14' }),
    bodyReview({ date: '2026-10-28', phase: 'bulk' }),
  ])
  await db.pantryItems.bulkPut([
    pantryItem({ id: 'p1', place: 'cupboard', name: 'Riz', quantity: '1 kg' }),
    pantryItem({ id: 'p2', place: 'fridge', name: 'Yaourts', quantity: '4' }),
    pantryItem({ id: 'p3', place: 'fridge', name: 'Œufs', quantity: '6' }),
  ])
}

describe('données du coach', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('rassemble ce que le coach doit savoir, jamais le prénom', async () => {
    await fill()
    const data = await loadCoachData('2026-10-21')

    expect(data.profile).toMatchObject({ sex: 'male', age: 30, heightCm: 180, weightKg: 80 })
    expect(data.profile).not.toHaveProperty('firstName')
    expect(data.program).toEqual({
      name: 'Force',
      week: 2,
      deload: false,
      sessions: [
        { name: 'Séance A', exercises: [expect.stringMatching(/^Tractions : 4\s×\s5 à 8\srép\.$/)] },
        { name: 'Séance B', exercises: [] },
      ],
    })
    expect(data.agenda).toEqual([
      { date: '2026-10-21', label: 'Séance B', status: 'planned' },
      { date: '2026-10-22', label: 'Séance A', status: 'planned' },
      { date: '2026-10-24', label: 'Escalade', status: 'planned' },
      { date: '2026-10-26', label: 'Séance A', status: 'planned' },
    ])
    expect(data.workouts).toEqual([
      { date: '2026-10-19', title: 'Séance libre', rpe: 7, exercises: ['Tractions : 8, 7, 6'] },
    ])
    expect(data.climbing).toHaveLength(1)
    expect(data.climbing[0]).toMatchObject({ date: '2026-10-17' })
    expect(data.climbing[0]?.summary).toContain('Vertical’Art')
    expect(data.oura).toEqual([
      expect.objectContaining({ date: '2026-10-21', readinessScore: 82, sleepMin: 430 }),
    ])
    expect(data.weights).toEqual([
      { date: '2026-10-14', kg: 80.4 },
      { date: '2026-10-20', kg: 80 },
    ])
    expect(data.nutrition.phase).toBe('maintain')
    expect(data.nutrition.targets).not.toBeNull()
    expect(data.nutrition.today).toMatchObject({ kcal: 650, protein: 45 })
    // Deux jours notés parmi les 7 précédents : (2000 + 1800 + 400) / 2.
    expect(data.nutrition.last7Avg).toMatchObject({ kcal: 2100, protein: 160 })
    expect(data.bodyReview).toEqual({ date: '2026-10-14', phase: 'cut', bodyFat: { low: 15, high: 19 } })
    expect(data.pantry).toEqual([
      { place: 'fridge', name: 'Œufs', quantity: '6' },
      { place: 'fridge', name: 'Yaourts', quantity: '4' },
      { place: 'cupboard', name: 'Riz', quantity: '1 kg' },
    ])

    const context = buildCoachContext(data, ALL_SECTIONS)
    expect(context).not.toContain('Charles')
    expect(context).not.toMatch(/[\u00a0\u202f]/)
    expect(context).toContain('- Séance A : Tractions : 4 × 5 à 8 rép.')
  })

  it('se contente du profil quand rien n’est noté', async () => {
    await db.profile.put(profile({ firstName: 'Charles', birthYear: null, weightKg: 75 }))
    const data = await loadCoachData('2026-10-21')
    expect(data.profile).toMatchObject({ age: null, weightKg: 75 })
    expect(data.program).toBeNull()
    expect(data.workouts).toEqual([])
    expect(data.nutrition).toMatchObject({ targets: null, last7Avg: null, today: { kcal: 0 } })
    expect(data.bodyReview).toBeNull()
    expect(data.pantry).toEqual([])
    expect(buildCoachContext(data, ALL_SECTIONS)).not.toContain('Charles')
  })

  it('écrit les séries faites d’un exercice', () => {
    const set = { reps: 8, durationSec: null, loadKg: null, done: true }
    expect(workoutExerciseLine('Tractions', [set, { ...set, reps: 6 }])).toBe('Tractions : 8, 6')
    expect(
      workoutExerciseLine('Gainage', [
        { ...set, reps: null, durationSec: 45 },
        { ...set, reps: null, durationSec: 30, done: false },
      ]),
    ).toBe('Gainage : 45 s')
    expect(workoutExerciseLine('Dips lestés', [{ ...set, loadKg: 10 }])).toBe('Dips lestés : 8 à 10 kg')
    expect(workoutExerciseLine('Pompes', [{ ...set, done: false }])).toBeNull()
  })
})
