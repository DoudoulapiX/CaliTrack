import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { trainingContext, type TrainingContext } from '@/content/programs/resolve'
import { db } from '@/db/db'
import { getActiveProgram, listPrograms } from '@/db/programs'
import type { EquipmentItem, Location, Program } from '@/db/types'
import { useCatalog } from '@/features/library/catalog-context'

/** Tous les programmes, le plus récent d'abord (undefined pendant le chargement). */
export function usePrograms(): Program[] | undefined {
  return useLiveQuery(() => listPrograms(), [])
}

/** Un programme ; null s'il n'existe pas (undefined pendant le chargement). */
export function useProgram(id: string | undefined): Program | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.programs.get(id)) ?? null) : null), [id])
}

/** Le programme suivi ; null s'il n'y en a pas (undefined pendant le chargement). */
export function useActiveProgram(): Program | null | undefined {
  return useLiveQuery(async () => (await getActiveProgram()) ?? null, [])
}

export interface Inventory {
  items: EquipmentItem[]
  locations: Location[]
}

export function useInventory(): Inventory | undefined {
  return useLiveQuery(
    async () => ({ items: await db.equipment.toArray(), locations: await db.locations.toArray() }),
    [],
  )
}

/** Exercices et matériel d'un lieu, pour savoir ce qui est faisable (null pendant le chargement). */
export function useTrainingContext(locationId: string | null): TrainingContext | null {
  const catalog = useCatalog()
  const inventory = useInventory()
  return useMemo(
    () => (inventory ? trainingContext(catalog.byId, inventory.items, locationId) : null),
    [catalog, inventory, locationId],
  )
}
