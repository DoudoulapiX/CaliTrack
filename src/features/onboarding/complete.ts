import { LOCATION_ICON_LABEL } from '@/content/equipment'
import { db as defaultDb, type CaliTrackDB } from '@/db/db'
import { defaultProfile } from '@/db/defaults'
import { newEquipmentItem, newLocation } from '@/db/equipment'
import { profileFromDraft, type ProfileDraft } from '@/db/profile'
import { equipmentSchema, locationSchema } from '@/db/schema'
import type { EquipmentItem, EquipmentKind, LocationIcon } from '@/db/types'
import { nowISO } from '@/lib/dates'

/** Un lieu choisi au premier lancement, avec le matériel coché. */
export interface PlaceDraft {
  icon: LocationIcon
  name: string
  kinds: EquipmentKind[]
}

/**
 * Enregistre tout ce qui a été saisi au premier lancement, en une fois : profil, lieux, matériel.
 * Un même matériel coché dans plusieurs lieux devient un seul objet rangé dans chacun d'eux.
 */
export async function completeOnboarding(
  profile: ProfileDraft,
  places: readonly PlaceDraft[],
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction(
    'rw',
    [database.profile, database.settings, database.locations, database.equipment],
    async () => {
      const current = (await database.profile.get('me')) ?? defaultProfile()
      await database.profile.put(profileFromDraft(profile, current))

      const byKind = new Map<EquipmentKind, EquipmentItem>()
      for (const item of await database.equipment.toArray()) byKind.set(item.kind, item)
      for (const place of places) {
        const location = newLocation(place.icon, place.name.trim() || LOCATION_ICON_LABEL[place.icon])
        await database.locations.put(locationSchema.parse(location))
        for (const kind of new Set(place.kinds)) {
          const item = byKind.get(kind) ?? newEquipmentItem(kind)
          byKind.set(kind, { ...item, locationIds: [...new Set([...item.locationIds, location.id])] })
        }
      }
      await database.equipment.bulkPut([...byKind.values()].map((item) => equipmentSchema.parse(item)))
      await database.settings.update('app', { onboardingDone: true, updatedAt: nowISO() })
    },
  )
}
