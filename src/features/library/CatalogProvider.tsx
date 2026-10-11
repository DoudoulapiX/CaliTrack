import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { Exercise } from '@/db/types'
import { buildCatalog, loadFedbExercises } from '@/content/exercises/catalog'
import { PageSpinner } from '@/ui/PageSpinner'
import { CatalogContext } from './catalog-context'

/**
 * Charge une fois la liste complète des exercices et la fournit à tous les écrans.
 * Les exercices personnels sont suivis en direct.
 */
export function CatalogProvider({ children }: { children: ReactNode }) {
  const [fedb, setFedb] = useState<Exercise[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const custom = useLiveQuery(() => db.customExercises.toArray(), [])

  useEffect(() => {
    let cancelled = false
    loadFedbExercises().then(
      (list) => {
        if (!cancelled) setFedb(list)
      },
      (e: unknown) => {
        if (!cancelled) setError(e)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const catalog = useMemo(() => (fedb && custom ? buildCatalog(fedb, custom) : null), [fedb, custom])

  // Échec de chargement (hors ligne avant la première mise en cache) : l'écran d'erreur propose de recharger.
  if (error) throw error instanceof Error ? error : new Error('Impossible de charger les exercices')
  if (!catalog) return <PageSpinner />
  return <CatalogContext value={catalog}>{children}</CatalogContext>
}
