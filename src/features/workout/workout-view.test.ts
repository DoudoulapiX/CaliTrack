import { completeSet, workoutFromSession } from '@/content/workouts/workout'
import { exerciseRecords } from '@/content/workouts/records'
import type { ProgramSession, Workout } from '@/db/types'
import { keepTogether } from '@/lib/typography'
import { sequentialIds } from '@/test/fixtures'
import {
  blockFor,
  currentSet,
  describePending,
  formatElapsed,
  formatWorkoutDuration,
  groupByBlock,
  groupByMonth,
  loadFromDisplay,
  loadToDisplay,
  prescriptionOf,
  recordsLine,
  rpeLabel,
  typedLoad,
  workoutSubtitle,
} from './workout-view'

const NOW = '2026-10-12T17:00:00.000Z'

const session: ProgramSession = {
  id: 's',
  name: 'Haut du corps',
  emphasis: 'upper',
  weekdays: [1],
  blocks: [
    {
      id: 'b1',
      kind: 'warmup',
      title: 'Échauffement',
      slots: [
        {
          id: 'w',
          ladderId: null,
          exerciseId: 'jumping-jacks',
          sets: 1,
          target: { kind: 'time', min: 60, max: 60 },
          loadKg: null,
          restSec: 0,
          note: '',
          successStreak: 0,
          failStreak: 0,
        },
      ],
    },
    {
      id: 'b2',
      kind: 'strength',
      title: 'Renforcement',
      slots: ['pullup', 'dip'].map((exerciseId) => ({
        id: exerciseId,
        ladderId: null,
        exerciseId,
        sets: 3,
        target: { kind: 'reps' as const, min: 5, max: 8 },
        loadKg: exerciseId === 'dip' ? 10 : null,
        restSec: 120,
        note: '',
        successStreak: 0,
        failStreak: 0,
      })),
    },
  ],
}

function fresh(): Workout {
  return workoutFromSession({
    programId: 'p',
    session,
    date: '2026-10-12',
    now: NOW,
    deload: false,
    newId: sequentialIds('w'),
  })
}

