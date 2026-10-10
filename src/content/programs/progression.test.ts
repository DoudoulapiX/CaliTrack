import type { BlockKind, EquipmentItem, Program, ProgramSlot, WorkoutSet } from '@/db/types'
import { item, testCatalog } from '@/test/fixtures'
import {
  narrowerTarget,
  progressProgram,
  progressSlot,
  slotOutcome,
  slotStepIndex,
  widerTarget,
} from './progression'
import { ladderFor, skillLadderId } from './ladders'
import { trainingContext } from './resolve'
import { schemeFor } from './schemes'

const scheme = schemeFor(['strength'], 'intermediate')

function slot(patch: Partial<ProgramSlot> = {}): ProgramSlot {
  return {
    id: 'slot-1',
    ladderId: 'pullV',
    exerciseId: 'pullup',
    sets: 3,
    target: { kind: 'reps', min: 5, max: 8 },
    loadKg: null,
    restSec: 120,
    note: '',
    successStreak: 0,
    failStreak: 0,
    ...patch,
  }
}

function sets(values: number[], patch: Partial<WorkoutSet> = {}): WorkoutSet[] {
  return values.map((reps, i) => ({
    id: `set-${i}`,
    reps,
    durationSec: null,
    loadKg: null,
    assistance: null,
    rpe: null,
    done: true,
    completedAt: null,
    ...patch,
  }))
}

function holds(values: number[]): WorkoutSet[] {
  return sets(values).map((s) => ({ ...s, reps: null, durationSec: s.reps }))
}

async function progress(
  current: ProgramSlot,
  done: WorkoutSet[],
  items: EquipmentItem[],
  blockKind: BlockKind = 'strength',
) {
  const { byId } = await testCatalog()
  return progressSlot({
    slot: current,
    blockKind,
    sets: done,
    context: trainingContext(byId, items, null),
    scheme,
  })
}

const BAR = [item('pullupBar')]

describe('bilan d’un exercice', () => {
  it('réussi quand toutes les séries prévues atteignent le haut de la fourchette', () => {
    expect(slotOutcome(slot(), sets([8, 8, 8]))).toBe('success')
    expect(slotOutcome(slot(), sets([9, 8, 10]))).toBe('success')
  })

  it('tenu entre les deux, ou s’il manque des séries', () => {
    expect(slotOutcome(slot(), sets([8, 7, 6]))).toBe('hold')
    expect(slotOutcome(slot(), sets([8, 8]))).toBe('hold')
    // Une dernière série faible ne fait pas rater la séance : c'est la moyenne qui compte.
    expect(slotOutcome(slot(), sets([7, 6, 4]))).toBe('hold')
  })

  it('raté quand la moyenne passe sous le bas de la fourchette', () => {
    expect(slotOutcome(slot(), sets([5, 4, 3]))).toBe('fail')
    expect(slotOutcome(slot(), sets([2]))).toBe('fail')
  })

  it('ne compte que les séries faites', () => {
    expect(slotOutcome(slot(), [])).toBe('none')
    expect(slotOutcome(slot(), sets([8, 8, 8], { done: false }))).toBe('none')
    expect(slotOutcome(slot(), [...sets([8, 8, 8]), ...sets([1], { done: false })])).toBe('success')
  })

  it('compte les secondes pour un maintien', () => {
    const hold = slot({ target: { kind: 'time', min: 10, max: 20 } })
    expect(slotOutcome(hold, holds([20, 22, 20]))).toBe('success')
    expect(slotOutcome(hold, holds([8, 7, 9]))).toBe('fail')
  })

  it('ne valide pas une charge plus légère que prévu', () => {
    const loaded = slot({ loadKg: 10 })
    expect(slotOutcome(loaded, sets([8, 8, 8], { loadKg: 8 }))).toBe('hold')
    expect(slotOutcome(loaded, sets([8, 8, 8], { loadKg: 10 }))).toBe('success')
    expect(slotOutcome(loaded, sets([8, 8, 8]))).toBe('success')
  })
})

