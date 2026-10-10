import type { ProgramSession, ProgramSlot, Workout } from '@/db/types'
import { sequentialIds } from '@/test/fixtures'
import { workoutDurationSec, workoutStats } from './stats'
import {
  addExercise,
  addSet,
  completeSet,
  freeWorkout,
  hasDoneSets,
  moveExercise,
  nextPendingSet,
  removeExercise,
  removeSet,
  reopenSet,
  replaceExercise,
  suggestedValue,
  updateLoad,
  updateSet,
  workoutFromSession,
} from './workout'

const NOW = '2026-10-12T17:00:00.000Z'

function slot(id: string, exerciseId: string, patch: Partial<ProgramSlot> = {}): ProgramSlot {
  return {
    id,
    ladderId: null,
    exerciseId,
    sets: 3,
    target: { kind: 'reps', min: 5, max: 8 },
    loadKg: null,
    restSec: 120,
    note: 'Prise large',
    successStreak: 0,
    failStreak: 0,
    ...patch,
  }
}

const session: ProgramSession = {
  id: 'session-a',
  name: 'Corps complet A',
  emphasis: 'full',
  weekdays: [1],
  blocks: [
    {
      id: 'b1',
      kind: 'warmup',
      title: 'Échauffement',
      slots: [
        slot('w1', 'jumping-jacks', { sets: 1, target: { kind: 'time', min: 60, max: 60 }, restSec: 0 }),
      ],
    },
    {
      id: 'b2',
      kind: 'strength',
      title: 'Renforcement',
      slots: [slot('s1', 'pullup'), slot('s2', 'Dumbbell_Bicep_Curl', { loadKg: 10, sets: 4 })],
    },
  ],
}

function fresh(deload = false): Workout {
  return workoutFromSession({
    programId: 'p1',
    session,
    date: '2026-10-12',
    now: NOW,
    deload,
    newId: sequentialIds('w'),
  })
}