describe('écrans de séance', () => {
  it('regroupe les exercices par bloc et devine le bloc d’un exercice ajouté', () => {
    const workout = fresh()
    expect(groupByBlock(workout.exercises).map((g) => [g.title, g.exercises.length])).toEqual([
      ['Échauffement', 1],
      ['Renforcement', 2],
    ])
    const moved = [workout.exercises[1]!, workout.exercises[0]!, workout.exercises[2]!]
    expect(groupByBlock(moved).map((g) => g.title)).toEqual(['Renforcement', 'Échauffement', 'Renforcement'])
    expect(groupByBlock([{ ...workout.exercises[0]!, block: null }])[0]?.title).toBe('Autres exercices')

    expect(blockFor({ category: 'stretching' })).toBe('cooldown')
    expect(blockFor({ category: 'mobility' })).toBe('cooldown')
    expect(blockFor({ category: 'cardio' })).toBe('conditioning')
    expect(blockFor({ category: 'skill' })).toBe('skill')
    expect(blockFor({ category: 'powerlifting' })).toBe('strength')
  })

  it('suit la série en cours, même quand on en saute une', () => {
    let workout = fresh()
    const [warmup, pullups, dips] = workout.exercises
    if (!warmup || !pullups || !dips) throw new Error('exercices manquants')
    expect(currentSet(workout)?.exercise.id).toBe(warmup.id)

    // On commence par les dips : la suite, c'est la deuxième série de dips.
    workout = completeSet(workout, dips.id, dips.sets[0]!.id, { reps: 6 }, '2026-10-12T17:05:00.000Z')
    const next = currentSet(workout)
    expect(next).toMatchObject({ index: 1 })
    expect(next?.exercise.id).toBe(dips.id)
    expect(describePending(next!, 'Dips')).toEqual({
      text: 'Dips · série 2 sur 3 · 6 rép.',
      spoken: 'Dips, série 2 sur 3',
    })
    expect(describePending(currentSet(fresh())!, 'Jumping jacks')).toEqual({
      text: 'Jumping jacks · 1 min',
      spoken: 'Jumping jacks',
    })

    // Toutes les dips faites : on revient à ce qui reste, depuis le début.
    workout = completeSet(workout, dips.id, dips.sets[1]!.id, { reps: 6 }, '2026-10-12T17:08:00.000Z')
    workout = completeSet(workout, dips.id, dips.sets[2]!.id, { reps: 5 }, '2026-10-12T17:11:00.000Z')
    expect(currentSet(workout)?.exercise.id).toBe(warmup.id)
  })

  it('écrit les prescriptions, les durées et le ressenti', () => {
    const [warmup, pullups, dips] = fresh().exercises
    expect(prescriptionOf(warmup!, 'kg')).toBe('1 min')
    expect(prescriptionOf(pullups!, 'kg')).toBe('3 × 5 à 8 rép.')
    expect(prescriptionOf(dips!, 'kg')).toBe('3 × 5 à 8 rép. · 10 kg')
    expect(prescriptionOf({ ...pullups!, target: null }, 'kg')).toBe('3 séries')
    expect(prescriptionOf({ ...pullups!, target: null, sets: [pullups!.sets[0]!] }, 'kg')).toBe('1 série')
    expect(prescriptionOf(dips!, 'kg', true)).toBe('3 × 5 à 8 rép. par côté · 10 kg')
    expect(prescriptionOf({ ...pullups!, target: null }, 'kg', true)).toBe('3 séries')

    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(245.7)).toBe('4:05')
    expect(formatElapsed(3723)).toBe('1:02:03')
    expect(formatWorkoutDuration(20)).toBe('1 min')
    expect(formatWorkoutDuration(52 * 60 + 20)).toBe('52 min')
    expect(formatWorkoutDuration(65 * 60)).toBe('1 h 05')

    expect(rpeLabel(null)).toBeNull()
    expect(rpeLabel(4)).toBe('Facile')
    expect(rpeLabel(7)).toBe('Correct')
    expect(rpeLabel(9)).toBe('Dur')
    expect(rpeLabel(10)).toBe('À fond')

    const done: Workout = {
      ...fresh(),
      status: 'done',
      endedAt: '2026-10-12T17:52:00.000Z',
      rpe: 8,
    }
    const [, firstPullups] = done.exercises
    const finished = completeSet(done, firstPullups!.id, firstPullups!.sets[0]!.id, { reps: 8 }, NOW)
    expect(workoutSubtitle(finished)).toBe(`${keepTogether('52 min')} · ${keepTogether('1 série')} · Dur`)
  })

  it('convertit les charges saisies en kilos ou en livres, sans dériver', () => {
    expect(loadToDisplay(null, 'kg')).toBeNull()
    expect(loadToDisplay(12.5, 'kg')).toBe(12.5)
    expect(loadToDisplay(11.34, 'lb')).toBe(25)
    expect(loadFromDisplay(25, 'lb')).toBe(11.34)
    expect(loadFromDisplay(12.345, 'kg')).toBe(12.35)
    expect(loadFromDisplay(0, 'kg')).toBeNull()
    expect(loadFromDisplay(null, 'kg')).toBeNull()
    // Ce qui est tapé est ce qui sera relu après enregistrement.
    for (const value of [2.5, 12.5, 25, 25.5, 44, 100.2]) {
      expect(typedLoad(value, 'lb')).toBe(loadToDisplay(loadFromDisplay(value, 'lb'), 'lb'))
      expect(typedLoad(value, 'kg')).toBe(value)
    }
    expect(typedLoad(25, 'lb')).toBe(25)
    expect(typedLoad(0, 'kg')).toBe(0)
    expect(typedLoad(null, 'kg')).toBeNull()
  })

  it('range l’historique par mois et résume les records', () => {
    const october = { ...fresh(), id: 'a', date: '2026-10-12' }
    const october2 = { ...fresh(), id: 'b', date: '2026-10-01' }
    const september = { ...fresh(), id: 'c', date: '2026-09-28' }
    expect(groupByMonth([october, october2, september]).map((g) => [g.title, g.workouts.length])).toEqual([
      ['Octobre 2026', 2],
      ['Septembre 2026', 1],
    ])

    let workout: Workout = { ...fresh(), status: 'done' }
    const dips = workout.exercises[2]!
    workout = completeSet(workout, dips.id, dips.sets[0]!.id, { reps: 8, loadKg: 10 }, NOW)
    workout = completeSet(workout, dips.id, dips.sets[1]!.id, { reps: 5, loadKg: 15 }, NOW)
    const records = exerciseRecords([workout]).get('dip')
    expect(records && recordsLine(records, 'kg')).toBe('8 rép. · 15 kg × 5')
  })
})
