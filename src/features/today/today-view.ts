import { itemKind, type Agenda, type AgendaItem } from '@/content/calendar/agenda'
import { compareSessions } from '@/content/climbing/session'
import { recordsBeaten as climbRecordsBeaten, type ClimbRecord } from '@/content/climbing/stats'
import { recordHitsSince, type RecordHit } from '@/content/workouts/records'
import type { BodyMetric, ClimbingSession, GradeScale, Workout } from '@/db/types'
import { addDaysISO, diffDays, type ISODate } from '@/lib/dates'
import { frenchSpacing, keepTogether, lowerFirst } from '@/lib/typography'
import { formatBodyWeight, kgToUnit, type WeightUnit } from '@/lib/units'
import { dayLabel, shortDate } from '@/features/goals/goal-view'
import { climbPath } from '@/features/climbing/climb-view'
import { historyPath, workoutPath } from '@/features/workout/useWorkouts'

/* Ce que montrent les cartes de l'écran Aujourd'hui. */

/** Le jour du calendrier, ouvert sur une date. */
export function calendarDayPath(date: ISODate): string {
  return `/calendar?jour=${date}`
}

/**
 * Ce que la carte « Au programme » liste sous la carte de la séance du jour : escalade, cardio,
 * séances perso, séances faites. La carte de la séance montre déjà les séances du programme, la séance
 * en cours et, quand il n'en reste pas à faire aujourd'hui, la séance faite.
 */
export function todayRows(
  items: readonly AgendaItem[],
  { hasProgram, workoutActive }: { hasProgram: boolean; workoutActive: boolean },
): AgendaItem[] {
  const cardShowsDone =
    hasProgram &&
    !workoutActive &&
    !items.some((item) => item.type === 'program' && item.status === 'planned')
  return items.filter((item) => {
    if (item.type === 'program') return false
    if (item.type === 'workout') return item.status !== 'active' && !cardShowsDone
    return true
  })
}

/** Où mène une ligne de la journée : la séance elle-même, sinon le jour dans le calendrier. */
export function rowPath(item: AgendaItem): string {
  switch (item.type) {
    case 'workout':
      return item.status === 'active' ? workoutPath(item.workout.id) : historyPath(item.workout.id)
    case 'climb':
      return climbPath(item.climb)
    case 'event':
    case 'occurrence':
      return item.climb ? climbPath(item.climb) : calendarDayPath(item.date)
    case 'program':
      return calendarDayPath(item.date)
  }
}

/** De l'escalade prévue ce jour-là et pas encore notée. */
export function climbingPlanned(items: readonly AgendaItem[]): boolean {
  return items.some(
    (item) =>
      (item.type === 'event' || item.type === 'occurrence') &&
      itemKind(item) === 'climbing' &&
      item.status === 'planned' &&
      item.climb === null,
  )
}

export interface WeekCounts {
  /** Séances du programme de la semaine (sans celles passées). */
  planned: number
  /** Celles qui sont faites. */
  done: number
  /** Séances faites en dehors du programme. */
  free: number
  /** Séances d'escalade faites. */
  climbs: number
  /** Cardio et séances perso faits. */
  other: number
}

