import { resetDb } from '@/test/db'
import { db } from './db'
import { ensureSeeded } from './seed'

describe('données de départ', () => {
  beforeEach(resetDb)

  it('crée réglages, profil et cotations au premier lancement', async () => {
    await ensureSeeded()
    expect(await db.settings.get('app')).toMatchObject({
      onboardingDone: false,
      activeGradeScaleId: 'vertical-art',
    })
    expect(await db.profile.get('me')).toMatchObject({ sessionsPerWeek: 3 })
    const scale = await db.gradeScales.get('vertical-art')
    expect(scale?.grades.map((g) => g.label)).toEqual(['Orange', 'Vert', 'Bleu', 'Rouge', 'Noir', 'Violet'])
  })

  it('ne remplace jamais les données existantes', async () => {
    await ensureSeeded()
    await db.settings.update('app', { accent: '#16a34a' })
    await db.gradeScales.update('vertical-art', { name: 'Ma salle' })
    await ensureSeeded()
    expect((await db.settings.get('app'))?.accent).toBe('#16a34a')
    expect((await db.gradeScales.get('vertical-art'))?.name).toBe('Ma salle')
  })
})
