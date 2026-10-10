import type { EquipmentItem, EquipmentKind, Exercise } from '@/db/types'
import { EXTRA_LOAD, WEIGHT_KINDS } from './ladders'

/** Matériel qui peut charger cet exercice : celui de sa fiche (haltères…), sinon un lest ajouté. */
export function loadKindsFor(exercise: Pick<Exercise, 'id' | 'equipment'>): EquipmentKind[] {
  const own = [...new Set(exercise.equipment.flat())].filter((kind) => WEIGHT_KINDS.includes(kind))
  return own.length > 0 ? own : [...(EXTRA_LOAD[exercise.id] ?? [])]
}

/**
 * Charges disponibles pour un exercice dans un lieu (`locationId` null : tout le matériel),
 * en kg, croissantes et sans doublon.
 */
export function loadsFor(
  exercise: Pick<Exercise, 'id' | 'equipment'>,
  items: readonly EquipmentItem[],
  locationId: string | null,
): number[] {
  const kinds = loadKindsFor(exercise)
  const loads = new Set<number>()
  for (const item of items) {
    if (!kinds.includes(item.kind)) continue
    const here = locationId === null || item.locationIds.length === 0 || item.locationIds.includes(locationId)
    if (!here) continue
    for (const kg of item.weightsKg) loads.add(kg)
  }
  return [...loads].sort((a, b) => a - b)
}

/** Charge suivante, plus lourde (null s'il n'y en a pas). */
export function heavierLoad(loads: readonly number[], current: number): number | null {
  return loads.find((kg) => kg > current) ?? null
}

/** Charge précédente, plus légère (null s'il n'y en a pas). */
export function lighterLoad(loads: readonly number[], current: number): number | null {
  for (let i = loads.length - 1; i >= 0; i--) {
    const kg = loads[i]
    if (kg !== undefined && kg < current) return kg
  }
  return null
}
