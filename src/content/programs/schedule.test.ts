import type { Program, ProgramSession } from '@/db/types'
import { deloadSets, isDeloadWeek, nextSession, programWeek, sessionsForDate, weekPlan } from './schedule'

const session = (id: string, weekdays: ProgramSession['weekdays']): ProgramSession => ({
  id,
  name: id,
  emphasis: 'full',
  weekdays,
  blocks: [],
})

// Le programme commence un mercredi : sa première semaine va du lundi 12 au dimanche 18 octobre 2026.
const program: Pick<Program, 'sessions' | 'startDate' | 'deloadEveryWeeks'> = {
  sessions: [session('A', [1, 4]), session('B', [3])],
  startDate: '2026-10-14',
  deloadEveryWeeks: 4,
}

describe('calendrier du programme', () => {
  it('compte les semaines du lundi au dimanche', () => {
    expect(programWeek(program, '2026-10-12')).toBe(1)
    expect(programWeek(program, '2026-10-18')).toBe(1)
    expect(programWeek(program, '2026-10-19')).toBe(2)
    expect(programWeek(program, '2026-11-09')).toBe(5)
    expect(programWeek(program, '2026-10-05')).toBe(0)
  })

  it('allège une semaine sur N', () => {
    expect(isDeloadWeek(program, '2026-10-12')).toBe(false)
    expect(isDeloadWeek(program, '2026-11-02')).toBe(true) // semaine 4
    expect(isDeloadWeek(program, '2026-11-09')).toBe(false)
    expect(isDeloadWeek(program, '2026-11-30')).toBe(true) // semaine 8
    expect(isDeloadWeek({ ...program, deloadEveryWeeks: null }, '2026-11-02')).toBe(false)
  })

  it('divise les séries par deux en semaine allégée', () => {
    expect([1, 2, 3, 4, 5].map(deloadSets)).toEqual([1, 1, 2, 2, 3])
  })

  it('trouve les séances d’un jour, pas avant le début', () => {
    expect(sessionsForDate(program, '2026-10-15').map((s) => s.id)).toEqual(['A']) // jeudi
    expect(sessionsForDate(program, '2026-10-14').map((s) => s.id)).toEqual(['B']) // mercredi
    expect(sessionsForDate(program, '2026-10-12')).toEqual([]) // lundi, avant le début
    expect(sessionsForDate(program, '2026-10-17')).toEqual([]) // samedi
  })

  it('donne la prochaine séance', () => {
    expect(nextSession(program, '2026-10-10')).toMatchObject({ date: '2026-10-14', session: { id: 'B' } })
    expect(nextSession(program, '2026-10-16')).toMatchObject({ date: '2026-10-19', session: { id: 'A' } })
    expect(nextSession({ ...program, sessions: [] }, '2026-10-16')).toBeNull()
  })

  it('montre la semaine type avec l’escalade', () => {
    const week = weekPlan(program, [2, 6])
    expect(week.map((d) => [d.weekday, d.sessions.map((s) => s.id), d.climbing])).toEqual([
      [1, ['A'], false],
      [2, [], true],
      [3, ['B'], false],
      [4, ['A'], false],
      [5, [], false],
      [6, [], true],
      [7, [], false],
    ])
  })
})
