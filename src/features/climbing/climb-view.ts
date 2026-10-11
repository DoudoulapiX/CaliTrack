import { summarize, type SessionSummary } from '@/content/climbing/stats'
import { findGrade } from '@/content/grades'
import type { ClimbingSession, Grade, GradeScale } from '@/db/types'
import {
  addDaysISO,
  capitalize,
  formatDay,
  formatDuration,
  formatMonth,
  formatTimeOf,
  type ISODate,
} from '@/lib/dates'
import { NBSP } from '@/lib/typography'
import type { StatTile } from '@/features/workout/StatTiles'
import { rpeLabel } from '@/features/workout/workout-view'

/* Textes et adresses des écrans d'escalade. */

/** Écran d'une séance en cours (et son bilan juste après). */
export function climbLivePath(id: string): string {
  return `/climbing/session/${id}`
}

/** Une séance de l'historique. */
export function climbHistoryPath(id: string): string {
  return `/climbing/history/${id}`
}

/** L'écran où ouvrir une séance : en direct si elle est en cours, sinon dans l'historique. */
export function climbPath(session: Pick<ClimbingSession, 'id' | 'status'>): string {
  return session.status === 'active' ? climbLivePath(session.id) : climbHistoryPath(session.id)
}

/** Niveau montré pour un bloc dont le niveau a disparu de l'échelle. */
export const UNKNOWN_GRADE: Grade = { key: '', label: 'Niveau supprimé', color: '#71717a', font: '' }

/** Le niveau d'un bloc, tel qu'on l'affiche (même s'il a été supprimé de l'échelle). */
export function shownGrade(scale: GradeScale | null | undefined, key: string): Grade {
  return (scale ? findGrade(scale, key) : undefined) ?? { ...UNKNOWN_GRADE, key }
}

/** « 52 min », « 1 h 32 ». */
export function formatMinutes(minutes: number): string {
  return formatDuration(Math.max(1, Math.round(minutes)) * 60)
}

/** « 63 % ». */
export function formatPercent(ratio: number): string {
  return `${String(Math.round(ratio * 100))}${NBSP}%`
}

/** « 12 blocs réussis », « 7 réussis sur 9 », « Aucun bloc noté ». */
export function sendsLine({ boulders, sends }: Pick<SessionSummary, 'boulders' | 'sends'>): string {
  if (boulders === 0) return 'Aucun bloc noté'
  const plural = sends > 1 ? 's' : ''
  if (sends === boulders) return `${String(sends)} bloc${plural} réussi${plural}`
  return `${String(sends)} réussi${plural} sur ${String(boulders)}`
}

/** Chiffres d'une séance en tuiles : durée, blocs réussis, flashs, meilleur bloc. */
export function climbTiles(summary: SessionSummary, durationMin: number | null): StatTile[] {
  const tiles: StatTile[] = []
  if (durationMin !== null) tiles.push({ label: 'Durée', value: formatMinutes(durationMin) })
  tiles.push(
    {
      label: 'Blocs réussis',
      value:
        summary.sends === summary.boulders
          ? String(summary.sends)
          : `${String(summary.sends)} sur ${String(summary.boulders)}`,
    },
    { label: 'Flash', value: String(summary.flashes) },
    { label: 'Meilleur bloc', value: summary.hardest?.label ?? '—' },
  )
  return tiles
}

/** « Vertical’Art · 1 h 32 · 7 réussis sur 9 · Dur » : une séance en une ligne. */
export function climbSubtitle(session: ClimbingSession, withGym = true): string {
  const counts = summarize(session.boulders, null)
  const gym = withGym && session.gym !== '' ? session.gym : null
  if (session.status === 'active') {
    const noted = `${String(counts.boulders)} bloc${counts.boulders > 1 ? 's' : ''} noté${counts.boulders > 1 ? 's' : ''}`
    return [gym, 'En cours', noted].filter(Boolean).join(' · ')
  }
  return [
    gym,
    session.durationMin ? formatMinutes(session.durationMin) : null,
    sendsLine(counts),
    rpeLabel(session.rpe),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Séance suivie en direct (début et fin connus), pas notée après coup. */
function hasClock(session: ClimbingSession): boolean {
  return session.endedAt === null || session.endedAt !== session.startedAt
}

/** « Samedi 17 octobre · 18:05 – 19:37 » (sans les heures pour une séance notée après coup). */
export function climbDateLine(session: ClimbingSession): string {
  const day = capitalize(formatDay(session.date))
  if (!hasClock(session)) return day
  const end = session.endedAt ? ` – ${formatTimeOf(session.endedAt)}` : ''
  return `${day} · ${formatTimeOf(session.startedAt)}${end}`
}

export type StatsPeriod = '30' | '90' | '365' | 'all'

export const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: '30', label: '30 jours' },
  { value: '90', label: '3 mois' },
  { value: '365', label: '1 an' },
  { value: 'all', label: 'Tout' },
]

/** Premier jour d'une période qui se termine aujourd'hui (null : depuis toujours). */
export function periodStart(period: StatsPeriod, today: ISODate): ISODate | null {
  return period === 'all' ? null : addDaysISO(today, 1 - Number(period))
}

export interface ClimbMonth {
  key: string
  title: string
  sessions: ClimbingSession[]
}

/** Séances regroupées par mois, dans l'ordre reçu (la plus récente d'abord). */
export function groupClimbsByMonth(sessions: readonly ClimbingSession[]): ClimbMonth[] {
  const months: ClimbMonth[] = []
  for (const session of sessions) {
    const key = session.date.slice(0, 7)
    const last = months.at(-1)
    if (last?.key === key) {
      last.sessions.push(session)
    } else {
      const [year = 0, month = 1] = key.split('-').map(Number)
      months.push({ key, title: capitalize(formatMonth(year, month - 1)), sessions: [session] })
    }
  }
  return months
}
