import {
  addDaysISO,
  diffDays,
  formatClock,
  formatDuration,
  isISODate,
  isValidTime,
  monthGrid,
  rangeISO,
  relativeDayLabel,
  startOfWeekISO,
  weekDates,
  weekdayOf,
} from './dates'

describe('dates', () => {
  it('valide les jours AAAA-MM-JJ', () => {
    expect(isISODate('2026-10-10')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('10/10/2026')).toBe(false)
  })

  it('calcule les jours de la semaine (lundi = 1)', () => {
    expect(weekdayOf('2026-10-10')).toBe(6) // samedi
    expect(weekdayOf('2026-10-11')).toBe(7) // dimanche
    expect(weekdayOf('2026-10-12')).toBe(1) // lundi
    expect(startOfWeekISO('2026-10-11')).toBe('2026-10-05')
    expect(weekDates('2026-10-10')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ])
  })

  it('ajoute des jours en traversant les changements d’heure', () => {
    expect(addDaysISO('2026-10-24', 2)).toBe('2026-10-26')
    expect(addDaysISO('2026-03-28', 2)).toBe('2026-03-30')
    expect(diffDays('2026-10-26', '2026-10-24')).toBe(2)
    expect(rangeISO('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ])
  })

  it('construit une grille de mois en semaines complètes', () => {
    const grid = monthGrid(2026, 9) // octobre 2026
    expect(grid.length % 7).toBe(0)
    expect(grid[0]).toBe('2026-09-28')
    expect(grid.at(-1)).toBe('2026-11-01')
    expect(grid).toContain('2026-10-31')
  })

  it('affiche des libellés relatifs', () => {
    expect(relativeDayLabel('2026-10-10', '2026-10-10')).toBe('aujourd’hui')
    expect(relativeDayLabel('2026-10-11', '2026-10-10')).toBe('demain')
    expect(relativeDayLabel('2026-10-09', '2026-10-10')).toBe('hier')
    expect(relativeDayLabel('2026-10-14', '2026-10-10')).toBe('mercredi 14 octobre')
  })

  it('formate les durées', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(90)).toBe('1 min 30 s')
    expect(formatDuration(120)).toBe('2 min')
    expect(formatDuration(3900)).toBe('1 h 05')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(0.2)).toBe('0:01')
  })

  it('valide les heures', () => {
    expect(isValidTime('07:30')).toBe(true)
    expect(isValidTime('24:00')).toBe(false)
    expect(isValidTime('7:30')).toBe(false)
  })
})
