import { db } from '@/db/db'
import { defaultProfile } from '@/db/defaults'
import { draftFromProfile, type ProfileDraft } from '@/db/profile'
import { ensureSeeded } from '@/db/seed'
import { resetDb } from '@/test/db'
import { completeOnboarding } from './complete'

describe('fin du premier lancement', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('enregistre profil, lieux et matériel en une fois', async () => {
    const draft: ProfileDraft = {
      ...draftFromProfile(defaultProfile()),
      firstName: 'Charles',
      trainingDays: [1, 4],
    }
    await completeOnboarding(draft, [
      { icon: 'home', name: 'Maison', kinds: ['pullupBar', 'dumbbells', 'dumbbells'] },
      { icon: 'park', name: ' ', kinds: ['pullupBar', 'dipBars'] },
    ])

    const locations = await db.locations.toArray()
    expect(locations.map((l) => l.name).sort()).toEqual(['Maison', 'Parc / street workout'])
    const home = locations.find((l) => l.icon === 'home')
    const park = locations.find((l) => l.icon === 'park')

    const items = await db.equipment.toArray()
    expect(items.map((i) => i.kind).sort()).toEqual(['dipBars', 'dumbbells', 'pullupBar'])
    expect(items.find((i) => i.kind === 'pullupBar')?.locationIds.sort()).toEqual([home?.id, park?.id].sort())
    expect(items.find((i) => i.kind === 'dumbbells')?.locationIds).toEqual([home?.id])

    expect(await db.profile.get('me')).toMatchObject({ firstName: 'Charles', sessionsPerWeek: 2 })
    expect((await db.settings.get('app'))?.onboardingDone).toBe(true)
  })

  it('ne termine rien si le profil est invalide', async () => {
    const draft = draftFromProfile(defaultProfile())
    await expect(
      completeOnboarding({ ...draft, sessionMinutes: 0 }, [{ icon: 'home', name: 'Maison', kinds: ['mat'] }]),
    ).rejects.toThrow()
    expect(await db.locations.count()).toBe(0)
    expect(await db.equipment.count()).toBe(0)
    expect((await db.settings.get('app'))?.onboardingDone).toBe(false)
  })
})
