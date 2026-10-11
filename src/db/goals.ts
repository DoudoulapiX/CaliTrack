import { skillGoal } from '@/content/goals/create'
import { PROFILE_LIMITS } from '@/content/profile'
import { skillFor } from '@/content/skills'
import { nowISO, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { db as defaultDb, type CaliTrackDB } from './db'
import { bodyMetricSchema, goalSchema, profileSchema } from './schema'
import type { BodyMetric, Goal } from './types'

/* ------------------------------------------------------------------ */
/* Objectifs                                                           */
/* ------------------------------------------------------------------ */

/** Enregistre un objectif (vérifié). */
export async function saveGoal(goal: Goal, database: CaliTrackDB = defaultDb): Promise<Goal> {
  const valid = goalSchema.parse({ ...goal, updatedAt: nowISO() })
  await database.goals.put(valid)
  return valid
}

export async function deleteGoal(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.goals.delete(id)
}

/**
 * Crée un objectif pour chaque figure visée qui n'en a pas encore (premier lancement), affiché sur
 * l'écran d'accueil.
 */
export async function addSkillGoals(
  skillIds: readonly string[],
  exerciseName: (id: string) => string,
  database: CaliTrackDB = defaultDb,
): Promise<Goal[]> {
  return database.transaction('rw', database.goals, async () => {
    const existing = await database.goals.where('kind').equals('skill').toArray()
    const followed = new Set(existing.filter((g) => !g.archived).map((g) => g.skillId))
    const now = nowISO()
    const goals = [...new Set(skillIds)].flatMap((id) => {
      const skill = skillFor(id)
      if (!skill || followed.has(id)) return []
      return [
        goalSchema.parse(
          skillGoal(skill, { title: '', deadline: null, pinned: true }, exerciseName, now, newId),
        ),
      ]
    })
    await database.goals.bulkPut(goals)
    return goals
  })
}

/* ------------------------------------------------------------------ */
/* Pesées                                                              */
/* ------------------------------------------------------------------ */

/** Le profil garde le poids de la pesée la plus récente. */
async function syncProfileWeight(database: CaliTrackDB): Promise<void> {
  const latest = (await database.bodyMetrics.orderBy('date').reverse().toArray()).find(
    (m) => m.weightKg !== null,
  )
  const profile = await database.profile.get('me')
  if (!latest || !profile || profile.weightKg === latest.weightKg) return
  await database.profile.put(
    profileSchema.parse({ ...profile, weightKg: latest.weightKg, updatedAt: nowISO() }),
  )
}

/** Note son poids d'un jour (une pesée par jour : la nouvelle remplace l'ancienne). */
export async function logWeight(
  date: ISODate,
  kg: number,
  database: CaliTrackDB = defaultDb,
): Promise<BodyMetric> {
  const { min, max } = PROFILE_LIMITS.weightKg
  if (!(kg >= min - 0.5 && kg <= max + 0.5)) throw new Error(`Poids impossible : ${String(kg)} kg`)
  return database.transaction('rw', database.bodyMetrics, database.profile, async () => {
    const existing = await database.bodyMetrics.where('date').equals(date).first()
    const metric = bodyMetricSchema.parse(
      existing
        ? { ...existing, weightKg: kg }
        : { id: newId(), date, weightKg: kg, bodyFatPct: null, waistCm: null, note: '', createdAt: nowISO() },
    )
    await database.bodyMetrics.put(metric)
    await syncProfileWeight(database)
    return metric
  })
}

export async function deleteBodyMetric(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.bodyMetrics, database.profile, async () => {
    await database.bodyMetrics.delete(id)
    await syncProfileWeight(database)
  })
}