describe('séance en cours', () => {
  it('prépare la séance d’après le programme', () => {
    const workout = fresh()
    expect(workout).toMatchObject({
      title: 'Corps complet A',
      programId: 'p1',
      programSessionId: 'session-a',
      status: 'active',
      deload: false,
      startedAt: NOW,
      endedAt: null,
    })
    expect(workout.exercises.map((e) => [e.exerciseId, e.slotId, e.block, e.sets.length])).toEqual([
      ['jumping-jacks', 'w1', 'warmup', 1],
      ['pullup', 's1', 'strength', 3],
      ['Dumbbell_Bicep_Curl', 's2', 'strength', 4],
    ])
    const curls = workout.exercises[2]
    expect(curls?.sets.every((s) => s.loadKg === 10 && !s.done && s.reps === null)).toBe(true)
    expect(curls?.target).toEqual({ kind: 'reps', min: 5, max: 8 })
    // La note du programme reste au programme.
    expect(curls?.note).toBe('')
    const ids = workout.exercises.flatMap((e) => [e.id, ...e.sets.map((s) => s.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('fait moitié moins de séries en semaine allégée', () => {
    const workout = fresh(true)
    expect(workout.deload).toBe(true)
    expect(workout.exercises.map((e) => e.sets.length)).toEqual([1, 2, 2])
  })

  it('note les séries, propose la valeur suivante et trouve la prochaine série', () => {
    let workout = fresh()
    const pullups = workout.exercises[1]!
    const [first, second] = pullups.sets
    if (!first || !second) throw new Error('séries manquantes')
    expect(suggestedValue(pullups, 0, 'reps')).toBe(8)
    expect(nextPendingSet(workout)?.exercise.exerciseId).toBe('jumping-jacks')

    workout = completeSet(workout, pullups.id, first.id, { reps: 7.4 }, NOW)
    const updated = workout.exercises[1]!
    expect(updated.sets[0]).toMatchObject({ reps: 7, done: true, completedAt: NOW })
    expect(suggestedValue(updated, 1, 'reps')).toBe(7)
    expect(nextPendingSet(workout, { exerciseId: pullups.id, setId: first.id })?.set.id).toBe(second.id)

    workout = updateSet(workout, pullups.id, first.id, { reps: -3, loadKg: 0 })
    expect(workout.exercises[1]?.sets[0]).toMatchObject({ reps: 0, loadKg: null, done: true })
    workout = reopenSet(workout, pullups.id, first.id)
    expect(workout.exercises[1]?.sets[0]).toMatchObject({ reps: 0, done: false, completedAt: null })
    expect(hasDoneSets(workout)).toBe(false)
  })

  it('ajoute, retire, déplace et remplace des exercices et des séries', () => {
    let workout = fresh()
    const curls = workout.exercises[2]!
    workout = addSet(workout, curls.id, () => 'extra')
    expect(workout.exercises[2]?.sets.at(-1)).toMatchObject({ id: 'extra', loadKg: 10, done: false })
    workout = removeSet(workout, curls.id, 'extra')
    expect(workout.exercises[2]?.sets).toHaveLength(4)

    const warmup = workout.exercises[0]!
    expect(removeSet(workout, warmup.id, warmup.sets[0]!.id).exercises[0]?.sets).toHaveLength(1)

    workout = addExercise(workout, 'plank', { restSec: 60, newId: sequentialIds('n') })
    expect(workout.exercises.at(-1)).toMatchObject({
      exerciseId: 'plank',
      slotId: null,
      block: null,
      target: null,
      restSec: 60,
    })
    expect(workout.exercises.at(-1)?.sets).toHaveLength(3)
    const withRows = addExercise(workout, 'Dumbbell_Row', {
      restSec: 90,
      newId: sequentialIds('r'),
      sets: 2,
      loadKg: 12,
      block: 'strength',
      target: { kind: 'reps', min: 8, max: 12 },
    })
    expect(withRows.exercises.at(-1)).toMatchObject({ block: 'strength', target: { min: 8, max: 12 } })
    expect(withRows.exercises.at(-1)?.sets.map((s) => s.loadKg)).toEqual([12, 12])

    workout = moveExercise(workout, curls.id, -1)
    expect(workout.exercises.map((e) => e.exerciseId).slice(1, 3)).toEqual(['Dumbbell_Bicep_Curl', 'pullup'])
    expect(moveExercise(workout, warmup.id, -1)).toBe(workout)

    const pullups = workout.exercises[2]!
    workout = completeSet(workout, pullups.id, pullups.sets[0]!.id, { reps: 8 }, NOW)
    workout = replaceExercise(workout, pullups.id, 'chinup', { kind: 'reps', min: 4, max: 6 })
    expect(workout.exercises[2]).toMatchObject({ exerciseId: 'chinup', slotId: 's1', block: 'strength' })
    expect(workout.exercises[2]?.sets.every((s) => !s.done && s.reps === null)).toBe(true)
    const weighted = replaceExercise(workout, pullups.id, 'Dumbbell_Row', null, 14)
    expect(weighted.exercises[2]?.sets.every((s) => s.loadKg === 14)).toBe(true)

    workout = removeExercise(workout, pullups.id)
    expect(workout.exercises.map((e) => e.exerciseId)).toEqual([
      'jumping-jacks',
      'Dumbbell_Bicep_Curl',
      'plank',
    ])
  })

  it('change la charge d’une série et des suivantes pas encore faites', () => {
    let workout = fresh()
    const curls = workout.exercises[2]!
    const [first, second, third] = curls.sets
    if (!first || !second || !third) throw new Error('séries manquantes')
    workout = completeSet(workout, curls.id, first.id, { reps: 8 }, NOW)
    workout = updateLoad(workout, curls.id, second.id, 12.5)
    expect(workout.exercises[2]?.sets.map((s) => s.loadKg)).toEqual([10, 12.5, 12.5, 12.5])
    // Une série déjà faite plus loin garde sa charge.
    workout = completeSet(workout, curls.id, third.id, { reps: 8 }, NOW)
    workout = updateLoad(workout, curls.id, first.id, 0)
    expect(workout.exercises[2]?.sets.map((s) => s.loadKg)).toEqual([null, null, 12.5, null])
    expect(updateLoad(workout, curls.id, 'inconnue', 5)).toEqual(workout)
  })

  it('commence une séance libre', () => {
    expect(freeWorkout({ date: '2026-10-12', now: NOW, newId: () => 'f' })).toMatchObject({
      id: 'f',
      title: 'Séance libre',
      programId: null,
      exercises: [],
    })
    expect(freeWorkout({ date: '2026-10-12', now: NOW, newId: () => 'f', title: ' Parc ' }).title).toBe(
      'Parc',
    )
  })

  it('fait le bilan de la séance', () => {
    let workout = fresh()
    const [warmup, pullups, curls] = workout.exercises
    if (!warmup || !pullups || !curls) throw new Error('exercices manquants')
    workout = completeSet(workout, warmup.id, warmup.sets[0]!.id, { durationSec: 60 }, NOW)
    workout = completeSet(workout, pullups.id, pullups.sets[0]!.id, { reps: 8 }, NOW)
    workout = completeSet(workout, curls.id, curls.sets[0]!.id, { reps: 10, loadKg: 12.5 }, NOW)
    expect(workoutStats(workout)).toEqual({
      setsDone: 3,
      setsTotal: 8,
      reps: 18,
      holdSec: 60,
      volumeKg: 125,
      exercisesDone: 3,
    })
    expect(workoutDurationSec({ startedAt: NOW, endedAt: null }, Date.parse(NOW) + 95_000)).toBe(95)
    expect(workoutDurationSec({ startedAt: NOW, endedAt: '2026-10-12T17:52:00.000Z' })).toBe(52 * 60)
  })
})
