import { createContext, useContext } from 'react'
import type { Catalog } from '@/content/exercises/catalog'

export const CatalogContext = createContext<Catalog | null>(null)

/** Tous les exercices (CaliTrack, base générale, exercices personnels), à jour en direct. */
export function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext)
  if (!catalog) throw new Error('useCatalog doit être utilisé dans CatalogProvider')
  return catalog
}
