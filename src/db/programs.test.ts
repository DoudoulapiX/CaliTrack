import { emptyProgram } from '@/content/programs/edit'
import { resetDb } from '@/test/db'
import { db } from './db'
import {
  activateProgram,
  deleteProgram,
  getActiveProgram,
  listPrograms,
  saveProgram,
  updateProgram,
} from './programs'
import type { Program } from './types'

const program = (id: string, createdAt: string): Program =>
  emptyProgram({
    name: id,
    focuses: ['strength'],
    locationId: null,
    startDate: '2026-10-12',
    now: createdAt,
    newId: () => id,
  })

describe('programmes enregistrés', () => {
  beforeEach(resetDb)

  it('n’en garde qu’un seul actif', async () => {
    await saveProgram({ ...program('a', '2026-10-01T08:00:00.000Z'), active: true })
    await saveProgram({ ...program('b', '2026-10-02T08:00:00.000Z'), active: true })
    expect((await getActiveProgram())?.id).toBe('b')
    expect((await db.programs.get('a'))?.active).toBe(false)

    await activateProgram('a')
    expect((await getActiveProgram())?.id).toBe('a')
    expect((await db.programs.get('b'))?.active).toBe(false)
  })

  it('liste le plus récent d’abord', async () => {
    await saveProgram(program('ancien', '2026-09-01T08:00:00.000Z'))
    await saveProgram(program('récent', '2026-10-01T08:00:00.000Z'))
    expect((await listPrograms()).map((p) => p.id)).toEqual(['récent', 'ancien'])
  })

  it('modifie d’après la version enregistrée et refuse un programme invalide', async () => {
    await saveProgram(program('a', '2026-10-01T08:00:00.000Z'))
    const renamed = await updateProgram('a', (p) => ({ ...p, name: 'Renommé' }))
    expect(renamed.name).toBe('Renommé')
    expect(renamed.updatedAt > '2026-10-01T08:00:00.000Z').toBe(true)
    await expect(updateProgram('a', (p) => ({ ...p, deloadEveryWeeks: 1 }))).rejects.toThrow()
    expect((await db.programs.get('a'))?.deloadEveryWeeks).toBeNull()
    await expect(updateProgram('absent', (p) => p)).rejects.toThrow('Programme introuvable.')
  })

  it('supprime un programme', async () => {
    await saveProgram({ ...program('a', '2026-10-01T08:00:00.000Z'), active: true })
    await deleteProgram('a')
    expect(await getActiveProgram()).toBeUndefined()
    expect(await db.programs.count()).toBe(0)
  })
})
