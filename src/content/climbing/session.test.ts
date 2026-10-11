import { climbingSessionSchema } from '@/db/schema'
import { climbSession } from '@/test/fixtures'
import {
  boulderFrom,
  compareSessions,
  finishedSession,
  FORGOTTEN_AFTER_MIN,
  inputOf,
  isSend,
  liveSession,
  MAX_ATTEMPTS,
  newBoulderInput,
  pastSession,
  resultOf,
  sessionMinutes,
  suggestedDurationMin,
  withBoulder,
  withBoulderChanged,
  withoutBoulder,
} from './session'

const PLACE = { gym: '  Vertical’Art Paris  ', scaleId: 'vertical-art' }

describe('blocs', () => {
  it('déduit le résultat : flash au premier essai, projet à retenter', () => {
    expect(resultOf({ sent: true, attempts: 1, project: false })).toBe('flash')
    expect(resultOf({ sent: true, attempts: 4, project: true })).toBe('sent')
    expect(resultOf({ sent: false, attempts: 3, project: true })).toBe('project')
    expect(resultOf({ sent: false, attempts: 1, project: false })).toBe('failed')
    expect(isSend('flash') && isSend('sent')).toBe(true)
    expect(isSend('project') || isSend('failed')).toBe(false)
  })

  it('prépare un bloc propre : essais bornés, styles uniques, note sans espaces', () => {
    const input = { ...newBoulderInput('bleu'), attempts: 0, styles: ['slab', 'slab', 'crimps'] as const }
    const flash = boulderFrom({ ...input, styles: [...input.styles], note: '  talon  ' }, 'b1', 'T1')
    expect(flash).toEqual({
      id: 'b1',
      gradeKey: 'bleu',
      result: 'flash',
      attempts: 1,
      styles: ['slab', 'crimps'],
      note: 'talon',
      createdAt: 'T1',
    })
    expect(boulderFrom({ ...newBoulderInput('noir'), attempts: 150.4 }, 'b2', 'T2')).toMatchObject({
      result: 'sent',
      attempts: MAX_ATTEMPTS,
    })
    expect(boulderFrom({ ...newBoulderInput('noir'), attempts: 2.6 }, 'b3', 'T3').attempts).toBe(3)
  })

  it('retrouve la saisie d’un bloc enregistré', () => {
    const session = climbSession('s', '2026-10-10', [
      ['rouge', 'project', 5, ['overhang']],
      ['vert', 'flash'],
    ])
    const [project, flash] = session.boulders
    if (!project || !flash) throw new Error('blocs')
    expect(inputOf(project)).toEqual({
      gradeKey: 'rouge',
      sent: false,
      attempts: 5,
      project: true,
      styles: ['overhang'],
      note: '',
    })
    expect(inputOf(flash)).toMatchObject({ sent: true, attempts: 1, project: false })
    // Modifier puis réenregistrer garde l'identifiant et l'heure du bloc.
    expect(boulderFrom({ ...inputOf(project), sent: true }, project.id, project.createdAt)).toMatchObject({
      id: project.id,
      createdAt: project.createdAt,
      result: 'sent',
    })
  })

  it('ajoute, modifie et retire un bloc d’une séance', () => {
    const empty = climbSession('s', '2026-10-10')
    const boulder = boulderFrom(newBoulderInput('bleu'), 'b1', '2026-10-10T16:05:00.000Z')
    const one = withBoulder(empty, boulder)
    expect(one.boulders).toEqual([boulder])
    expect(empty.boulders).toEqual([])
    const changed = withBoulderChanged(one, { ...boulder, result: 'sent', attempts: 3 })
    expect(changed.boulders[0]).toMatchObject({ id: 'b1', result: 'sent', attempts: 3 })
    expect(() => withBoulderChanged(one, { ...boulder, id: 'inconnu' })).toThrow('Bloc introuvable.')
    expect(withoutBoulder(changed, 'b1').boulders).toEqual([])
  })
})

