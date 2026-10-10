import type { BlockKind, Workout, WorkoutSet } from '@/db/types'
import { formatDoneSets, formatRecord, formatSetResult } from './format'
import { exerciseRecords, recordsBeaten } from './records'

function set(values: Partial<WorkoutSet>, done = true): WorkoutSet {
  return {
    id: Math.random().toString(36),
    reps: null,
    durationSec: null,
    loadKg: null,
    assistance: null,
    rpe: null,
    done,
    completedAt: done ? '2026-10-12T17:10:00.000Z' : null,
    ...values,
  }
}

function workout(
  id: string,
  date: string,
  exercises: { exerciseId: string; block?: BlockKind | null; sets: WorkoutSet[] }[],
  status: Workout['status'] = 'done',
): Workout {
  return {
    id,
    date,
    startedAt: `${date}T17:00:00.000Z`,
    endedAt: status === 'done' ? `${date}T18:00:00.000Z` : null,
    title: 'Séance',
    programId: null,
    programSessionId: null,
    eventId: null,
    exercises: exercises.map((e, i) => ({
      id: `${id}-${String(i)}`,
      exerciseId: e.exerciseId,
      slotId: null,
      block: e.block ?? 'strength',
      target: null,
      restSec: 90,
      sets: e.sets,
      note: '',
    })),
    rpe: null,
    notes: '',
    status,
    deload: false,
    progression: [],
  }
}

const history = [
  workout('w1', '2026-10-05', [
    { exerciseId: 'pullup', sets: [set({ reps: 8 }), set({ reps: 7 }), set({ reps: 12 }, false)] },
    { exerciseId: 'plank', block: 'core', sets: [set({ durationSec: 45 })] },
    { exerciseId: 'jumping-jacks', block: 'warmup', sets: [set({ durationSec: 600 })] },
  ]),
  workout('w2', '2026-10-07', [
    { exerciseId: 'pullup', sets: [set({ reps: 8 }), set({ reps: 5, loadKg: 5 })] },
    { exerciseId: 'plank', block: 'core', sets: [set({ durationSec: 60 })] },
  ]),
  // Séance en cours : pas encore dans les records.
  workout('w3', '2026-10-09', [{ exerciseId: 'pullup', sets: [set({ reps: 20 })] }], 'active'),
]

describe('records', () => {
  it('garde la meilleure série de chaque exercice (le premier à égalité)', () => {
    const records = exerciseRecords(history)
    const pullup = records.get('pullup')
    expect(pullup).toMatchObject({ sessions: 2, lastDate: '2026-10-07' })
    expect(pullup?.reps).toMatchObject({ value: 8, workoutId: 'w1', date: '2026-10-05' })
    expect(pullup?.load).toMatchObject({ value: 5, reps: 5, workoutId: 'w2' })
    expect(pullup?.hold).toBeNull()
    expect(records.get('plank')?.hold).toMatchObject({ value: 60, workoutId: 'w2' })
    // L'échauffement ne compte pas.
    expect(records.has('jumping-jacks')).toBe(false)
  })

  it('repère les records battus, pas les premières fois', () => {
    const today = workout('w4', '2026-10-12', [
      { exerciseId: 'pullup', sets: [set({ reps: 9 }), set({ reps: 6, loadKg: 7.5 })] },
      { exerciseId: 'plank', block: 'core', sets: [set({ durationSec: 60 })] },
      { exerciseId: 'dip', sets: [set({ reps: 10 })] },
    ])
    const hits = recordsBeaten(today, [...history, today])
    expect(hits.map((h) => [h.exerciseId, h.kind, h.previous.value, h.entry.value])).toEqual([
      ['pullup', 'reps', 8, 9],
      ['pullup', 'load', 5, 7.5],
    ])
    // Revue plus tard, la séance garde ses records : les séances suivantes ne comptent pas.
    const later = workout('w5', '2026-10-14', [{ exerciseId: 'pullup', sets: [set({ reps: 15 })] }])
    expect(recordsBeaten(today, [...history, today, later])).toHaveLength(2)
    expect(recordsBeaten(later, [...history, today, later]).map((h) => h.previous.value)).toEqual([9])
  })

  it('écrit les séries et les records', () => {
    expect(formatSetResult(set({ reps: 8, loadKg: 10 }), 'reps', 'kg')).toBe('8 rép. · 10 kg')
    expect(formatSetResult(set({ durationSec: 75 }), 'time', 'kg')).toBe('1 min 15 s')
    expect(formatSetResult(set({}), 'reps', 'kg')).toBe('—')

    const [first] = history[0]!.exercises
    expect(formatDoneSets(first!, 'reps', 'kg')).toBe('8, 7 rép.')
    const [, second] = history[1]!.exercises
    expect(formatDoneSets(second!, 'time', 'kg')).toBe('1 min')
    const [pullups] = history[1]!.exercises
    expect(formatDoneSets(pullups!, 'reps', 'kg')).toBe('8, 5 rép. · chargé')
    expect(formatDoneSets({ ...pullups!, sets: [set({ reps: 6, loadKg: 5 })] }, 'reps', 'kg')).toBe(
      '6 rép. · 5 kg',
    )
    expect(formatDoneSets({ ...pullups!, sets: [set({ reps: 6 }, false)] }, 'reps', 'kg')).toBe('Pas fait')
    expect(
      formatDoneSets(
        { ...pullups!, sets: [set({ durationSec: 30 }), set({ durationSec: 25 })] },
        'time',
        'kg',
      ),
    ).toBe('30, 25 s')

    const records = exerciseRecords(history)
    const pullup = records.get('pullup')!
    expect(formatRecord('reps', pullup.reps!, 'kg')).toBe('8 rép.')
    expect(formatRecord('load', pullup.load!, 'kg')).toBe('5 kg × 5')
    expect(formatRecord('hold', records.get('plank')!.hold!, 'kg')).toBe('1 min')
  })
})
