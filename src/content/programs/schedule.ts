import type { Program } from '@/db/types'
import { diffDays, startOfWeekISO, type ISODate } from '@/lib/dates'

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
