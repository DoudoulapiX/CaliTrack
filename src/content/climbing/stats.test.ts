import { defaultGradeScales, FONTAINEBLEAU_SCALE_ID, VERTICAL_ART_SCALE_ID } from '@/content/grades'
import type { GradeScale } from '@/db/types'
import { climbSession } from '@/test/fixtures'
import { boulderLine, bouldersOf, fontOf } from './labels'
import {
  bestSend,
  flashRate,
  gradeStats,
  monthlyStats,
  periodSummary,
  pyramid,
  recordsBeaten,
  sessionColumns,
  sessionsSince,
  styleStats,
  summarize,
} from './stats'

function scaleOf(id: string): GradeScale {
  const scale = defaultGradeScales().find((s) => s.id === id)
  if (!scale) throw new Error(id)
  return scale
}

const VA = scaleOf(VERTICAL_ART_SCALE_ID)
const FONT = scaleOf(FONTAINEBLEAU_SCALE_ID)

const first = climbSession('a', '2026-09-12', [
  ['orange', 'flash'],
  ['vert', 'flash', 1, ['slab']],
  ['vert', 'sent', 3, ['slab', 'crimps']],
  ['bleu', 'failed', 4, ['overhang']],
])
const second = climbSession('b', '2026-10-03', [
  ['vert', 'flash'],
  ['bleu', 'sent', 2, ['overhang']],
  ['bleu', 'flash', 1, ['crimps']],
  ['rouge', 'project', 6, ['overhang']],
])
const third = climbSession('c', '2026-10-10', [
  ['bleu', 'flash'],
  ['rouge', 'sent', 5, ['overhang']],
  ['inconnu', 'sent'],
])
const elsewhere = climbSession('f', '2026-10-05', [['f6c', 'sent']], { scaleId: FONTAINEBLEAU_SCALE_ID })
const all = [third, elsewhere, first, second]

describe('chiffres d’une séance', () => {
  it('compte blocs, réussites, flashs et essais, avec le meilleur niveau', () => {
    expect(summarize(second.boulders, VA)).toMatchObject({
      boulders: 4,
      sends: 3,
      flashes: 2,
      attempts: 10,
      hardest: { key: 'bleu' },
      hardestFlash: { key: 'bleu' },
    })
    // Un niveau disparu de l'échelle compte comme réussi, sans être le meilleur.
    expect(summarize(third.boulders, VA)).toMatchObject({ sends: 3, hardest: { key: 'rouge' } })
    expect(summarize(third.boulders, null)).toMatchObject({ sends: 3, hardest: null, hardestFlash: null })
    expect(summarize([], VA)).toEqual({
      boulders: 0,
      sends: 0,
      flashes: 0,
      attempts: 0,
      hardest: null,
      hardestFlash: null,
    })
  })

  it('calcule la part de flashs parmi les blocs réussis', () => {
    expect(flashRate({ sends: 4, flashes: 1 })).toBe(0.25)
    expect(flashRate({ sends: 0, flashes: 0 })).toBeNull()
  })
})

