import { DEFAULT_BAND_LEVELS, EQUIPMENT_LABEL, presetFor } from '@/content/equipment'
import { nowISO } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { db as defaultDb, type CaliTrackDB } from './db'
import { equipmentSchema, locationSchema } from './schema'
import type { EquipmentItem, EquipmentKind, Location, LocationIcon } from './types'

/** Nouvel objet de l'inventaire, prérempli d'après son modèle (nom, niveaux d'élastiques). */
export function newEquipmentItem(kind: EquipmentKind, locationIds: string[] = []): EquipmentItem {
  return {
    id: newId(),
    kind,
    name: EQUIPMENT_LABEL[kind],
    weightsKg: [],
    bandLevels: presetFor(kind)?.hasLevels ? [...DEFAULT_BAND_LEVELS] : [],
    note: '',
    locationIds,
    createdAt: nowISO(),
  }
}

/** Charges triées, sans doublon, arrondies au centième de kilo. */
export function normalizeWeights(weightsKg: readonly number[]): number[] {
  const rounded = weightsKg.filter((w) => Number.isFinite(w) && w > 0).map((w) => Math.round(w * 100) / 100)
  return [...new Set(rounded)].sort((a, b) => a - b)
}

export async function saveEquipmentItem(
  item: EquipmentItem,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  const clean: EquipmentItem = {
    ...item,
    name: item.name.trim() || EQUIPMENT_LABEL[item.kind],
    weightsKg: normalizeWeights(item.weightsKg),
    bandLevels: item.bandLevels.map((level) => level.trim()).filter((level) => level !== ''),
    note: item.note.trim(),
    locationIds: [...new Set(item.locationIds)],
  }
  await database.equipment.put(equipmentSchema.parse(clean))
}

export async function deleteEquipmentItem(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.equipment.delete(id)
}

export function newLocation(icon: LocationIcon, name: string): Location {
  return { id: newId(), name, icon, createdAt: nowISO() }
}

export async function saveLocation(location: Location, database: CaliTrackDB = defaultDb): Promise<void> {
  const name = location.name.trim()
  if (name === '') throw new Error('Donne un nom à ce lieu.')
  await database.locations.put(locationSchema.parse({ ...location, name }))
}

/**
 * Enregistre un lieu et y range le matériel coché (retire le reste), plus le nouveau matériel
 * `newKinds`. Ne bougent pas : le matériel disponible partout et celui rangé seulement dans ce lieu,
 * qui sans lieu deviendrait disponible partout.
 */
export async function saveLocationWithEquipment(
  location: Location,
  equipmentIds: readonly string[],
  newKinds: readonly EquipmentKind[] = [],
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  const wanted = new Set(equipmentIds)
  await database.transaction('rw', [database.locations, database.equipment], async () => {
    await saveLocation(location, database)
    await database.equipment
      .filter((item) => item.locationIds.length > 0)
      .modify((item) => {
        const here = item.locationIds.includes(location.id)
        if (wanted.has(item.id) && !here) item.locationIds = [...item.locationIds, location.id]
        else if (!wanted.has(item.id) && here && item.locationIds.length > 1) {
          item.locationIds = item.locationIds.filter((other) => other !== location.id)
        }
      })
    const added = [...new Set(newKinds)].map((kind) => newEquipmentItem(kind, [location.id]))
    await database.equipment.bulkPut(added.map((item) => equipmentSchema.parse(item)))
  })
}

/**
 * Supprime un lieu et tout ce qui y renvoie. Le matériel qui n'était rangé que là reste dans
 * l'inventaire, sans lieu (donc disponible partout).
 */
export async function deleteLocation(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.transaction(
    'rw',
    [database.locations, database.equipment, database.settings, database.programs],
    async () => {
      await database.locations.delete(id)
      await database.equipment
        .filter((item) => item.locationIds.includes(id))
        .modify((item) => {
          item.locationIds = item.locationIds.filter((other) => other !== id)
        })
      const settings = await database.settings.get('app')
      if (settings?.currentLocationId === id) {
        await database.settings.update('app', { currentLocationId: null, updatedAt: nowISO() })
      }
      await database.programs
        .filter((program) => program.locationId === id)
        .modify((program) => {
          program.locationId = null
        })
    },
  )
}
