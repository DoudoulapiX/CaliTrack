import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { ExerciseMeta } from '@/db/types'

export interface MetaIndex {
  byId: ReadonlyMap<string, ExerciseMeta>
  favoriteIds: ReadonlySet<string>
}

/** Favoris et notes personnelles de tous les exercices. */
export function useExerciseMetaIndex(): MetaIndex {
  const rows = useLiveQuery(() => db.exerciseMeta.toArray(), [])
  return useMemo(() => {
    const list = rows ?? []
    return {
      byId: new Map(list.map((row) => [row.exerciseId, row])),
      favoriteIds: new Set(list.filter((row) => row.favorite).map((row) => row.exerciseId)),
    }
  }, [rows])
}
