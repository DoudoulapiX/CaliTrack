import type { Program, ProgramSlot } from '@/db/types'
import { item, profile, sequentialIds, testCatalog } from '@/test/fixtures'
import {
  addSession,
  addSlot,
  BLOCK_ORDER,
  blockUsesLadder,
  cleanTarget,
  duplicateProgram,
  duplicateSession,
  emptyProgram,
  findSlot,
  ladderIdFor,
  moveSlot,
  newSession,
  newSlot,
  overlappingDays,
  removeSession,
  removeSlot,
  updateSession,
  updateSlot,
} from './edit'
import { generateProgram } from './generator'
import { loadsFor } from './loads'
import { schemeFor } from './schemes'

const NOW = '2026-10-10T08:00:00.000Z'
const scheme = schemeFor(['strength'], 'intermediate')

async function sample(): Promise<Program> {
  const { byId } = await testCatalog()
  return generateProgram({
    profile: profile({ experience: 'intermediate', focuses: ['strength'], targetSkills: [] }),
    items: [item('pullupBar'), item('dumbbells', [5, 10])],
    locations: [],
    locationId: null,
    exercises: byId,
    startDate: '2026-10-12',
    now: NOW,
    newId: sequentialIds(),
  })
}

function strengthSlots(program: Program): ProgramSlot[] {
  return program.sessions[0]?.blocks.find((b) => b.kind === 'strength')?.slots ?? []
}

describe('modifier un exercice du programme', () => {
  it('change l’exercice et repart de zéro', async () => {
    const program = await sample()
    const [first] = strengthSlots(program)
    if (!first) throw new Error('créneau manquant')
    const withStreak = updateSlot(program, first.id, { note: 'noté' })
    const changed = updateSlot({ ...withStreak, sessions: withStreak.sessions }, first.id, {
      exerciseId: 'pullup-archer',
    })
    const slot = findSlot(changed, first.id)?.slot
    expect(slot).toMatchObject({ exerciseId: 'pullup-archer', ladderId: 'pullV', note: '', successStreak: 0 })
    // Un exercice hors progression n'en suit aucune.
    const other = updateSlot(program, first.id, { exerciseId: 'Dumbbell_Bicep_Curl' })
    expect(findSlot(other, first.id)?.slot.ladderId).toBeNull()
    // Le programme d'origine n'est pas modifié.
    expect(findSlot(program, first.id)?.slot.exerciseId).toBe(first.exerciseId)
  })

  it('ne fait pas suivre de progression à l’échauffement, au cardio ni aux étirements', async () => {
    const program = await sample()
    const blocks = program.sessions[0]?.blocks ?? []
    const warmup = blocks.find((b) => b.kind === 'warmup')?.slots[0]
    const cooldown = blocks.find((b) => b.kind === 'cooldown')?.slots[0]
    if (!warmup || !cooldown) throw new Error('créneaux manquants')
    for (const slot of [warmup, cooldown]) {
      const changed = updateSlot(program, slot.id, { exerciseId: 'dead-hang' })
      expect(findSlot(changed, slot.id)?.slot).toMatchObject({ exerciseId: 'dead-hang', ladderId: null })
    }
  })

  it('range les valeurs saisies dans des bornes sûres', async () => {
    const program = await sample()
    const [first] = strengthSlots(program)
    if (!first) throw new Error('créneau manquant')
    const next = updateSlot(program, first.id, {
      sets: 40,
      restSec: -5,
      target: { kind: 'reps', min: 12, max: 6 },
      loadKg: 0,
    })
    expect(findSlot(next, first.id)?.slot).toMatchObject({
      sets: 10,
      restSec: 0,
      target: { kind: 'reps', min: 6, max: 12 },
      loadKg: null,
    })
    expect(cleanTarget({ kind: 'time', min: 0, max: 900 })).toEqual({ kind: 'time', min: 5, max: 600 })
  })

  it('déplace et retire un exercice', async () => {
    const program = await sample()
    const [a, b] = strengthSlots(program)
    if (!a || !b) throw new Error('créneaux manquants')
    const moved = moveSlot(program, b.id, -1)
    expect(
      strengthSlots(moved)
        .slice(0, 2)
        .map((s) => s.id),
    ).toEqual([b.id, a.id])
    expect(moveSlot(program, a.id, -1)).toEqual(program)

    const removed = removeSlot(program, a.id)
    expect(findSlot(removed, a.id)).toBeNull()
    // Un bloc vidé disparaît.
    const session = program.sessions[0]
    const cooldown = session?.blocks.find((block) => block.kind === 'cooldown')
    if (!cooldown) throw new Error('étirements manquants')
    let empty = program
    for (const slot of cooldown.slots) empty = removeSlot(empty, slot.id)
    expect(empty.sessions[0]?.blocks.some((block) => block.kind === 'cooldown')).toBe(false)
  })
})

