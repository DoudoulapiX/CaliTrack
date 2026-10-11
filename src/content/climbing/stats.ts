import { gradeIndex } from '@/content/grades'
import type { BoulderAttempt, ClimbingSession, ClimbStyle, Grade, GradeScale } from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { CLIMB_STYLES } from './labels'
import { compareSessions, isSend } from './session'

/*
 * Statistiques d'escalade, recalculées à partir des séances : niveau atteint, pyramide des blocs
 * réussis, réussite par niveau, progression mois par mois. Les niveaux ne se comparent qu'à
 * l'intérieur d'une même échelle de cotation.
 */

export interface SessionSummary {
  /** Blocs notés, réussis ou pas. */
  boulders: number
  sends: number
  flashes: number
  /** Essais au total. */
  attempts: number
  /** Bloc réussi le plus dur (null : aucun, ou échelle inconnue). */
  hardest: Grade | null
  /** Bloc réussi au premier essai le plus dur. */
  hardestFlash: Grade | null
}

function harderOf(scale: GradeScale, current: Grade | null, key: string): Grade | null {
  const index = gradeIndex(scale, key)
  const grade = index >= 0 ? (scale.grades[index] ?? null) : null
  if (grade === null) return current
  if (current === null) return grade
  return index > gradeIndex(scale, current.key) ? grade : current
}

/** Les chiffres d'une liste de blocs (une séance, par exemple). */
export function summarize(boulders: readonly BoulderAttempt[], scale: GradeScale | null): SessionSummary {
  const summary: SessionSummary = {
    boulders: 0,
    sends: 0,
    flashes: 0,
    attempts: 0,
    hardest: null,
    hardestFlash: null,
  }
  for (const boulder of boulders) {
    summary.boulders++
    summary.attempts += boulder.attempts
    if (!isSend(boulder.result)) continue
    summary.sends++
    const flash = boulder.result === 'flash'
    if (flash) summary.flashes++
    if (!scale) continue
    summary.hardest = harderOf(scale, summary.hardest, boulder.gradeKey)
    if (flash) summary.hardestFlash = harderOf(scale, summary.hardestFlash, boulder.gradeKey)
  }
  return summary
}

/** Part des blocs réussis du premier coup, de 0 à 1 (null : aucun bloc réussi). */
export function flashRate(summary: Pick<SessionSummary, 'sends' | 'flashes'>): number | null {
  return summary.sends === 0 ? null : summary.flashes / summary.sends
}

export interface GradeStats {
  grade: Grade
  /** Blocs tentés à ce niveau. */
  tries: number
  sends: number
  flashes: number
  /** Essais sur les blocs réussis (moyenne d'essais par bloc réussi). */
  sendAttempts: number
}

/** Chiffres par niveau, du plus facile au plus dur (tous les niveaux de l'échelle). */
export function gradeStats(sessions: readonly ClimbingSession[], scale: GradeScale): GradeStats[] {
  const rows: GradeStats[] = scale.grades.map((grade) => ({
    grade,
    tries: 0,
    sends: 0,
    flashes: 0,
    sendAttempts: 0,
  }))
  const byKey = new Map(rows.map((row) => [row.grade.key, row]))
  for (const session of sessions) {
    if (session.scaleId !== scale.id) continue
    for (const boulder of session.boulders) {
      const row = byKey.get(boulder.gradeKey)
      if (!row) continue
      row.tries++
      if (!isSend(boulder.result)) continue
      row.sends++
      row.sendAttempts += boulder.attempts
      if (boulder.result === 'flash') row.flashes++
    }
  }
  return rows
}

/**
 * Pyramide des blocs réussis, du plus dur au plus facile : du niveau le plus facile réussi jusqu'au
 * plus dur, plus le niveau d'après (celui à aller chercher). Vide sans bloc réussi.
 */
export function pyramid(stats: readonly GradeStats[]): GradeStats[] {
  const first = stats.findIndex((row) => row.sends > 0)
  if (first < 0) return []
  const last = stats.findLastIndex((row) => row.sends > 0)
  return stats.slice(first, last + 2).reverse()
}

export interface BestSend {
  grade: Grade
  /** La première fois que ce niveau a été réussi. */
  date: ISODate
  sessionId: string
}

/** Le niveau le plus dur réussi (au premier essai seulement avec flashOnly), et quand. */
export function bestSend(
  sessions: readonly ClimbingSession[],
  scale: GradeScale,
  flashOnly = false,
): BestSend | null {
  let best: { index: number; date: ISODate; sessionId: string } | null = null
  const ordered = sessions.filter((s) => s.scaleId === scale.id).sort(compareSessions)
  for (const session of ordered) {
    for (const boulder of session.boulders) {
      if (flashOnly ? boulder.result !== 'flash' : !isSend(boulder.result)) continue
      const index = gradeIndex(scale, boulder.gradeKey)
      if (index < 0 || (best !== null && index <= best.index)) continue
      best = { index, date: session.date, sessionId: session.id }
    }
  }
  const grade = best === null ? undefined : scale.grades[best.index]
  return best && grade ? { grade, date: best.date, sessionId: best.sessionId } : null
}

export interface PeriodSummary {
  sessions: number
  boulders: number
  sends: number
  flashes: number
  /** Minutes grimpées (séances terminées dont la durée est connue). */
  minutes: number
}

