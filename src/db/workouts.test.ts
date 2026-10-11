import { emptyProgram } from '@/content/programs/edit'
import { completeSet, freeWorkout, workoutFromSession } from '@/content/workouts/workout'
import { resetDb } from '@/test/db'
import { sequentialIds } from '@/test/fixtures'
import { db } from './db'
import { saveProgram } from './programs'
import type { Program, ProgressionChange } from './types'
import {
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  listDoneWorkouts,
  startWorkout,
  updateWorkout,
  WorkoutInProgressError,
} from './workouts'

const NOW = '2026-10-12T17:00:00.000Z'

async function savedProgram(): Promise<Program> {
  const program: Program = {
    ...emptyProgram({
      name: 'Force',
      focuses: ['strength'],
      locationId: null,
      startDate: '2026-10-05',
      now: NOW,
      newId: () => 'p1',
    }),
    active: true,
    sessions: [
      {
        id: 's1',
        name: 'Haut du corps',
        emphasis: 'upper',
        weekdays: [1],
        blocks: [
          {
            id: 'b1',
            kind: 'strength',
            title: 'Renforcement',
            slots: [
              {
                id: 'slot-1',
                ladderId: 'pullV',
                exerciseId: 'pullup',
                sets: 2,
                target: { kind: 'reps', min: 5, max: 8 },
                loadKg: null,
                restSec: 120,
                note: '',
                successStreak: 0,
                failStreak: 0,
              },
            ],
          },
        ],
      },
    ],
  }
  return saveProgram(program)
}

describe('séances enregistrées', () => {
  beforeEach(resetDb)

  it('n’a qu’une séance en cours à la fois', async () => {
    const first = await startWorkout(freeWorkout({ date: '2026-10-12', now: NOW, newId: () => 'a' }))
    expect((await getActiveWorkout())?.id).toBe(first.id)
    const second = freeWorkout({ date: '2026-10-12', now: NOW, newId: () => 'b' })
    await expect(startWorkout(second)).rejects.toBeInstanceOf(WorkoutInProgressError)
    expect(await db.workouts.count()).toBe(1)

    await deleteWorkout(first.id)
    expect(await getActiveWorkout()).toBeUndefined()
    await startWorkout(second)
    expect((await getActiveWorkout())?.id).toBe('b')
  })

  it('refuse une séance mal formée', async () => {
    const broken = { ...freeWorkout({ date: '2026-13-45', now: NOW, newId: () => 'x' }) }
    await expect(startWorkout(broken)).rejects.toThrow()
    expect(await db.workouts.count()).toBe(0)
  })

  it('termine la séance et fait progresser le programme d’un seul tenant', async () => {
    const program = await savedProgram()
    const session = program.sessions[0]!
    let workout = workoutFromSession({
      programId: program.id,
      session,
      date: '2026-10-12',
      now: NOW,
      deload: false,
      newId: sequentialIds('w'),
    })
    await startWorkout(workout)
    const exercise = workout.exercises[0]!
    workout = await updateWorkout(workout.id, (w) =>
      completeSet(w, exercise.id, exercise.sets[0]!.id, { reps: 8 }, NOW),
    )
    expect(workout.exercises[0]?.sets[0]?.done).toBe(true)

    const change: ProgressionChange = {
      slotId: 'slot-1',
      fromExerciseId: 'pullup',
      toExerciseId: 'pullup',
      fromTarget: { kind: 'reps', min: 5, max: 8 },
      toTarget: { kind: 'reps', min: 6, max: 9 },
      fromLoadKg: null,
      toLoadKg: null,
      kind: 'moreReps',
    }
    const seen: string[] = []
    const done = await finishWorkout(workout.id, { rpe: 8, notes: ' Bonne séance ' }, (p, w) => {
      seen.push(`${p.id}:${w.status}`)
      return { program: { ...p, name: 'Force (progressé)' }, changes: [change] }
    })
    expect(seen).toEqual(['p1:done'])
    expect(done).toMatchObject({ status: 'done', rpe: 8, notes: 'Bonne séance', progression: [change] })
    expect(done.endedAt).not.toBeNull()
    expect((await db.programs.get('p1'))?.name).toBe('Force (progressé)')
    expect(await getActiveWorkout()).toBeUndefined()

    // Terminer deux fois ne fait pas progresser deux fois.
    const again = await finishWorkout(workout.id, { rpe: 5, notes: '' }, () => {
      throw new Error('ne doit pas être appelé')
    })
    expect(again.rpe).toBe(8)
  })

  it('n’enregistre rien si la progression échoue', async () => {
    const program = await savedProgram()
    const workout = workoutFromSession({
      programId: program.id,
      session: program.sessions[0]!,
      date: '2026-10-12',
      now: NOW,
      deload: false,
      newId: sequentialIds('w'),
    })
    await startWorkout(workout)
    await expect(
      finishWorkout(workout.id, { rpe: null, notes: '' }, (p) => ({
        program: { ...p, sessions: [{ ...p.sessions[0]!, weekdays: [9 as never] }] },
        changes: [],
      })),
    ).rejects.toThrow()
    expect((await db.workouts.get(workout.id))?.status).toBe('active')
    expect((await db.programs.get('p1'))?.sessions[0]?.weekdays).toEqual([1])
  })

  it('termine une séance libre et liste l’historique, la plus récente d’abord', async () => {
    for (const [id, date] of [
      ['ancienne', '2026-10-01'],
      ['récente', '2026-10-10'],
    ] as const) {
      await startWorkout(freeWorkout({ date, now: `${date}T17:00:00.000Z`, newId: () => id }))
      await finishWorkout(id, { rpe: null, notes: '' }, () => null)
    }
    await startWorkout(freeWorkout({ date: '2026-10-12', now: NOW, newId: () => 'en-cours' }))
    expect((await listDoneWorkouts()).map((w) => w.id)).toEqual(['récente', 'ancienne'])
  })
})
