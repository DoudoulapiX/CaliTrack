import { liveSession } from '@/content/climbing/session'
import { climbingGoal } from '@/content/goals/create'
import {
  builtInScale,
  copyScale,
  FONTAINEBLEAU_SCALE_ID,
  VERTICAL_ART_SCALE_ID,
  withGradeAdded,
  withGradeChanged,
} from '@/content/grades'
import { resetDb } from '@/test/db'
import { climbSession } from '@/test/fixtures'
import {
  addClimb,
  ClimbInProgressError,
  deleteClimb,
  deleteGradeScale,
  getActiveClimb,
  gradeUsage,
  listClimbs,
  resetGradeScale,
  saveGradeScale,
  updateClimb,
} from './climbing'
import { db } from './db'
import { saveGoal } from './goals'
import { ensureSeeded } from './seed'
import { updateSettings } from './settings'

const PLACE = { gym: 'Vertical’Art', scaleId: VERTICAL_ART_SCALE_ID }

beforeEach(async () => {
  await resetDb()
  await ensureSeeded()
})

async function scale(id: string) {
  const found = await db.gradeScales.get(id)
  if (!found) throw new Error(id)
  return found
}

describe('séances d’escalade enregistrées', () => {
  it('n’accepte qu’une séance en cours à la fois', async () => {
    const first = await addClimb(liveSession(PLACE, '2026-10-10T16:00:00.000Z', 'c1'))
    expect(await getActiveClimb()).toEqual(first)
    const error = await addClimb(liveSession(PLACE, '2026-10-10T16:05:00.000Z', 'c2')).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ClimbInProgressError)
    expect(error instanceof ClimbInProgressError ? error.active.id : null).toBe('c1')
    // Une séance passée s'ajoute sans gêner celle en cours, et la séance en cours se réenregistre.
    await addClimb(climbSession('old', '2026-10-03'))
    await addClimb({ ...first, notes: 'échauffement' })
    expect(await db.climbingSessions.count()).toBe(2)
    await expect(addClimb({ ...first, id: 'c3', endedAt: '2026-10-10T17:00:00.000Z' })).rejects.toThrow()
  })

  it('modifie une séance d’un seul tenant, et refuse une modification invalide', async () => {
    await addClimb(climbSession('a', '2026-10-03', [['bleu', 'sent']]))
    const next = await updateClimb('a', (s) => ({ ...s, notes: 'Dévers', durationMin: 75 }))
    expect(next).toMatchObject({ notes: 'Dévers', durationMin: 75 })
    expect(next.updatedAt).not.toBe('2026-10-03T17:30:00.000Z')
    await expect(updateClimb('a', (s) => ({ ...s, durationMin: -5 }))).rejects.toThrow()
    expect((await db.climbingSessions.get('a'))?.durationMin).toBe(75)
    await expect(updateClimb('inconnue', (s) => s)).rejects.toThrow('Séance introuvable.')
  })

  it('liste les séances de la plus récente à la plus ancienne, et en supprime', async () => {
    await addClimb(climbSession('a', '2026-10-03'))
    await addClimb(climbSession('b', '2026-10-10', [], { startedAt: '2026-10-10T09:00:00.000Z' }))
    await addClimb(climbSession('c', '2026-10-10'))
    expect((await listClimbs()).map((s) => s.id)).toEqual(['c', 'b', 'a'])
    await deleteClimb('b')
    expect((await listClimbs()).map((s) => s.id)).toEqual(['c', 'a'])
  })
})

describe('échelles de cotation enregistrées', () => {
  it('compte ce qui utilise une échelle ou un niveau', async () => {
    await addClimb(
      climbSession('a', '2026-10-03', [
        ['bleu', 'sent'],
        ['bleu', 'failed'],
        ['rouge', 'project'],
      ]),
    )
    await addClimb(climbSession('b', '2026-10-10', [['vert', 'flash']]))
    const va = await scale(VERTICAL_ART_SCALE_ID)
    const blue = va.grades[2]
    if (!blue) throw new Error('bleu')
    await saveGoal(
      climbingGoal(
        { scaleId: va.id, grade: blue, count: 5 },
        { title: '', deadline: null, pinned: false },
        '2026-10-01T08:00:00.000Z',
        () => 'g1',
      ),
    )
    expect(await gradeUsage(va.id, null)).toEqual({ boulders: 4, sessions: 2, goals: 1 })
    expect(await gradeUsage(va.id, 'bleu')).toEqual({ boulders: 2, sessions: 1, goals: 1 })
    expect(await gradeUsage(va.id, 'noir')).toEqual({ boulders: 0, sessions: 0, goals: 0 })
    expect(await gradeUsage(FONTAINEBLEAU_SCALE_ID, null)).toEqual({ boulders: 0, sessions: 0, goals: 0 })
  })

  it('refuse une échelle invalide', async () => {
    const va = await scale(VERTICAL_ART_SCALE_ID)
    await expect(saveGradeScale({ ...va, grades: [] })).rejects.toThrow()
    await expect(saveGradeScale({ ...va, name: ' ' })).rejects.toThrow()
    const renamed = await saveGradeScale(
      withGradeChanged(va, 'bleu', { label: 'Azur', color: '#38bdf8', font: '' }),
    )
    expect((await scale(VERTICAL_ART_SCALE_ID)).grades[2]).toEqual(renamed.grades[2])
  })

  it('ne supprime qu’une échelle créée et inutilisée, en revenant à Vertical’Art', async () => {
    await expect(deleteGradeScale(VERTICAL_ART_SCALE_ID)).rejects.toThrow(/vient avec l’appli/)
    const arkose = await saveGradeScale(copyScale(await scale(VERTICAL_ART_SCALE_ID), 'Arkose', 'arkose'))
    await updateSettings({ activeGradeScaleId: arkose.id })
    await addClimb(climbSession('a', '2026-10-03', [], { scaleId: arkose.id }))
    await expect(deleteGradeScale(arkose.id)).rejects.toThrow(/ne peut pas être supprimée/)
    await deleteClimb('a')
    await deleteGradeScale(arkose.id)
    expect(await db.gradeScales.get(arkose.id)).toBeUndefined()
    expect((await db.settings.get('app'))?.activeGradeScaleId).toBe(VERTICAL_ART_SCALE_ID)
    // Supprimer une échelle déjà disparue ne fait rien.
    await deleteGradeScale(arkose.id)
  })

  it('revient aux niveaux d’origine en gardant ceux déjà utilisés', async () => {
    const va = await scale(VERTICAL_ART_SCALE_ID)
    const changed = withGradeAdded(
      withGradeAdded(withGradeChanged(va, 'bleu', { label: 'Azur', color: '#38bdf8', font: '' }), {
        label: 'Blanc',
        color: '#f4f4f5',
        font: '',
      }),
      { label: 'Rose', color: '#ec4899', font: '' },
    )
    await saveGradeScale(changed)
    await addClimb(climbSession('a', '2026-10-03', [['rose', 'sent']]))
    const reset = await resetGradeScale(VERTICAL_ART_SCALE_ID)
    expect(reset.grades.map((g) => g.label)).toEqual([
      ...(builtInScale(VERTICAL_ART_SCALE_ID)?.grades.map((g) => g.label) ?? []),
      'Rose',
    ])
    expect(await scale(VERTICAL_ART_SCALE_ID)).toEqual(reset)
    await expect(resetGradeScale('arkose')).rejects.toThrow('Échelle introuvable.')
  })
})