/** Ce qui est prévu et fait sur des jours donnés (une semaine). */
export function weekCounts(agenda: Agenda, dates: readonly ISODate[]): WeekCounts {
  const counts: WeekCounts = { planned: 0, done: 0, free: 0, climbs: 0, other: 0 }
  for (const date of dates) {
    for (const item of agenda.get(date) ?? []) {
      if (item.type === 'program') {
        if (item.status !== 'skipped') counts.planned++
        if (item.status === 'done') counts.done++
        continue
      }
      if (item.status !== 'done') continue
      if (item.type === 'workout') {
        // Une séance qui remplit celle du programme d'un jour de la semaine compte déjà avec elle.
        if (item.countsFor === null || !dates.includes(item.countsFor)) counts.free++
        continue
      }
      const kind = itemKind(item)
      if (kind === 'climbing') counts.climbs++
      else if (kind === 'cardio' || kind === 'custom') counts.other++
    }
  }
  return counts
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${String(count)} ${count > 1 ? pluralForm : singular}`
}

/** « 2 séances faites sur 4 » (null sans séance du programme cette semaine). */
export function programLine({ planned, done }: Pick<WeekCounts, 'planned' | 'done'>): string | null {
  if (planned === 0) return null
  return `${plural(done, 'séance faite', 'séances faites')} sur ${String(planned)}`
}

/** « 1 séance libre », « 2 séances d’escalade », « 1 autre activité ». */
export function extrasLines({
  free,
  climbs,
  other,
}: Pick<WeekCounts, 'free' | 'climbs' | 'other'>): string[] {
  return [
    free > 0 ? plural(free, 'séance libre', 'séances libres') : null,
    climbs > 0 ? plural(climbs, 'séance d’escalade', 'séances d’escalade') : null,
    other > 0 ? plural(other, 'autre activité', 'autres activités') : null,
  ].filter((line) => line !== null)
}

export interface WeighIn {
  date: ISODate
  kg: number
}

/** Les pesées, de la plus ancienne à la plus récente. */
export function weighInsOf(metrics: readonly BodyMetric[]): WeighIn[] {
  return metrics
    .flatMap((metric) => (metric.weightKg === null ? [] : [{ date: metric.date, kg: metric.weightKg }]))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface WeightTrend {
  /** Écart entre la dernière pesée et la première de la période (positif : pris). */
  deltaKg: number
  /** Le jour de cette première pesée. */
  since: ISODate
}

/** Évolution du poids sur les derniers jours : de la première pesée de la période à la dernière. */
export function weightTrend(points: readonly WeighIn[], today: ISODate, days = 30): WeightTrend | null {
  const from = addDaysISO(today, -days)
  const index = points.findIndex((point) => point.date >= from)
  const first = points[index]
  const last = points.at(-1)
  if (!first || !last || index === points.length - 1) return null
  return { deltaKg: last.kg - first.kg, since: first.date }
}

/** « −1,2 kg depuis le 12 septembre », « Stable depuis le 12 septembre ». */
export function trendLine(trend: WeightTrend, unit: WeightUnit, today: ISODate): string {
  // Le poids et la date ne se coupent pas en fin de ligne.
  const since = `depuis le ${keepTogether(shortDate(trend.since, today))}`
  const shown = Math.round(kgToUnit(Math.abs(trend.deltaKg), unit) * 10) / 10
  if (shown === 0) return `Stable ${since}`
  // Vrai signe moins (U+2212), lu « moins ».
  const delta = keepTogether(formatBodyWeight(Math.abs(trend.deltaKg), unit))
  return `${trend.deltaKg > 0 ? '+' : '\u2212'}${delta} ${since}`
}

/** D'où vient le poids affiché : « Dernière pesée : hier », « Poids de ton profil ». */
export function weightSource(last: WeighIn | null, profileKg: number | null, today: ISODate): string {
  if (last) return frenchSpacing(`Dernière pesée : ${keepTogether(lowerFirst(dayLabel(last.date, today)))}`)
  return profileKg === null ? 'Aucune pesée notée' : 'Poids de ton profil, aucune pesée notée'
}

/**
 * Les points d'une petite courbe des pesées d'une période, dans un cadre de la taille donnée : « x,y »
 * séparés d'espaces (null : moins de deux pesées).
 */
export function sparklinePoints(
  points: readonly WeighIn[],
  from: ISODate,
  to: ISODate,
  width: number,
  height: number,
): string | null {
  const shown = points.filter((point) => point.date >= from && point.date <= to)
  if (shown.length < 2) return null
  const span = Math.max(1, diffDays(to, from))
  const values = shown.map((point) => point.kg)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const round = (value: number) => Math.round(value * 10) / 10
  return shown
    .map((point) => {
      const x = (diffDays(point.date, from) / span) * width
      const y = max === min ? height / 2 : height - ((point.kg - min) / (max - min)) * height
      return `${String(round(x))},${String(round(y))}`
    })
    .join(' ')
}

export type RecentRecord =
  | { type: 'workout'; key: string; date: ISODate; at: string; hit: RecordHit }
  | { type: 'climb'; key: string; date: ISODate; at: string; session: ClimbingSession; record: ClimbRecord }

/**
 * Records battus depuis un jour donné, le plus récent d'abord : en séance (le dernier de chaque
 * exercice et sorte de record) et en escalade (le dernier de chaque sorte, par échelle).
 */
export function recentRecords(
  workouts: readonly Workout[],
  climbs: readonly ClimbingSession[],
  scales: readonly GradeScale[],
  from: ISODate,
): RecentRecord[] {
  const startedAt = new Map(workouts.map((workout) => [workout.id, workout.startedAt]))
  const records: RecentRecord[] = recordHitsSince(workouts, from).map((hit) => ({
    type: 'workout',
    key: `seance-${hit.exerciseId}-${hit.kind}`,
    date: hit.entry.date,
    at: startedAt.get(hit.entry.workoutId) ?? hit.entry.date,
    hit,
  }))

  const latestClimb = new Map<string, RecentRecord>()
  const recent = climbs.filter((s) => s.status === 'done' && s.date >= from).sort(compareSessions)
  for (const session of recent) {
    const scale = scales.find((s) => s.id === session.scaleId)
    if (!scale) continue
    for (const record of climbRecordsBeaten(session, climbs, scale)) {
      const key = `escalade-${scale.id}-${record.kind}`
      latestClimb.set(key, { type: 'climb', key, date: session.date, at: session.startedAt, session, record })
    }
  }
  // Tri stable : les records d'une même séance restent dans leur ordre.
  return [...records, ...latestClimb.values()].sort((a, b) => b.at.localeCompare(a.at))
}