describe('séances', () => {
  it('commence une séance en direct, au jour de l’heure locale', () => {
    // 22 h 30 UTC le 10 octobre : déjà le 11 à Paris.
    const live = liveSession(PLACE, '2026-10-10T22:30:00.000Z', 'c1')
    expect(live).toMatchObject({
      id: 'c1',
      date: '2026-10-11',
      status: 'active',
      startedAt: '2026-10-10T22:30:00.000Z',
      endedAt: null,
      gym: 'Vertical’Art Paris',
      scaleId: 'vertical-art',
      boulders: [],
    })
    expect(climbingSessionSchema.safeParse(live).success).toBe(true)
  })

  it('note une séance passée, terminée d’emblée', () => {
    const past = pastSession(
      { ...PLACE, date: '2026-10-04', durationMin: 75 },
      '2026-10-10T08:00:00.000Z',
      'c2',
    )
    expect(past).toMatchObject({ date: '2026-10-04', status: 'done', durationMin: 75 })
    expect(past.endedAt).toBe(past.startedAt)
    expect(climbingSessionSchema.safeParse(past).success).toBe(true)
  })

  it('termine une séance avec sa durée, son ressenti et ses notes', () => {
    const live = liveSession(PLACE, '2026-10-10T16:00:00.000Z', 'c1')
    const done = finishedSession(live, {
      endedAt: '2026-10-10T17:40:00.000Z',
      durationMin: 100,
      rpe: 8,
      notes: '  peau à vif  ',
    })
    expect(done).toMatchObject({
      status: 'done',
      endedAt: '2026-10-10T17:40:00.000Z',
      durationMin: 100,
      rpe: 8,
      notes: 'peau à vif',
    })
    expect(climbingSessionSchema.safeParse(done).success).toBe(true)
  })

  it('refuse une séance en cours terminée, ou terminée sans fin', () => {
    const live = liveSession(PLACE, '2026-10-10T16:00:00.000Z', 'c1')
    expect(climbingSessionSchema.safeParse({ ...live, endedAt: '2026-10-10T17:00:00.000Z' }).success).toBe(
      false,
    )
    expect(climbingSessionSchema.safeParse({ ...live, status: 'done' }).success).toBe(false)
    expect(climbingSessionSchema.safeParse({ ...live, scaleId: '' }).success).toBe(false)
    const bad = withBoulder(live, { ...boulderFrom(newBoulderInput('bleu'), 'b', 'T'), attempts: 0 })
    expect(climbingSessionSchema.safeParse(bad).success).toBe(false)
  })

  it('propose la durée écoulée, ou d’après le dernier bloc si la séance a été oubliée', () => {
    const start = '2026-10-10T16:00:00.000Z'
    const live = liveSession(PLACE, start, 'c1')
    expect(suggestedDurationMin(live, '2026-10-10T17:35:00.000Z')).toBe(95)
    expect(suggestedDurationMin(live, start)).toBe(1)
    expect(suggestedDurationMin(live, '2026-10-10T21:00:00.000Z')).toBe(FORGOTTEN_AFTER_MIN)

    // Restée ouverte jusqu'au lendemain : dernier bloc à 17 h 20, donc 85 minutes.
    const forgotten = withBoulder(
      withBoulder(live, boulderFrom(newBoulderInput('vert'), 'b1', '2026-10-10T16:30:00.000Z')),
      boulderFrom(newBoulderInput('bleu'), 'b2', '2026-10-10T17:20:00.000Z'),
    )
    expect(suggestedDurationMin(forgotten, '2026-10-11T09:00:00.000Z')).toBe(85)
    // Sans bloc, rien à proposer.
    expect(suggestedDurationMin(live, '2026-10-11T09:00:00.000Z')).toBeNull()
    // Un dernier bloc très tard reste plafonné.
    const late = withBoulder(live, boulderFrom(newBoulderInput('vert'), 'b3', '2026-10-10T23:30:00.000Z'))
    expect(suggestedDurationMin(late, '2026-10-11T09:00:00.000Z')).toBe(FORGOTTEN_AFTER_MIN)
  })

  it('range les séances par jour puis par heure de début', () => {
    const a = climbSession('a', '2026-10-10', [], { startedAt: '2026-10-10T18:00:00.000Z' })
    const b = climbSession('b', '2026-10-10', [], { startedAt: '2026-10-10T09:00:00.000Z' })
    const c = climbSession('c', '2026-10-03')
    expect([a, b, c].sort(compareSessions).map((s) => s.id)).toEqual(['c', 'b', 'a'])
  })

  it('compte les minutes : le temps écoulé en cours, la durée retenue ensuite', () => {
    const live = liveSession(PLACE, '2026-10-10T16:00:00.000Z', 'c1')
    expect(sessionMinutes(live, Date.parse('2026-10-10T16:42:30.000Z'))).toBe(42)
    expect(sessionMinutes(climbSession('d', '2026-10-10'))).toBe(90)
    expect(sessionMinutes(climbSession('e', '2026-10-10', [], { durationMin: null }))).toBeNull()
  })
})
