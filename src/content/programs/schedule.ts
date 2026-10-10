import type { Program, ProgramSession } from '@/db/types'
import {
  addDaysISO,
  diffDays,
  startOfWeekISO,
  weekdayOf,
  WEEKDAYS,
  type ISODate,
  type Weekday,
} from '@/lib/dates'

/** Semaine du programme : 1 pour celle où il commence (semaines du lundi au dimanche). */
export function programWeek(program: Pick<Program, 'startDate'>, date: ISODate): number {
  return Math.floor(diffDays(startOfWeekISO(date), startOfWeekISO(program.startDate)) / 7) + 1
}

/** Semaine allégée : la N-ième, la 2N-ième… semaine du programme. */
export function isDeloadWeek(
  program: Pick<Program, 'startDate' | 'deloadEveryWeeks'>,
  date: ISODate,
): boolean {
  const every = program.deloadEveryWeeks
  if (every === null) return false
  const week = programWeek(program, date)
  return week >= every && week % every === 0
}

/** Séries d'un exercice pendant une semaine allégée : environ la moitié. */
export function deloadSets(sets: number): number {
  return Math.max(1, Math.ceil(sets / 2))
}

/** Séances prévues ce jour-là (aucune avant le début du programme). */
export function sessionsForDate(
  program: Pick<Program, 'sessions' | 'startDate'>,
  date: ISODate,
): ProgramSession[] {
  if (date < program.startDate) return []
  const weekday = weekdayOf(date)
  return program.sessions.filter((session) => session.weekdays.includes(weekday))
}

export interface DayPlan {
  weekday: Weekday
  sessions: ProgramSession[]
  climbing: boolean
}

/** La semaine type : séances et escalade, du lundi au dimanche. */
export function weekPlan(program: Pick<Program, 'sessions'>, climbingDays: readonly Weekday[]): DayPlan[] {
  return WEEKDAYS.map((weekday) => ({
    weekday,
    sessions: program.sessions.filter((session) => session.weekdays.includes(weekday)),
    climbing: climbingDays.includes(weekday),
  }))
}

/** Prochaine séance prévue à partir d'un jour (inclus), dans les 7 jours. */
export function nextSession(
  program: Pick<Program, 'sessions' | 'startDate'>,
  from: ISODate,
): { date: ISODate; session: ProgramSession } | null {
  const start = from < program.startDate ? program.startDate : from
  for (let i = 0; i < 7; i++) {
    const date = addDaysISO(start, i)
    const [session] = sessionsForDate(program, date)
    if (session) return { date, session }
  }
  return null
}
