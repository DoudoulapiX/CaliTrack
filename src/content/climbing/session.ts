import type { BoulderAttempt, BoulderResult, ClimbingSession, ClimbStyle } from '@/db/types'
import { localDateOf, minutesBetween, type ISODate } from '@/lib/dates'

/*
 * Séances d'escalade : chaque bloc tenté est noté avec son niveau (la couleur de la salle), réussi
 * ou pas, et le nombre d'essais. En direct à la salle (la séance est « en cours »), ou après coup.
 */

/** Un bloc réussi, au premier essai (flash) ou après plusieurs. */
export function isSend(result: BoulderResult): boolean {
  return result === 'flash' || result === 'sent'
}

export const MAX_ATTEMPTS = 99

/** Ce que l'on saisit pour un bloc. */
export interface BoulderInput {
  gradeKey: string
  sent: boolean
  attempts: number
  /** Pas réussi, mais à retenter une prochaine fois. */
  project: boolean
  styles: ClimbStyle[]
  note: string
}

/** Un bloc réussi du premier coup est un flash. */
export function resultOf(input: Pick<BoulderInput, 'sent' | 'attempts' | 'project'>): BoulderResult {
  if (input.sent) return input.attempts <= 1 ? 'flash' : 'sent'
  return input.project ? 'project' : 'failed'
}

export function newBoulderInput(gradeKey: string): BoulderInput {
  return { gradeKey, sent: true, attempts: 1, project: false, styles: [], note: '' }
}

export function inputOf(boulder: BoulderAttempt): BoulderInput {
  return {
    gradeKey: boulder.gradeKey,
    sent: isSend(boulder.result),
    attempts: boulder.attempts,
    project: boulder.result === 'project',
    styles: [...boulder.styles],
    note: boulder.note,
  }
}

function clampAttempts(attempts: number): number {
  return Math.min(MAX_ATTEMPTS, Math.max(1, Math.round(attempts)))
}

/** Le bloc à enregistrer (nouveau, ou modifié : il garde son identifiant et son heure). */
export function boulderFrom(input: BoulderInput, id: string, createdAt: string): BoulderAttempt {
  const attempts = clampAttempts(input.attempts)
  return {
    id,
    gradeKey: input.gradeKey,
    result: resultOf({ ...input, attempts }),
    attempts,
    styles: [...new Set(input.styles)],
    note: input.note.trim(),
    createdAt,
  }
}

export function withBoulder(session: ClimbingSession, boulder: BoulderAttempt): ClimbingSession {
  return { ...session, boulders: [...session.boulders, boulder] }
}

export function withBoulderChanged(session: ClimbingSession, boulder: BoulderAttempt): ClimbingSession {
  if (!session.boulders.some((b) => b.id === boulder.id)) throw new Error('Bloc introuvable.')
  return { ...session, boulders: session.boulders.map((b) => (b.id === boulder.id ? boulder : b)) }
}

export function withoutBoulder(session: ClimbingSession, boulderId: string): ClimbingSession {
  return { ...session, boulders: session.boulders.filter((b) => b.id !== boulderId) }
}

export interface SessionPlace {
  gym: string
  scaleId: string
}

/** Séance commencée maintenant, notée bloc après bloc. */
export function liveSession(place: SessionPlace, now: string, id: string): ClimbingSession {
  return {
    id,
    date: localDateOf(now),
    status: 'active',
    startedAt: now,
    endedAt: null,
    gym: place.gym.trim(),
    scaleId: place.scaleId,
    durationMin: null,
    rpe: null,
    notes: '',
    boulders: [],
    createdAt: now,
    updatedAt: now,
  }
}

/** Séance déjà faite, notée après coup : ses blocs s'ajoutent ensuite. */
export function pastSession(
  place: SessionPlace & { date: ISODate; durationMin: number | null },
  now: string,
  id: string,
): ClimbingSession {
  return {
    ...liveSession(place, now, id),
    date: place.date,
    status: 'done',
    endedAt: now,
    durationMin: place.durationMin,
  }
}

/** Au-delà, une séance est sans doute restée ouverte : sa durée se déduit de ses blocs. */
export const FORGOTTEN_AFTER_MIN = 300

/**
 * Durée proposée en fin de séance : le temps écoulé depuis le début. Une séance restée ouverte
 * (oubliée) s'arrête quelques minutes après son dernier bloc noté ; sans bloc, la durée reste à saisir.
 */
export function suggestedDurationMin(
  session: Pick<ClimbingSession, 'startedAt' | 'boulders'>,
  end: string,
): number | null {
  const elapsed = minutesBetween(session.startedAt, end)
  if (elapsed <= FORGOTTEN_AFTER_MIN) return Math.max(1, elapsed)
  const last = session.boulders.reduce<string | null>(
    (latest, b) => (latest === null || b.createdAt > latest ? b.createdAt : latest),
    null,
  )
  if (last === null) return null
  return Math.min(FORGOTTEN_AFTER_MIN, Math.max(1, minutesBetween(session.startedAt, last) + 5))
}

export interface FinishClimbInput {
  endedAt: string
  durationMin: number | null
  rpe: number | null
  notes: string
}

export function finishedSession(session: ClimbingSession, input: FinishClimbInput): ClimbingSession {
  return {
    ...session,
    status: 'done',
    endedAt: input.endedAt,
    durationMin: input.durationMin,
    rpe: input.rpe,
    notes: input.notes.trim(),
  }
}

/** Ordre chronologique des séances (jour, puis heure de début). */
export function compareSessions(
  a: Pick<ClimbingSession, 'date' | 'startedAt'>,
  b: Pick<ClimbingSession, 'date' | 'startedAt'>,
): number {
  return a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt)
}

/** Durée d'une séance en minutes : en cours, le temps écoulé ; terminée, la durée retenue. */
export function sessionMinutes(session: ClimbingSession, nowMs: number = Date.now()): number | null {
  if (session.status === 'active') {
    return Math.max(0, Math.floor((nowMs - Date.parse(session.startedAt)) / 60_000))
  }
  return session.durationMin
}