/** Chiffres des séances depuis un jour donné (compris ; null : depuis toujours). */
export function periodSummary(sessions: readonly ClimbingSession[], from: ISODate | null): PeriodSummary {
  const summary: PeriodSummary = { sessions: 0, boulders: 0, sends: 0, flashes: 0, minutes: 0 }
  for (const session of sessions) {
    if (from !== null && session.date < from) continue
    const counts = summarize(session.boulders, null)
    summary.sessions++
    summary.boulders += counts.boulders
    summary.sends += counts.sends
    summary.flashes += counts.flashes
    if (session.status === 'done') summary.minutes += session.durationMin ?? 0
  }
  return summary
}

/** Séances depuis un jour donné (compris ; null : toutes). */
export function sessionsSince(sessions: readonly ClimbingSession[], from: ISODate | null): ClimbingSession[] {
  return from === null ? [...sessions] : sessions.filter((s) => s.date >= from)
}

export interface SessionColumn {
  session: ClimbingSession
  /** Blocs réussis par niveau, du plus facile au plus dur (niveaux réussis seulement). */
  segments: { grade: Grade; count: number }[]
  total: number
}

/** Blocs réussis séance par séance : les plus récentes, dans l'ordre chronologique. */
export function sessionColumns(
  sessions: readonly ClimbingSession[],
  scale: GradeScale,
  limit: number,
): SessionColumn[] {
  const ordered = sessions.filter((s) => s.scaleId === scale.id).sort(compareSessions)
  return ordered.slice(Math.max(0, ordered.length - limit)).map((session) => {
    const segments = gradeStats([session], scale)
      .filter((row) => row.sends > 0)
      .map((row) => ({ grade: row.grade, count: row.sends }))
    return { session, segments, total: segments.reduce((sum, s) => sum + s.count, 0) }
  })
}

export interface MonthStats {
  /** « 2026-10 ». */
  key: string
  year: number
  monthIndex: number
  sessions: number
  sends: number
  /** Bloc réussi le plus dur du mois. */
  hardest: Grade | null
}

/** Mois par mois, le plus récent d'abord (séances de cette échelle). */
export function monthlyStats(sessions: readonly ClimbingSession[], scale: GradeScale): MonthStats[] {
  const months = new Map<string, MonthStats>()
  for (const session of sessions) {
    if (session.scaleId !== scale.id) continue
    const key = session.date.slice(0, 7)
    let month = months.get(key)
    if (!month) {
      const [year = 0, monthNumber = 1] = key.split('-').map(Number)
      month = { key, year, monthIndex: monthNumber - 1, sessions: 0, sends: 0, hardest: null }
      months.set(key, month)
    }
    const counts = summarize(session.boulders, scale)
    month.sessions++
    month.sends += counts.sends
    if (counts.hardest) month.hardest = harderOf(scale, month.hardest, counts.hardest.key)
  }
  return [...months.values()].sort((a, b) => b.key.localeCompare(a.key))
}

export interface StyleStats {
  style: ClimbStyle
  tries: number
  sends: number
}

/** Blocs tentés et réussis par style (les styles notés seulement), les plus fréquents d'abord. */
export function styleStats(sessions: readonly ClimbingSession[]): StyleStats[] {
  const rows = new Map<ClimbStyle, StyleStats>()
  for (const session of sessions) {
    for (const boulder of session.boulders) {
      for (const style of boulder.styles) {
        let row = rows.get(style)
        if (!row) {
          row = { style, tries: 0, sends: 0 }
          rows.set(style, row)
        }
        row.tries++
        if (isSend(boulder.result)) row.sends++
      }
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.tries - a.tries || b.sends - a.sends || CLIMB_STYLES.indexOf(a.style) - CLIMB_STYLES.indexOf(b.style),
  )
}

export interface ClimbRecord {
  kind: 'hardest' | 'hardestFlash'
  grade: Grade
  /** Le meilleur niveau d'avant (null : premier bloc réussi, ou premier flash). */
  previous: Grade | null
}

/**
 * Records battus par une séance : niveau le plus dur réussi, et réussi au premier essai, comparés aux
 * séances d'avant dans la même échelle. Rien pour la toute première séance (rien à battre).
 */
export function recordsBeaten(
  session: ClimbingSession,
  sessions: readonly ClimbingSession[],
  scale: GradeScale,
): ClimbRecord[] {
  if (session.scaleId !== scale.id) return []
  const earlier = sessions.filter(
    (s) => s.id !== session.id && s.scaleId === scale.id && compareSessions(s, session) < 0,
  )
  if (earlier.length === 0) return []
  const before = summarize(
    earlier.flatMap((s) => s.boulders),
    scale,
  )
  const now = summarize(session.boulders, scale)
  const rank = (grade: Grade | null) => (grade === null ? -1 : gradeIndex(scale, grade.key))
  const records: ClimbRecord[] = []
  if (now.hardest && rank(now.hardest) > rank(before.hardest)) {
    records.push({ kind: 'hardest', grade: now.hardest, previous: before.hardest })
  }
  if (now.hardestFlash && rank(now.hardestFlash) > rank(before.hardestFlash)) {
    records.push({ kind: 'hardestFlash', grade: now.hardestFlash, previous: before.hardestFlash })
  }
  return records
}
