import { summarize } from '@/content/climbing/stats'
import { builtInScale, VERTICAL_ART_SCALE_ID } from '@/content/grades'
import { climbSession } from '@/test/fixtures'
import {
  climbDateLine,
  climbPath,
  climbSubtitle,
  climbTiles,
  formatMinutes,
  formatPercent,
  groupClimbsByMonth,
  periodStart,
  sendsLine,
  shownGrade,
} from './climb-view'

const VA = builtInScale(VERTICAL_ART_SCALE_ID) ?? null

describe('textes de l’escalade', () => {
  it('écrit les durées, les pourcentages et les blocs réussis', () => {
    expect(formatMinutes(52)).toBe('52 min')
    expect(formatMinutes(92)).toBe('1 h 32')
    expect(formatMinutes(0)).toBe('1 min')
    expect(formatPercent(0.625)).toBe('63\u00a0%')
    expect(sendsLine({ boulders: 0, sends: 0 })).toBe('Aucun bloc noté')
    expect(sendsLine({ boulders: 1, sends: 1 })).toBe('1 bloc réussi')
    expect(sendsLine({ boulders: 12, sends: 12 })).toBe('12 blocs réussis')
    expect(sendsLine({ boulders: 9, sends: 7 })).toBe('7 réussis sur 9')
    expect(sendsLine({ boulders: 3, sends: 0 })).toBe('0 réussi sur 3')
  })

  it('résume une séance en une ligne', () => {
    const done = climbSession(
      'a',
      '2026-10-10',
      [
        ['bleu', 'sent'],
        ['rouge', 'failed'],
      ],
      { rpe: 8 },
    )
    expect(climbSubtitle(done)).toBe('Vertical’Art · 1 h 30 · 1 réussi sur 2 · Dur')
    expect(climbSubtitle({ ...done, gym: '', durationMin: null, rpe: null })).toBe('1 réussi sur 2')
    expect(climbSubtitle(done, false)).toBe('1 h 30 · 1 réussi sur 2 · Dur')
    const live = { ...done, status: 'active' as const, endedAt: null }
    expect(climbSubtitle(live)).toBe('Vertical’Art · En cours · 2 blocs notés')
    expect(climbSubtitle({ ...live, boulders: [] })).toBe('Vertical’Art · En cours · 0 bloc noté')
  })

  it('donne le jour et les heures d’une séance suivie en direct', () => {
    // 16 h – 17 h 30 UTC : 18:00 – 19:30 à Paris.
    expect(climbDateLine(climbSession('a', '2026-10-10'))).toBe('Samedi 10 octobre · 18:00 – 19:30')
    const live = climbSession('b', '2026-10-10', [], { status: 'active', endedAt: null })
    expect(climbDateLine(live)).toBe('Samedi 10 octobre · 18:00')
    // Notée après coup : le jour seulement.
    const past = climbSession('c', '2026-10-04', [], {
      startedAt: '2026-10-10T08:00:00.000Z',
      endedAt: '2026-10-10T08:00:00.000Z',
    })
    expect(climbDateLine(past)).toBe('Dimanche 4 octobre')
  })

  it('montre les chiffres d’une séance en tuiles', () => {
    const session = climbSession('a', '2026-10-10', [
      ['bleu', 'flash'],
      ['rouge', 'sent'],
      ['noir', 'failed'],
    ])
    expect(climbTiles(summarize(session.boulders, VA), 95)).toEqual([
      { label: 'Durée', value: '1 h 35' },
      { label: 'Blocs réussis', value: '2 sur 3' },
      { label: 'Flash', value: '1' },
      { label: 'Meilleur bloc', value: 'Rouge' },
    ])
    expect(climbTiles(summarize([], VA), null)).toEqual([
      { label: 'Blocs réussis', value: '0' },
      { label: 'Flash', value: '0' },
      { label: 'Meilleur bloc', value: '—' },
    ])
  })
})

describe('adresses et regroupements', () => {
  it('ouvre une séance en direct ou dans l’historique', () => {
    expect(climbPath({ id: 'a', status: 'active' })).toBe('/climbing/session/a')
    expect(climbPath({ id: 'a', status: 'done' })).toBe('/climbing/history/a')
  })

  it('garde un niveau supprimé lisible', () => {
    expect(shownGrade(VA, 'bleu')).toMatchObject({ label: 'Bleu' })
    expect(shownGrade(VA, 'or')).toMatchObject({ key: 'or', label: 'Niveau supprimé', color: '#71717a' })
    expect(shownGrade(null, 'bleu').label).toBe('Niveau supprimé')
  })

  it('calcule le début d’une période qui finit aujourd’hui', () => {
    expect(periodStart('30', '2026-10-30')).toBe('2026-10-01')
    expect(periodStart('90', '2026-10-11')).toBe('2026-07-14')
    expect(periodStart('all', '2026-10-11')).toBeNull()
  })

  it('regroupe les séances par mois, dans l’ordre reçu', () => {
    const months = groupClimbsByMonth([
      climbSession('c', '2026-10-10'),
      climbSession('b', '2026-10-03'),
      climbSession('a', '2026-09-26'),
    ])
    expect(months.map((m) => [m.key, m.title, m.sessions.map((s) => s.id)])).toEqual([
      ['2026-10', 'Octobre 2026', ['c', 'b']],
      ['2026-09', 'Septembre 2026', ['a']],
    ])
    expect(groupClimbsByMonth([])).toEqual([])
  })
})