describe('progression après une séance réussie', () => {
  it('passe à la version plus dure', async () => {
    const { slot: next, change } = await progress(slot({ note: 'prise large' }), sets([8, 8, 8]), BAR)
    expect(next).toMatchObject({
      exerciseId: 'pullup-chest-to-bar',
      target: { kind: 'reps', min: 5, max: 8 },
      loadKg: null,
      note: '',
      successStreak: 0,
      failStreak: 0,
    })
    expect(change).toMatchObject({
      kind: 'levelUp',
      fromExerciseId: 'pullup',
      toExerciseId: 'pullup-chest-to-bar',
    })
  })

  it('saute un échelon dont le matériel manque', async () => {
    const negative = slot({ exerciseId: 'pullup-negative', target: { kind: 'reps', min: 3, max: 5 } })
    // Sans élastique, pas de traction assistée : directement la traction.
    const { slot: next } = await progress(negative, sets([5, 5, 5]), BAR)
    expect(next).toMatchObject({ exerciseId: 'pullup', target: { kind: 'reps', min: 5, max: 8 } })
    const { slot: assisted } = await progress(negative, sets([5, 5, 5]), [...BAR, item('bands')])
    expect(assisted.exerciseId).toBe('pullup-band')
  })

  it('alourdit d’abord la charge, puis passe à la version suivante', async () => {
    const dumbbells = [item('dumbbells', [8, 10, 12])]
    const goblet = slot({ ladderId: 'squat', exerciseId: 'Goblet_Squat', loadKg: 8 })
    const heavier = await progress(goblet, sets([8, 8, 8], { loadKg: 8 }), dumbbells)
    expect(heavier.slot).toMatchObject({ exerciseId: 'Goblet_Squat', loadKg: 10 })
    expect(heavier.change).toMatchObject({ kind: 'moreLoad', fromLoadKg: 8, toLoadKg: 10 })

    // Fait avec plus lourd que prévu : on repart de ce qui a été fait.
    const ahead = await progress(goblet, sets([8, 8, 8], { loadKg: 10 }), dumbbells)
    expect(ahead.slot.loadKg).toBe(12)

    const top = await progress({ ...goblet, loadKg: 12 }, sets([8, 8, 8]), dumbbells)
    expect(top.slot).toMatchObject({ exerciseId: 'split-squat', loadKg: null })
    expect(top.change?.kind).toBe('levelUp')
  })

  it('ajoute un lest au bout de la progression', async () => {
    const rings = slot({ ladderId: 'dip', exerciseId: 'dip-ring' })
    const vest = await progress(rings, sets([8, 8, 8]), [item('rings'), item('weightVest', [5, 10])])
    expect(vest.slot.loadKg).toBe(5)
    expect(vest.change).toMatchObject({ kind: 'moreLoad', fromLoadKg: null, toLoadKg: 5 })
  })

  it('sinon, vise quelques répétitions de plus', async () => {
    const rings = slot({ ladderId: 'dip', exerciseId: 'dip-ring' })
    const { slot: next, change } = await progress(rings, sets([8, 8, 8]), [item('rings')])
    expect(next.target).toEqual({ kind: 'reps', min: 6, max: 9 })
    expect(change?.kind).toBe('moreReps')
  })

  it('garde le même objectif au plafond, et le dit', async () => {
    const capped = slot({ ladderId: null, exerciseId: 'burpee', target: { kind: 'reps', min: 28, max: 30 } })
    const { slot: next, change } = await progress(capped, sets([30, 30, 30]), [])
    expect(next.target).toEqual(capped.target)
    expect(next.successStreak).toBe(1)
    expect(change?.kind).toBe('keep')
  })

  it('suit les étapes d’une figure, même quand un exercice revient avec un objectif plus haut', async () => {
    const ladderId = skillLadderId('muscleUp')
    const first = slot({ ladderId, exerciseId: 'muscleup', target: { kind: 'reps', min: 1, max: 1 } })
    const step = await progress(first, sets([1, 1, 1]), BAR, 'skill')
    expect(step.slot).toMatchObject({ exerciseId: 'muscleup', target: { kind: 'reps', min: 3, max: 5 } })
    expect(step.change?.kind).toBe('levelUp')
    const after = await progress(step.slot, sets([5, 5, 5]), BAR, 'skill')
    expect(after.slot.target).toEqual({ kind: 'reps', min: 4, max: 6 })
    expect(after.change?.kind).toBe('moreReps')
  })

  it('tient plus longtemps un maintien de figure', async () => {
    const ladderId = skillLadderId('frontLever')
    const tuck = slot({
      ladderId,
      exerciseId: 'front-lever-tuck',
      target: { kind: 'time', min: 8, max: 15 },
      sets: 4,
    })
    const { slot: next } = await progress(tuck, holds([15, 16, 15, 15]), BAR, 'skill')
    expect(next).toMatchObject({
      exerciseId: 'front-lever-adv-tuck',
      target: { kind: 'time', min: 5, max: 10 },
    })
  })
})

