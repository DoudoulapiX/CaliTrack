import { compareSessions } from '@/content/climbing/session'
import { builtInScale, VERTICAL_ART_SCALE_ID } from '@/content/grades'
import { nowISO } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { db as defaultDb, type CaliTrackDB } from './db'
import { climbingSessionSchema, gradeScaleSchema } from './schema'
import type { ClimbingSession, Grade, GradeScale } from './types'

/*
 * Séances d'escalade et échelles de cotation. Une seule séance d'escalade est en cours à la fois.
 */

export class ClimbInProgressError extends Error {
  readonly active: ClimbingSession

  constructor(active: ClimbingSession) {
    super('Une séance d’escalade est déjà en cours.')
    this.name = 'ClimbInProgressError'
    this.active = active
  }
}

/** La séance d'escalade en cours, s'il y en a une. */
export async function getActiveClimb(
  database: CaliTrackDB = defaultDb,
): Promise<ClimbingSession | undefined> {
  return database.climbingSessions.where('status').equals('active').first()
}

/** Enregistre une nouvelle séance (vérifiée) ; une séance en cours est refusée s'il y en a déjà une. */
export async function addClimb(
  session: ClimbingSession,
  database: CaliTrackDB = defaultDb,
): Promise<ClimbingSession> {
  const valid = climbingSessionSchema.parse(session)
  await database.transaction('rw', database.climbingSessions, async () => {
    if (valid.status === 'active') {
      const active = await getActiveClimb(database)
      if (active && active.id !== valid.id) throw new ClimbInProgressError(active)
    }
    await database.climbingSessions.put(valid)
  })
  return valid
}

/** Modifie une séance à partir de sa version enregistrée, d'un seul tenant. */
export async function updateClimb(
  id: string,
  change: (session: ClimbingSession) => ClimbingSession,
  database: CaliTrackDB = defaultDb,
): Promise<ClimbingSession> {
  return database.transaction('rw', database.climbingSessions, async () => {
    const current = await database.climbingSessions.get(id)
    if (!current) throw new Error('Séance introuvable.')
    const next = climbingSessionSchema.parse({ ...change(current), id, updatedAt: nowISO() })
    await database.climbingSessions.put(next)
    return next
  })
}

export async function deleteClimb(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.climbingSessions.delete(id)
}

/** Toutes les séances, la plus récente d'abord. */
export async function listClimbs(database: CaliTrackDB = defaultDb): Promise<ClimbingSession[]> {
  const sessions = await database.climbingSessions.toArray()
  return sessions.sort((a, b) => compareSessions(b, a))
}

/* ------------------------------------------------------------------ */
/* Échelles de cotation                                                */
/* ------------------------------------------------------------------ */

/** Combien de blocs et d'objectifs utilisent une échelle (ou l'un de ses niveaux). */
export async function gradeUsage(
  scaleId: string,
  gradeKey: string | null,
  database: CaliTrackDB = defaultDb,
): Promise<{ boulders: number; sessions: number; goals: number }> {
  const sessions = await database.climbingSessions.filter((s) => s.scaleId === scaleId).toArray()
  const goals = await database.goals
    .where('kind')
    .equals('climbing')
    .filter((g) => g.scaleId === scaleId && (gradeKey === null || g.gradeKey === gradeKey))
    .count()
  let boulders = 0
  let used = 0
  for (const session of sessions) {
    const count =
      gradeKey === null
        ? session.boulders.length
        : session.boulders.filter((b) => b.gradeKey === gradeKey).length
    boulders += count
    if (gradeKey === null || count > 0) used++
  }
  return { boulders, sessions: used, goals }
}

export async function saveGradeScale(
  scale: GradeScale,
  database: CaliTrackDB = defaultDb,
): Promise<GradeScale> {
  const valid = gradeScaleSchema.parse(scale)
  await database.gradeScales.put(valid)
  return valid
}

/**
 * Supprime une échelle créée dans l'appli, si aucune séance ni aucun objectif ne l'utilise. Si c'était
 * l'échelle utilisée, on revient à celle d'origine.
 */
export async function deleteGradeScale(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.transaction(
    'rw',
    [database.gradeScales, database.climbingSessions, database.goals, database.settings],
    async () => {
      const scale = await database.gradeScales.get(id)
      if (!scale) return
      if (scale.builtIn)
        throw new Error(
          frenchSpacing('Cette échelle vient avec l’appli : on peut la modifier, pas la supprimer.'),
        )
      const usage = await gradeUsage(id, null, database)
      if (usage.sessions > 0 || usage.goals > 0) {
        throw new Error(
          frenchSpacing(
            'Des séances ou des objectifs utilisent cette échelle : elle ne peut pas être supprimée.',
          ),
        )
      }
      await database.gradeScales.delete(id)
      const settings = await database.settings.get('app')
      if (settings?.activeGradeScaleId === id) {
        const fallback =
          (await database.gradeScales.get(VERTICAL_ART_SCALE_ID)) ??
          (await database.gradeScales.toArray()).find((s) => s.builtIn)
        if (fallback)
          await database.settings.update('app', { activeGradeScaleId: fallback.id, updatedAt: nowISO() })
      }
    },
  )
}

/**
 * Revient aux niveaux d'origine d'une échelle fournie avec l'appli. Les niveaux ajoutés depuis et
 * déjà utilisés sont gardés à la fin (les blocs notés ne perdent pas leur niveau).
 */
export async function resetGradeScale(id: string, database: CaliTrackDB = defaultDb): Promise<GradeScale> {
  const original = builtInScale(id)
  if (!original) throw new Error('Échelle introuvable.')
  return database.transaction(
    'rw',
    [database.gradeScales, database.climbingSessions, database.goals],
    async () => {
      const current = await database.gradeScales.get(id)
      const kept: Grade[] = []
      for (const grade of current?.grades ?? []) {
        if (original.grades.some((g) => g.key === grade.key)) continue
        const usage = await gradeUsage(id, grade.key, database)
        if (usage.boulders > 0 || usage.goals > 0) kept.push(grade)
      }
      return saveGradeScale({ ...original, grades: [...original.grades, ...kept] }, database)
    },
  )
}
