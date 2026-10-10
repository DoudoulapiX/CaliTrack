import { nowISO } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import { programSchema } from './schema'
import type { Program } from './types'

/*
 * Programmes enregistrés. Un seul est actif à la fois : c'est lui que suivent l'écran du jour,
 * le calendrier et la progression.
 */

async function deactivateOthers(database: CaliTrackDB, id: string): Promise<void> {
  const others = await database.programs.filter((p) => p.active && p.id !== id).toArray()
  await database.programs.bulkPut(others.map((p) => ({ ...p, active: false })))
}

/** Enregistre un programme (vérifié). S'il est actif, les autres cessent de l'être. */
export async function saveProgram(program: Program, database: CaliTrackDB = defaultDb): Promise<Program> {
  const valid = programSchema.parse({ ...program, updatedAt: nowISO() })
  await database.transaction('rw', database.programs, async () => {
    if (valid.active) await deactivateOthers(database, valid.id)
    await database.programs.put(valid)
  })
  return valid
}

/** Modifie un programme à partir de sa version enregistrée, d'un seul tenant. */
export async function updateProgram(
  id: string,
  change: (program: Program) => Program,
  database: CaliTrackDB = defaultDb,
): Promise<Program> {
  return database.transaction('rw', database.programs, async () => {
    const current = await database.programs.get(id)
    if (!current) throw new Error('Programme introuvable.')
    const next = programSchema.parse({ ...change(current), id, updatedAt: nowISO() })
    if (next.active) await deactivateOthers(database, id)
    await database.programs.put(next)
    return next
  })
}

/** Fait d'un programme celui que l'on suit. */
export async function activateProgram(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await updateProgram(id, (program) => ({ ...program, active: true }), database)
}

export async function deleteProgram(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.programs.delete(id)
}

/** Le programme suivi, s'il y en a un. */
export async function getActiveProgram(database: CaliTrackDB = defaultDb): Promise<Program | undefined> {
  return database.programs.filter((p) => p.active).first()
}

/** Tous les programmes, le plus récent d'abord. */
export async function listPrograms(database: CaliTrackDB = defaultDb): Promise<Program[]> {
  return database.programs.orderBy('createdAt').reverse().toArray()
}
