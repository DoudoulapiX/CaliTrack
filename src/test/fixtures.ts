import { buildCatalog, loadFedbExercises, type Catalog } from '@/content/exercises/catalog'
import { defaultProfile } from '@/db/defaults'
import type {
  BoulderResult,
  ClimbingSession,
  ClimbStyle,
  EquipmentItem,
  EquipmentKind,
  Profile,
} from '@/db/types'

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

/** Un bloc noté : niveau, résultat, essais (1 pour un flash, 2 sinon par défaut), styles. */
export type BoulderSpec = [gradeKey: string, result: BoulderResult, attempts?: number, styles?: ClimbStyle[]]

/**
 * Une séance d'escalade terminée ce jour-là (de 16 h à 17 h 30 UTC, 1 h 30), sur l'échelle
 * Vertical’Art ; ses blocs sont notés de minute en minute à partir de 16 h 10.
 */
export function climbSession(
  id: string,
  date: string,
  boulders: BoulderSpec[] = [],
  patch: Partial<ClimbingSession> = {},
): ClimbingSession {
  return {
    id,
    date,
    status: 'done',
    startedAt: `${date}T16:00:00.000Z`,
    endedAt: `${date}T17:30:00.000Z`,
    gym: 'Vertical’Art',
    scaleId: 'vertical-art',
    durationMin: 90,
    rpe: null,
    notes: '',
    boulders: boulders.map(([gradeKey, result, attempts, styles], i) => ({
      id: `${id}-b${String(i + 1)}`,
      gradeKey,
      result,
      attempts: attempts ?? (result === 'flash' ? 1 : 2),
      styles: styles ?? [],
      note: '',
      createdAt: `${date}T16:${String(10 + i).padStart(2, '0')}:00.000Z`,
    })),
    createdAt: `${date}T16:00:00.000Z`,
    updatedAt: `${date}T17:30:00.000Z`,
    ...patch,
  }
}