describe('recul après deux séances ratées', () => {
  it('attend la deuxième séance ratée', async () => {
    const once = await progress(slot(), sets([4, 3, 3]), BAR)
    expect(once.slot).toMatchObject({ exerciseId: 'pullup', failStreak: 1 })
    expect(once.change).toBeNull()
    // Une séance correcte entre deux remet le compteur à zéro.
    const recovered = await progress(once.slot, sets([6, 6, 5]), BAR)
    expect(recovered.slot.failStreak).toBe(0)
  })

  it('revient à la version plus facile', async () => {
    const twice = await progress(slot({ failStreak: 1 }), sets([4, 3, 3]), [...BAR, item('bands')])
    expect(twice.slot).toMatchObject({ exerciseId: 'pullup-band', failStreak: 0 })
    expect(twice.change).toMatchObject({ kind: 'levelDown', toExerciseId: 'pullup-band' })
    const noBand = await progress(slot({ failStreak: 1 }), sets([4, 3, 3]), BAR)
    expect(noBand.slot).toMatchObject({
      exerciseId: 'pullup-negative',
      target: { kind: 'reps', min: 3, max: 5 },
    })
  })

  it('allège la charge, sans descendre sous le minimum de l’échelon', async () => {
    const dumbbells = [item('dumbbells', [5, 8, 10])]
    const goblet = slot({ ladderId: 'squat', exerciseId: 'Goblet_Squat', loadKg: 10, failStreak: 1 })
    const lighter = await progress(goblet, sets([3, 3, 3]), dumbbells)
    expect(lighter.slot.loadKg).toBe(8)
    expect(lighter.change?.kind).toBe('lessLoad')
    // 5 kg est sous le minimum du goblet squat (8 kg) : retour au squat.
    const down = await progress({ ...goblet, loadKg: 8 }, sets([3, 3, 3]), dumbbells)
    expect(down.slot).toMatchObject({ exerciseId: 'squat', loadKg: null })
  })

  it('enlève un lest ajouté', async () => {
    const dip = slot({ ladderId: 'dip', exerciseId: 'dip', loadKg: 5, failStreak: 1 })
    const { slot: next, change } = await progress(dip, sets([3, 3, 3]), [
      item('dipBars'),
      item('weightVest', [5, 10]),
    ])
    expect(next).toMatchObject({ exerciseId: 'dip', loadKg: null })
    expect(change).toMatchObject({ kind: 'lessLoad', toLoadKg: null })
  })

  it('baisse l’objectif au premier échelon', async () => {
    const wall = slot({ ladderId: 'pushH', exerciseId: 'pushup-wall', failStreak: 1 })
    const { slot: next, change } = await progress(wall, sets([3, 3, 3]), [])
    expect(next.target).toEqual({ kind: 'reps', min: 4, max: 7 })
    expect(change?.kind).toBe('lessReps')
  })
})

describe('ce qui ne progresse pas', () => {
  it('l’échauffement et les étirements', async () => {
    const warmup = slot({
      ladderId: null,
      exerciseId: 'jumping-jacks',
      sets: 1,
      target: { kind: 'time', min: 60, max: 60 },
    })
    for (const kind of ['warmup', 'cooldown'] as const) {
      const result = await progress(warmup, holds([90]), [], kind)
      expect(result.slot).toBe(warmup)
      expect(result.change).toBeNull()
    }
  })

  it('un exercice non fait', async () => {
    const result = await progress(slot(), [], BAR)
    expect(result.change).toBeNull()
    expect(result.slot).toEqual(slot())
  })
})

