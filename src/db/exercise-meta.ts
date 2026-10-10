import { nowISO } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import type { ExerciseMeta } from './types'

async function patchMeta(
  exerciseId: string,
  patch: Partial<Pick<ExerciseMeta, 'favorite' | 'note'>>,
  database: CaliTrackDB,
): Promise<void> {
  await database.transaction('rw', database.exerciseMeta, async () => {
    const current = await database.exerciseMeta.get(exerciseId)
    const next: ExerciseMeta = {
      exerciseId,
      favorite: current?.favorite ?? false,
      note: current?.note ?? '',
      ...patch,
      updatedAt: nowISO(),
    }
    // Rien à retenir : on supprime la ligne pour garder la base propre.
    if (!next.favorite && next.note.trim() === '') await database.exerciseMeta.delete(exerciseId)
    else await database.exerciseMeta.put(next)
  })
}

export async function setFavorite(
  exerciseId: string,
  favorite: boolean,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await patchMeta(exerciseId, { favorite }, database)
}

export async function setExerciseNote(
  exerciseId: string,
  note: string,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await patchMeta(exerciseId, { note: note.trim() === '' ? '' : note }, database)
}
