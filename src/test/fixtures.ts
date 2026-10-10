import { buildCatalog, loadFedbExercises, type Catalog } from '@/content/exercises/catalog'
import { defaultProfile } from '@/db/defaults'
import type { EquipmentItem, EquipmentKind, Profile } from '@/db/types'

let catalog: Promise<Catalog> | null = null

/** Le répertoire complet des exercices (chargé une fois par fichier de test). */
export function testCatalog(): Promise<Catalog> {
  catalog ??= loadFedbExercises().then((fedb) => buildCatalog(fedb, []))
  return catalog
}

/** Un matériel de l'inventaire, rangé partout par défaut. */
export function item(
  kind: EquipmentKind,
  weightsKg: number[] = [],
  locationIds: string[] = [],
): EquipmentItem {
  return {
    id: `item-${kind}`,
    kind,
    name: kind,
    weightsKg,
    bandLevels: [],
    note: '',
    locationIds,
    createdAt: '2026-10-10T08:00:00.000Z',
  }
}

/** Profil par défaut, modifié pour le test. */
export function profile(patch: Partial<Profile> = {}): Profile {
  return { ...defaultProfile('2026-10-10T08:00:00.000Z'), ...patch }
}

/** Identifiants prévisibles : id-1, id-2… */
export function sequentialIds(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}