describe('niveau et progression', () => {
  it('donne la réussite par niveau, dans une seule échelle', () => {
    const rows = gradeStats(all, VA)
    expect(rows.map((r) => r.grade.key)).toEqual(['orange', 'vert', 'bleu', 'rouge', 'noir', 'violet'])
    expect(rows.map((r) => [r.tries, r.sends, r.flashes, r.sendAttempts])).toEqual([
      [1, 1, 1, 1],
      [3, 3, 2, 5],
      [4, 3, 2, 4],
      [2, 1, 0, 5],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(gradeStats(all, FONT).find((r) => r.grade.key === 'f6c')).toMatchObject({ tries: 1, sends: 1 })
  })

  it('dresse la pyramide du plus dur au plus facile, avec le niveau suivant à viser', () => {
    expect(pyramid(gradeStats(all, VA)).map((r) => r.grade.key)).toEqual([
      'noir',
      'rouge',
      'bleu',
      'vert',
      'orange',
    ])
    // Pas de niveau au-dessus du plus dur de l'échelle.
    const top = climbSession('t', '2026-10-11', [['violet', 'sent']])
    expect(pyramid(gradeStats([top], VA)).map((r) => r.grade.key)).toEqual(['violet'])
    // Que des échecs : rien à montrer.
    expect(pyramid(gradeStats([climbSession('x', '2026-10-11', [['bleu', 'failed']])], VA))).toEqual([])
  })

  it('retient la première séance où le meilleur niveau a été atteint', () => {
    const again = climbSession('d', '2026-10-17', [['rouge', 'sent']])
    expect(bestSend([...all, again], VA)).toMatchObject({
      grade: { key: 'rouge' },
      date: '2026-10-10',
      sessionId: 'c',
    })
    expect(bestSend(all, VA, true)).toMatchObject({ grade: { key: 'bleu' }, date: '2026-10-03' })
    expect(bestSend([], VA)).toBeNull()
    expect(bestSend([elsewhere], VA)).toBeNull()
  })

  it('résume une période, sans le temps d’une séance en cours', () => {
    const live = climbSession('live', '2026-10-11', [['bleu', 'sent']], { status: 'active', endedAt: null })
    const sessions = [...all, live]
    expect(periodSummary(sessions, '2026-10-03')).toEqual({
      sessions: 4,
      boulders: 9,
      sends: 8,
      flashes: 3,
      minutes: 270,
    })
    expect(periodSummary(sessions, null)).toMatchObject({ sessions: 5, minutes: 360 })
    expect(sessionsSince(sessions, '2026-10-05').map((s) => s.id)).toEqual(['c', 'f', 'live'])
    expect(sessionsSince(sessions, null)).toHaveLength(5)
  })

  it('montre les dernières séances une à une, empilées par niveau', () => {
    const columns = sessionColumns(all, VA, 2)
    expect(columns.map((c) => c.session.id)).toEqual(['b', 'c'])
    expect(columns[0]?.segments.map((s) => [s.grade.key, s.count])).toEqual([
      ['vert', 1],
      ['bleu', 2],
    ])
    // Le bloc d'un niveau supprimé ne s'empile pas.
    expect(columns[1]?.total).toBe(2)
  })

  it('résume chaque mois, le plus récent d’abord', () => {
    expect(
      monthlyStats(all, VA).map((m) => [m.key, m.year, m.monthIndex, m.sessions, m.sends, m.hardest?.key]),
    ).toEqual([
      ['2026-10', 2026, 9, 2, 6, 'rouge'],
      ['2026-09', 2026, 8, 1, 3, 'vert'],
    ])
  })

  it('compte les styles notés, les plus fréquents d’abord', () => {
    expect(styleStats(all).map((s) => [s.style, s.tries, s.sends])).toEqual([
      ['overhang', 4, 2],
      ['slab', 2, 2],
      ['crimps', 2, 2],
    ])
  })

  it('repère les records battus par une séance', () => {
    expect(recordsBeaten(first, all, VA)).toEqual([])
    const records = recordsBeaten(second, all, VA)
    expect(records.map((r) => [r.kind, r.grade.key, r.previous?.key])).toEqual([
      ['hardest', 'bleu', 'vert'],
      ['hardestFlash', 'bleu', 'vert'],
    ])
    expect(recordsBeaten(third, all, VA).map((r) => [r.kind, r.grade.key, r.previous?.key])).toEqual([
      ['hardest', 'rouge', 'bleu'],
    ])
    // Premier flash après des séances sans flash.
    const noFlash = climbSession('n', '2026-08-01', [['vert', 'sent']])
    const flash = climbSession('o', '2026-08-08', [['orange', 'flash']])
    expect(recordsBeaten(flash, [noFlash, flash], VA).map((r) => [r.kind, r.grade.key, r.previous])).toEqual([
      ['hardestFlash', 'orange', null],
    ])
    // Une autre échelle ne se compare pas.
    expect(recordsBeaten(elsewhere, all, VA)).toEqual([])
  })
})

describe('textes', () => {
  it('décrit un bloc', () => {
    expect(boulderLine({ result: 'flash', attempts: 1 })).toBe('Flash')
    expect(boulderLine({ result: 'sent', attempts: 3 })).toBe('Réussi en 3 essais')
    expect(boulderLine({ result: 'project', attempts: 4 })).toBe('En projet · 4 essais')
    expect(boulderLine({ result: 'failed', attempts: 1 })).toBe('Pas réussi · 1 essai')
  })

  it('accorde les couleurs', () => {
    expect(bouldersOf(1, { label: 'Noir' })).toBe('1 bloc noir')
    expect(bouldersOf(5, { label: 'Bleu' })).toBe('5 blocs bleus')
    expect(bouldersOf(2, { label: 'Orange' })).toBe('2 blocs orange')
    expect(bouldersOf(3, { label: 'Vert clair' })).toBe('3 blocs vert clair')
    expect(bouldersOf(3, { label: '6A' })).toBe('3 blocs en 6A')
    expect(bouldersOf(1, { label: 'Jaune ' })).toBe('1 bloc jaune')
  })

  it('montre l’équivalence Fontainebleau seulement si elle apporte quelque chose', () => {
    expect(fontOf({ label: 'Bleu', font: '6A – 6B' })).toBe('6A – 6B')
    expect(fontOf({ label: '6A', font: '6A' })).toBeNull()
    expect(fontOf({ label: 'Rose', font: '  ' })).toBeNull()
  })
})