describe('ajouter un exercice', () => {
  it('règle l’exercice selon le bloc et la progression', async () => {
    const { byId } = await testCatalog()
    const items = [item('pullupBar'), item('dumbbells', [4, 8])]
    const defaults = {
      scheme,
      loadsOf: (exercise: Parameters<typeof loadsFor>[0]) => loadsFor(exercise, items, null),
      newId: sequentialIds('new'),
    }
    const get = (id: string) => {
      const exercise = byId.get(id)
      if (!exercise) throw new Error(id)
      return exercise
    }
    expect(newSlot(get('pullup'), 'strength', defaults)).toMatchObject({
      ladderId: 'pullV',
      sets: 3,
      target: { kind: 'reps', min: 5, max: 8 },
      loadKg: null,
      restSec: scheme.restSec,
    })
    expect(newSlot(get('pullup-negative'), 'strength', defaults).target).toEqual({
      kind: 'reps',
      min: 3,
      max: 5,
    })
    expect(newSlot(get('Dumbbell_Bicep_Curl'), 'strength', defaults)).toMatchObject({
      ladderId: null,
      loadKg: 4,
    })
    expect(newSlot(get('front-lever-tuck'), 'skill', defaults)).toMatchObject({
      ladderId: 'skill:frontLever',
      sets: 4,
      target: { kind: 'time', min: 8, max: 15 },
      restSec: 120,
    })
    expect(newSlot(get('plank'), 'core', defaults)).toMatchObject({ restSec: 60, target: { kind: 'time' } })
    expect(newSlot(get('jumping-jacks'), 'warmup', defaults)).toMatchObject({
      sets: 1,
      restSec: 0,
      target: { kind: 'time', min: 30, max: 30 },
    })
    expect(newSlot(get('burpee'), 'conditioning', defaults)).toMatchObject({ sets: 3, restSec: 30 })
  })

  it('crée le bloc au bon endroit s’il manque', async () => {
    const program = await sample()
    const session = program.sessions[0]
    if (!session) throw new Error('séance manquante')
    const slot = { ...strengthSlots(program)[0], id: 'ajout' } as ProgramSlot
    const next = addSlot(program, session.id, 'conditioning', slot, () => 'bloc')
    const kinds = next.sessions[0]?.blocks.map((block) => block.kind)
    expect(kinds?.indexOf('conditioning')).toBe((kinds?.indexOf('cooldown') ?? 0) - 1)
    expect(findSlot(next, 'ajout')?.block.id).toBe('bloc')
    const again = addSlot(next, session.id, 'conditioning', { ...slot, id: 'ajout-2' }, () => 'autre')
    expect(findSlot(again, 'ajout-2')?.block.id).toBe('bloc')
  })

  it('reconnaît la progression d’un exercice', () => {
    expect(ladderIdFor('pullup', null)).toBe('pullV')
    expect(ladderIdFor('pullup', 'skill:muscleUp')).toBe('skill:muscleUp')
    expect(ladderIdFor('front-lever-tuck', 'pullV')).toBe('skill:frontLever')
    expect(ladderIdFor('Dumbbell_Bicep_Curl', 'pullV')).toBeNull()
    expect(BLOCK_ORDER.filter(blockUsesLadder)).toEqual(['skill', 'strength', 'core'])
  })
})

describe('séances et programmes', () => {
  it('ajoute, renomme, duplique et retire une séance', async () => {
    const program = await sample()
    const ids = sequentialIds('s')
    const added = addSession(program, newSession('  ', [6, 6, 2], ids))
    const session = added.sessions[added.sessions.length - 1]
    expect(session).toMatchObject({ name: 'Séance', weekdays: [2, 6], blocks: [] })
    if (!session) throw new Error('séance manquante')

    const renamed = updateSession(added, session.id, { name: ' Jambes ', weekdays: [7, 1, 1] })
    expect(renamed.sessions.find((s) => s.id === session.id)).toMatchObject({
      name: 'Jambes',
      weekdays: [1, 7],
    })
    expect(updateSession(added, session.id, { name: '   ' }).sessions.at(-1)?.name).toBe('Séance')

    const source = program.sessions[0]
    if (!source) throw new Error('séance manquante')
    const copied = duplicateSession(program, source.id, sequentialIds('copie'))
    const copy = copied.sessions[1]
    expect(copy?.name).toBe(`${source.name} (copie)`)
    expect(copy?.weekdays).toEqual([])
    const slotIds = (s: typeof source) => s.blocks.flatMap((b) => b.slots.map((x) => x.id))
    expect(copy && slotIds(copy).some((id) => slotIds(source).includes(id))).toBe(false)

    expect(removeSession(program, source.id).sessions).toHaveLength(program.sessions.length - 1)
  })

  it('crée un programme vide ou une copie inactive', async () => {
    const empty = emptyProgram({
      name: ' ',
      focuses: ['strength'],
      locationId: null,
      startDate: '2026-10-12',
      now: NOW,
      newId: () => 'vide',
    })
    expect(empty).toMatchObject({
      id: 'vide',
      name: 'Mon programme',
      active: false,
      source: 'custom',
      sessions: [],
    })

    const program = await sample()
    const copy = duplicateProgram(program, NOW, sequentialIds('c'))
    expect(copy).toMatchObject({ name: `${program.name} (copie)`, active: false, source: 'custom' })
    expect(copy.id).not.toBe(program.id)
    expect(copy.sessions.map((s) => s.weekdays)).toEqual(program.sessions.map((s) => s.weekdays))
  })

  it('repère deux séances le même jour', async () => {
    const program = await sample()
    expect(overlappingDays(program)).toEqual([])
    const doubled = addSession(
      program,
      newSession('Soir', [1, 2], () => 'soir'),
    )
    expect(overlappingDays(doubled)).toEqual([1])
  })
})
