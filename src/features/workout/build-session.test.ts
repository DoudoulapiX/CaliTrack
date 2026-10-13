import type { ProgramSession, ProgramSlot } from '@/db/types'
import { coachChange, testProgram } from '@/test/fixtures'
import { coachSessionBuilder, programSessionBuilder } from './build-session'

function slot(id: string, exerciseId: string, sets: number): ProgramSlot {
  return {
    id,
    ladderId: null,
    exerciseId,
    sets,
    target: { kind: 'reps', min: 5, max: 8 },
    loadKg: null,
    restSec: 120,
    note: '',
    successStreak: 0,
    failStreak: 0,
  }
}

const SESSION: ProgramSession = {
  id: 'B',
  name: 'Séance B',
  emphasis: 'full',
  weekdays: [3],
  blocks: [
    {
      id: 'b1',
      kind: 'strength',
      title: 'Renforcement',
      slots: [slot('slot-1', 'pullup', 4), slot('slot-2', 'pushup', 4)],
    },
  ],
}

describe('séance préparée au moment où on la commence', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('séance du programme : le jour et la semaine allégée du moment du départ', () => {
    // Programme commencé le 14 octobre, semaine allégée toutes les deux semaines.
    const build = programSessionBuilder(testProgram({ deloadEveryWeeks: 2 }), SESSION, '2026-10-19')
    vi.setSystemTime(new Date(2026, 9, 21, 18, 30))
    const workout = build()
    expect(workout).toMatchObject({
      programId: 'p1',
      programSessionId: 'B',
      date: '2026-10-21',
      plannedFor: '2026-10-19',
      deload: true,
      status: 'active',
    })
    expect(workout.startedAt).toBe(new Date(2026, 9, 21, 18, 30).toISOString())
    expect(workout.exercises.map((e) => [e.slotId, e.sets.length])).toEqual([
      ['slot-1', 2],
      ['slot-2', 2],
    ])
    // Sans jour prévu choisi : pas de rattachement.
    expect(programSessionBuilder(testProgram(), SESSION)()).toMatchObject({ plannedFor: null, deload: false })
  })

  it('séance ajustée par le coach : les exercices changés quittent la progression, les autres non', () => {
    const plan = { changes: [coachChange({ plannedExerciseId: 'pullup', exerciseId: 'pullup', sets: 1 })] }
    const build = coachSessionBuilder(testProgram({ deloadEveryWeeks: 2 }), SESSION, '2026-10-21', plan)
    const workout = build()
    expect(workout).toMatchObject({
      programSessionId: 'B',
      date: '2026-10-21',
      plannedFor: '2026-10-21',
      deload: true,
    })
    expect(workout.exercises.map((e) => [e.exerciseId, e.slotId, e.sets.length])).toEqual([
      ['pullup', null, 1],
      ['pushup', 'slot-2', 2],
    ])
    expect(workout.exercises[0]?.note).toMatch(/^Coach\u00a0: Nuit courte/)
    // Chaque départ prépare une séance neuve.
    const again = build()
    expect(again.id).not.toBe(workout.id)
    expect(
      new Set([...workout.exercises, ...again.exercises].flatMap((e) => e.sets.map((s) => s.id))).size,
    ).toBe(6)
  })

  it('sans changement : la séance du programme', () => {
    const program = testProgram()
    const coach = coachSessionBuilder(program, SESSION, null, { changes: [] })()
    const plain = programSessionBuilder(program, SESSION, null)()
    const shape = (w: typeof coach) => ({
      ...w,
      id: '',
      exercises: w.exercises.map((e) => ({ ...e, id: '', sets: e.sets.map((s) => ({ ...s, id: '' })) })),
    })
    expect(shape(coach)).toEqual(shape(plain))
  })
})
