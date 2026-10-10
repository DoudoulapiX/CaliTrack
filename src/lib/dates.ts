import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

/** Date locale au format AAAA-MM-JJ (jamais de fuseau horaire : c'est un jour du calendrier). */
export type ISODate = string

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'Lun',
  2: 'Mar',
  3: 'Mer',
  4: 'Jeu',
  5: 'Ven',
  6: 'Sam',
  7: 'Dim',
}

export const WEEKDAY_LONG: Record<Weekday, string> = {
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
  7: 'dimanche',
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  return isValid(parseISO(value))
}

/** Convertit une Date en jour local AAAA-MM-JJ. */
export function toISODate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

/** Jour d'aujourd'hui (heure locale). */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now)
}

/** Interprète un jour AAAA-MM-JJ comme minuit heure locale. */
export function fromISODate(value: ISODate): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  return toISODate(addDays(fromISODate(value), days))
}

export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(fromISODate(a), fromISODate(b))
}

export function weekdayOf(value: ISODate): Weekday {
  const js = fromISODate(value).getDay() // 0 = dimanche
  return (js === 0 ? 7 : js) as Weekday
}

/** Lundi de la semaine contenant ce jour. */
export function startOfWeekISO(value: ISODate): ISODate {
  return addDaysISO(value, 1 - weekdayOf(value))
}

export function weekDates(value: ISODate): ISODate[] {
  const monday = startOfWeekISO(value)
  return WEEKDAYS.map((_, i) => addDaysISO(monday, i))
}

/** Les jours affichés dans une grille de mois (semaines complètes, lundi en premier). */
export function monthGrid(year: number, monthIndex: number): ISODate[] {
  const first = toISODate(new Date(year, monthIndex, 1))
  const last = toISODate(new Date(year, monthIndex + 1, 0))
  const start = startOfWeekISO(first)
  const end = addDaysISO(startOfWeekISO(last), 6)
  const days: ISODate[] = []
  for (let d = start; d <= end; d = addDaysISO(d, 1)) days.push(d)
  return days
}

export function rangeISO(from: ISODate, to: ISODate): ISODate[] {
  const days: ISODate[] = []
  for (let d = from; d <= to; d = addDaysISO(d, 1)) days.push(d)
  return days
}

export function formatDay(value: ISODate, pattern = 'EEEE d MMMM'): string {
  return format(fromISODate(value), pattern, { locale: fr })
}

export function formatDayShort(value: ISODate): string {
  return format(fromISODate(value), 'd MMM', { locale: fr })
}

export function formatMonth(year: number, monthIndex: number): string {
  return format(new Date(year, monthIndex, 1), 'MMMM yyyy', { locale: fr })
}

/** « aujourd'hui », « demain », « hier » ou la date. */
export function relativeDayLabel(value: ISODate, reference: ISODate = today()): string {
  const delta = diffDays(value, reference)
  if (delta === 0) return "aujourd'hui"
  if (delta === 1) return 'demain'
  if (delta === -1) return 'hier'
  return formatDay(value, 'EEEE d MMMM')
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Durée en secondes vers « 1 min 30 s », « 45 s », « 1 h 05 ». */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`
  if (m > 0) return sec > 0 ? `${m} min ${sec} s` : `${m} min`
  return `${sec} s`
}

/** Chrono « m:ss ». */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function nowISO(): string {
  return new Date().toISOString()
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}