describe('fourchettes', () => {
  it('montent par petits pas, avec un plafond', () => {
    expect(widerTarget({ kind: 'reps', min: 5, max: 8 }, 'pullup', 'strength')).toEqual({
      kind: 'reps',
      min: 6,
      max: 9,
    })
    expect(widerTarget({ kind: 'reps', min: 12, max: 20 }, 'squat', 'strength')).toEqual({
      kind: 'reps',
      min: 14,
      max: 22,
    })
    expect(widerTarget({ kind: 'reps', min: 6, max: 8 }, 'dragon-flag-negative', 'core')).toBeNull()
    expect(widerTarget({ kind: 'time', min: 20, max: 40 }, 'plank', 'core')).toEqual({
      kind: 'time',
      min: 25,
      max: 45,
    })
    expect(widerTarget({ kind: 'time', min: 100, max: 120 }, 'plank', 'core')).toBeNull()
    expect(widerTarget({ kind: 'time', min: 100, max: 120 }, 'Rope_Jumping', 'conditioning')).toEqual({
      kind: 'time',
      min: 110,
      max: 130,
    })
  })

  it('descendent sans passer sous une répétition ou 5 secondes', () => {
    expect(narrowerTarget({ kind: 'reps', min: 5, max: 8 })).toEqual({ kind: 'reps', min: 4, max: 7 })
    expect(narrowerTarget({ kind: 'reps', min: 1, max: 1 })).toBeNull()
    expect(narrowerTarget({ kind: 'time', min: 5, max: 10 })).toEqual({ kind: 'time', min: 5, max: 5 })
    expect(narrowerTarget({ kind: 'time', min: 5, max: 5 })).toBeNull()
  })

  it('retrouvent l’échelon d’un exercice qui revient', () => {
    const ladder = ladderFor(skillLadderId('muscleUp'))
    if (!ladder) throw new Error('muscle-up')
    expect(slotStepIndex(ladder, { exerciseId: 'muscleup', target: { kind: 'reps', min: 1, max: 1 } })).toBe(
      4,
    )
    expect(slotStepIndex(ladder, { exerciseId: 'muscleup', target: { kind: 'reps', min: 3, max: 5 } })).toBe(
      5,
    )
    expect(slotStepIndex(ladder, { exerciseId: 'pullup', target: { kind: 'reps', min: 4, max: 8 } })).toBe(0)
    expect(slotStepIndex(ladder, { exerciseId: 'squat', target: { kind: 'reps', min: 4, max: 8 } })).toBe(-1)
  })
})

describe('progression d’un programme après une séance', () => {
  const program: Program = {
    id: 'p',
    name: 'Test',
    active: true,
    source: 'generated',
    focuses: ['strength'],
    locationId: null,
    sessions: [
      {
        id: 'session',
        name: 'A',
        emphasis: 'full',
        weekdays: [1],
        blocks: [
          {
            id: 'b',
            kind: 'strength',
            title: 'Renforcement',
            slots: [slot(), slot({ id: 'slot-2', ladderId: 'pushH', exerciseId: 'pushup' })],
          },
        ],
      },
    ],
    startDate: '2026-10-12',
    deloadEveryWeeks: 6,
    rationale: [],
    notes: '',
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
  }

  const exercise = (slotId: string, exerciseId: string, values: number[]) => ({
    id: `e-${slotId}`,
    exerciseId,
    slotId,
    block: 'strength' as const,
    target: null,
    restSec: 120,
    sets: sets(values),
    note: '',
  })

  it('applique les réussites et rend la liste des changements', async () => {
    const { byId } = await testCatalog()
    const context = trainingContext(byId, BAR, null)
    const workout = {
      deload: false,
      exercises: [exercise('slot-1', 'pullup', [8, 8, 8]), exercise('slot-2', 'pushup', [6, 6, 6])],
    }
    const { program: next, changes } = progressProgram(program, workout, context, scheme)
    expect(changes.map((c) => c.kind)).toEqual(['levelUp'])
    const slots = next.sessions[0]?.blocks[0]?.slots
    expect(slots?.[0]?.exerciseId).toBe('pullup-chest-to-bar')
    expect(slots?.[1]).toEqual(program.sessions[0]?.blocks[0]?.slots[1])
  })

  it('ne change rien pendant une semaine allégée', async () => {
    const { byId } = await testCatalog()
    const context = trainingContext(byId, BAR, null)
    const workout = { deload: true, exercises: [exercise('slot-1', 'pullup', [8, 8, 8])] }
    const result = progressProgram(program, workout, context, scheme)
    expect(result.program).toBe(program)
    expect(result.changes).toEqual([])
  })

  it('ignore un exercice remplacé pendant la séance', async () => {
    const { byId } = await testCatalog()
    const context = trainingContext(byId, BAR, null)
    const workout = { deload: false, exercises: [exercise('slot-1', 'chinup', [8, 8, 8])] }
    expect(progressProgram(program, workout, context, scheme).changes).toEqual([])
  })
})
