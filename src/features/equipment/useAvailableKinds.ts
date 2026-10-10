import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { EquipmentKind } from '@/db/types'
import { kindsAt } from '@/content/exercises/catalog'

export interface AvailableEquipment {
  kinds: ReadonlySet<EquipmentKind>
  /** Vrai si au moins un objet est enregistré dans l'inventaire. */
  hasInventory: boolean
  /** Vrai tant que l'inventaire n'a pas été lu. */
  loading: boolean
}

/** Matériel disponible dans un lieu (null : tout l'inventaire). */
export function useAvailableKinds(locationId: string | null): AvailableEquipment {
  const items = useLiveQuery(() => db.equipment.toArray(), [])
  return useMemo(
    () => ({
      kinds: kindsAt(items ?? [], locationId),
      hasInventory: (items?.length ?? 0) > 0,
      loading: items === undefined,
    }),
    [items, locationId],
  )
}
