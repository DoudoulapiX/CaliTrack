import { LOCATION_ICON_LABEL } from '@/content/equipment'
import { defaultProgramLocation, generateProgram } from '@/content/programs/generator'
import { db as defaultDb, type CaliTrackDB } from '@/db/db'
import { defaultProfile } from '@/db/defaults'
import { newEquipmentItem, newLocation } from '@/db/equipment'
import { addSkillGoals } from '@/db/goals'
import { profileFromDraft, type ProfileDraft } from '@/db/profile'
import { equipmentSchema, locationSchema, programSchema } from '@/db/schema'
import type { EquipmentItem, EquipmentKind, Exercise, LocationIcon } from '@/db/types'
import { nowISO, today } from '@/lib/dates'

/** Un lieu choisi au premier lancement, avec le matériel coché. */
export interface PlaceDraft {
  icon: LocationIcon
  name: string
  kinds: EquipmentKind[]
}

/**
 * Enregistre tout ce qui a été saisi au premier lancement, en une fois : profil, lieux, matériel,
 * puis le premier programme, calculé d'après tout cela, et un objectif par figure visée.
 * Un même matériel coché dans plusieurs lieux devient un seul objet rangé dans chacun d'eux.
 */
export async function completeOnboarding(
  profile: ProfileDraft,
  places: readonly PlaceDraft[],
  exercises: ReadonlyMap<string, Exercise>,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.profile,
      database.settings,
      database.locations,
      database.equipment,
      database.programs,
      database.goals,
    ],
    async () => {
      const current = (await database.profile.get('me')) ?? defaultProfile()
      const saved = profileFromDraft(profile, current)
      await database.profile.put(saved)

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
      const items = [...byKind.values()].map((item) => equipmentSchema.parse(item))
      await database.equipment.bulkPut(items)

      const locations = await database.locations.toArray()
      const settings = await database.settings.get('app')
      const program = generateProgram({
        profile: saved,
        items,
        locations,
        locationId: defaultProgramLocation(locations, settings?.currentLocationId ?? null),
        exercises,
        startDate: today(),
        now: nowISO(),
      })
      await database.programs.filter((p) => p.active).modify({ active: false })
      await database.programs.put(programSchema.parse(program))
      await addSkillGoals(saved.targetSkills, (id) => exercises.get(id)?.name ?? id, database)

      await database.settings.update('app', { onboardingDone: true, updatedAt: nowISO() })
    },
  )
}
