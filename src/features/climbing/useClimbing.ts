import { useLiveQuery } from 'dexie-react-hooks'
import { defaultGradeScales } from '@/content/grades'
import { getActiveClimb, listClimbs } from '@/db/climbing'
import { db } from '@/db/db'
import type { AppSettings, ClimbingSession, GradeScale } from '@/db/types'

/** Séances d'escalade, la plus récente d'abord (undefined pendant le chargement). */
export function useClimbs(): ClimbingSession[] | undefined {
  return useLiveQuery(() => listClimbs(), [])
}

/** Une séance ; null si elle n'existe pas (undefined pendant le chargement). */
export function useClimb(id: string | undefined): ClimbingSession | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.climbingSessions.get(id)) ?? null) : null), [id])
}

/** La séance d'escalade en cours ; null s'il n'y en a pas (undefined pendant le chargement). */
export function useActiveClimb(): ClimbingSession | null | undefined {
  return useLiveQuery(async () => (await getActiveClimb()) ?? null, [])
}

const BUILT_IN_ORDER = defaultGradeScales().map((scale) => scale.id)

/** Échelles de l'appli d'abord (Vertical’Art, Fontainebleau), puis celles créées, par nom. */
export function sortScales(scales: readonly GradeScale[]): GradeScale[] {
  const rank = (scale: GradeScale) => {
    const index = BUILT_IN_ORDER.indexOf(scale.id)
    return index < 0 ? BUILT_IN_ORDER.length : index
  }
  return [...scales].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'fr'))
}

/** Échelles de cotation (undefined pendant le chargement). */
export function useGradeScales(): GradeScale[] | undefined {
  return useLiveQuery(async () => sortScales(await db.gradeScales.toArray()), [])
}

/** L'échelle des nouvelles séances (la première disponible si celle choisie a disparu). */
export function activeScaleOf(
  scales: readonly GradeScale[],
  settings: Pick<AppSettings, 'activeGradeScaleId'>,
): GradeScale | null {
  return scales.find((scale) => scale.id === settings.activeGradeScaleId) ?? scales[0] ?? null
}
