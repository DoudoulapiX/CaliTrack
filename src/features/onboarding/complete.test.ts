import { buildCatalog, loadFedbExercises, type Catalog } from '@/content/exercises/catalog'
import { db } from '@/db/db'
import { defaultProfile } from '@/db/defaults'
import { draftFromProfile, type ProfileDraft } from '@/db/profile'
import { ensureSeeded } from '@/db/seed'
import { resetDb } from '@/test/db'
import { completeOnboarding } from './complete'

describe('fin du premier lancement', () => {
  let catalog: Catalog

  beforeAll(async () => {
    catalog = buildCatalog(await loadFedbExercises(), [])
  })

  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('enregistre profil, lieux et matériel en une fois', async () => {
    const draft: ProfileDraft = {
      ...draftFromProfile(defaultProfile()),
      firstName: 'Charles',
      trainingDays: [1, 4],
      targetSkills: ['muscleUp', 'handstand'],
    }
    await completeOnboarding(
      draft,
      [
        { icon: 'home', name: 'Maison', kinds: ['pullupBar', 'dumbbells', 'dumbbells'] },
        { icon: 'park', name: ' ', kinds: ['pullupBar', 'dipBars'] },
      ],
      catalog.byId,
    )

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

    // Premier programme : actif, calé sur les jours choisis et le matériel de la maison.
    const programs = await db.programs.toArray()
    expect(programs).toHaveLength(1)
    const [program] = programs
    expect(program?.active).toBe(true)
    expect(program?.locationId).toBe(home?.id)
    expect(program?.sessions.flatMap((s) => s.weekdays).sort()).toEqual([1, 4])
    const exerciseIds = program?.sessions.flatMap((s) =>
      s.blocks.flatMap((b) => b.slots.map((x) => x.exerciseId)),
    )
    expect(exerciseIds?.length).toBeGreaterThan(10)
    // Pas de barres parallèles à la maison : aucun dip aux barres.
    expect(exerciseIds).not.toContain('dip')

    // Une figure visée = un objectif affiché sur l'accueil, avec ses étapes.
    const goals = await db.goals.toArray()
    expect(goals.map((g) => g.skillId).sort()).toEqual(['handstand', 'muscleUp'])
    expect(goals.every((g) => g.pinned && g.kind === 'skill')).toBe(true)
    const muscleUp = goals.find((g) => g.skillId === 'muscleUp')
    expect(muscleUp?.title).toBe('Muscle-up')
    expect(muscleUp?.milestones[0]).toMatchObject({
      title: 'Tractions',
      criterion: { kind: 'reps', exerciseId: 'pullup', value: 8 },
    })
  })

  it('ne termine rien si le profil est invalide', async () => {
    const draft = draftFromProfile(defaultProfile())
    await expect(
      completeOnboarding(
        { ...draft, sessionMinutes: 0 },
        [{ icon: 'home', name: 'Maison', kinds: ['mat'] }],
        catalog.byId,
      ),
    ).rejects.toThrow()
    expect(await db.locations.count()).toBe(0)
    expect(await db.equipment.count()).toBe(0)
    expect(await db.programs.count()).toBe(0)
    expect(await db.goals.count()).toBe(0)
    expect((await db.settings.get('app'))?.onboardingDone).toBe(false)
  })
})
