import { EMPTY_LEVEL_TEST } from '@/content/level-test'
import { resetDb } from '@/test/db'
import { db } from './db'
import { defaultProfile } from './defaults'
import {
  draftFromProfile,
  normalizeProfileDraft,
  profileDraftError,
  saveLevelTest,
  saveProfile,
} from './profile'
import { ensureSeeded } from './seed'

describe('profil', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('nettoie le brouillon et déduit le nombre de séances des jours choisis', () => {
    const draft = draftFromProfile(defaultProfile())
    expect(
      normalizeProfileDraft({
        ...draft,
        firstName: ' Charles ',
        trainingDays: [5, 1, 3, 1],
        climbingDays: [6, 2],
        focuses: ['skills', 'skills'],
      }),
    ).toMatchObject({
      firstName: 'Charles',
      trainingDays: [1, 3, 5],
      climbingDays: [2, 6],
      focuses: ['skills'],
      sessionsPerWeek: 3,
    })
  })

  it('signale ce qui manque', () => {
    const draft = draftFromProfile(defaultProfile())
    expect(profileDraftError(draft)).toBeNull()
    expect(profileDraftError({ ...draft, focuses: [] })).toBe('Choisis au moins un objectif.')
    expect(profileDraftError({ ...draft, trainingDays: [] })).toMatch(/au moins un jour/)
  })

  it('enregistre le profil', async () => {
    const before = await db.profile.get('me')
    if (!before) throw new Error('profil manquant')
    await saveProfile({
      ...draftFromProfile(before),
      firstName: 'Charles',
      weightKg: 72.5,
      trainingDays: [2, 4],
    })
    expect(await db.profile.get('me')).toMatchObject({
      id: 'me',
      firstName: 'Charles',
      weightKg: 72.5,
      sessionsPerWeek: 2,
      createdAt: before.createdAt,
    })
  })

  it('refuse des valeurs impossibles', async () => {
    const draft = draftFromProfile(defaultProfile())
    await expect(saveProfile({ ...draft, sessionMinutes: 2 })).rejects.toThrow()
    expect((await db.profile.get('me'))?.sessionMinutes).toBe(60)
  })

  it('enregistre un test de niveau et met le niveau à jour', async () => {
    await saveLevelTest({ ...EMPTY_LEVEL_TEST, pullUps: 13, pushUps: 45 }, '2026-10-10')
    expect(await db.profile.get('me')).toMatchObject({
      experience: 'advanced',
      levelTest: { date: '2026-10-10', pullUps: 13, pushUps: 45, dips: null },
    })
    // Un test vide garde le niveau choisi.
    await saveLevelTest(EMPTY_LEVEL_TEST, '2026-10-11')
    expect((await db.profile.get('me'))?.experience).toBe('advanced')
  })
})
