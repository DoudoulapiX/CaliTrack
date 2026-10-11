import type { Program, ProgramSession } from '@/db/types'
import { deloadSets, isDeloadWeek, programWeek } from './schedule'

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
})
