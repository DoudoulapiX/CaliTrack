import { overallLevel, type LevelTestValues } from '@/content/level-test'
import { nowISO, today, type ISODate } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import { defaultProfile } from './defaults'
import { profileSchema } from './schema'
import type { Profile } from './types'

/** Ce que l'utilisateur peut modifier dans son profil. */
export type ProfileDraft = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>

export function draftFromProfile(profile: Profile): ProfileDraft {
  return {
    firstName: profile.firstName,
    birthYear: profile.birthYear,
    sex: profile.sex,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    experience: profile.experience,
    focuses: [...profile.focuses],
    targetSkills: [...profile.targetSkills],
    sessionsPerWeek: profile.sessionsPerWeek,
    sessionMinutes: profile.sessionMinutes,
    trainingDays: [...profile.trainingDays],
    climbingDays: [...profile.climbingDays],
    levelTest: profile.levelTest,
  }
}

/** Nettoie un brouillon : textes sans espaces en trop, listes sans doublon, jours triés. */
export function normalizeProfileDraft(draft: ProfileDraft): ProfileDraft {
  const trainingDays = [...new Set(draft.trainingDays)].sort((a, b) => a - b)
  return {
    ...draft,
    firstName: draft.firstName.trim(),
    focuses: [...new Set(draft.focuses)],
    targetSkills: [...new Set(draft.targetSkills)],
    trainingDays,
    climbingDays: [...new Set(draft.climbingDays)].sort((a, b) => a - b),
    // Les jours choisis fixent le nombre de séances par semaine.
    sessionsPerWeek: trainingDays.length > 0 ? trainingDays.length : draft.sessionsPerWeek,
  }
}

/** Erreur à corriger avant d'enregistrer, ou null. */
export function profileDraftError(draft: ProfileDraft): string | null {
  if (draft.focuses.length === 0) return 'Choisis au moins un objectif.'
  if (draft.trainingDays.length === 0) return 'Choisis au moins un jour d’entraînement.'
  return null
}

export function profileFromDraft(draft: ProfileDraft, current: Profile, now: string = nowISO()): Profile {
  return profileSchema.parse({
    ...current,
    ...normalizeProfileDraft(draft),
    id: 'me',
    updatedAt: now,
  })
}

export async function saveProfile(draft: ProfileDraft, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.profile, async () => {
    const current = (await database.profile.get('me')) ?? defaultProfile()
    await database.profile.put(profileFromDraft(draft, current))
  })
}

/** Enregistre un test de niveau ; le niveau du profil suit le résultat. */
export async function saveLevelTest(
  values: LevelTestValues,
  date: ISODate = today(),
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.profile, async () => {
    const current = (await database.profile.get('me')) ?? defaultProfile()
    const experience = overallLevel(values) ?? current.experience
    await database.profile.put(
      profileSchema.parse({ ...current, levelTest: { date, ...values }, experience, updatedAt: nowISO() }),
    )
  })
}
