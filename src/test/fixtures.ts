import { buildCatalog, loadFedbExercises, type Catalog } from '@/content/exercises/catalog'
import { defaultProfile } from '@/db/defaults'
import type {
  BoulderResult,
  CalendarEvent,
  ClimbingSession,
  ClimbStyle,
  EquipmentItem,
  EquipmentKind,
  EventSeries,
  Profile,
  Program,
  ProgramSession,
  Workout,
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

/** Un exercice d'une séance : ses séries faites (répétitions, et charge en kilos s'il y en a une). */
export type ExerciseSpec = [exerciseId: string, reps: number[], loadKg?: number]

/** Une séance libre terminée ce jour-là (de 16 h à 17 h UTC), avec ses exercices. */
export function doneWorkout(
  id: string,
  date: string,
  exercises: ExerciseSpec[] = [],
  patch: Partial<Workout> = {},
): Workout {
  return {
    id,
    date,
    startedAt: `${date}T16:00:00.000Z`,
    endedAt: `${date}T17:00:00.000Z`,
    title: 'Séance libre',
    programId: null,
    programSessionId: null,
    plannedFor: null,
    eventId: null,
    exercises: exercises.map(([exerciseId, reps, loadKg], i) => ({
      id: `${id}-e${String(i + 1)}`,
      exerciseId,
      slotId: null,
      block: null,
      target: null,
      restSec: 90,
      sets: reps.map((count, j) => ({
        id: `${id}-e${String(i + 1)}-s${String(j + 1)}`,
        reps: count,
        durationSec: null,
        loadKg: loadKg ?? null,
        assistance: null,
        rpe: null,
        done: true,
        completedAt: `${date}T16:${String(5 + j).padStart(2, '0')}:00.000Z`,
      })),
      note: '',
    })),
    rpe: null,
    notes: '',
    status: 'done',
    deload: false,
    progression: [],
    ...patch,
  }
}

/** Une séance de programme vide, les jours donnés (1 : lundi … 7 : dimanche). */
export const programSession = (id: string, weekdays: ProgramSession['weekdays']): ProgramSession => ({
  id,
  name: `Séance ${id}`,
  emphasis: 'full',
  weekdays,
  blocks: [],
})

/** Un programme actif : séance A le lundi et le jeudi, B le mercredi, à partir du mercredi 14 octobre 2026. */
export function testProgram(patch: Partial<Program> = {}): Program {
  return {
    id: 'p1',
    name: 'Force',
    active: true,
    source: 'generated',
    focuses: ['strength'],
    locationId: null,
    sessions: [programSession('A', [1, 4]), programSession('B', [3])],
    startDate: '2026-10-14',
    deloadEveryWeeks: null,
    rationale: [],
    notes: '',
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
    ...patch,
  }
}

/** Une séance perso ponctuelle (course à pied par défaut), prévue ce jour-là. */
export function calendarEvent(id: string, date: string, patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id,
    date,
    time: null,
    kind: 'cardio',
    title: 'Course à pied',
    durationMin: null,
    programId: null,
    programSessionId: null,
    seriesId: null,
    status: 'planned',
    workoutId: null,
    climbingSessionId: null,
    energyKcal: null,
    distanceKm: null,
    notes: '',
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
    ...patch,
  }
}

/** Une série répétée (yoga le mardi par défaut, depuis le 13 octobre 2026). */
export function eventSeries(id: string, patch: Partial<EventSeries> = {}): EventSeries {
  return {
    id,
    kind: 'custom',
    title: 'Yoga',
    weekdays: [2],
    intervalWeeks: 1,
    startDate: '2026-10-13',
    endDate: null,
    time: null,
    durationMin: 45,
    notes: '',
    createdAt: '2026-10-10T08:00:00.000Z',
    updatedAt: '2026-10-10T08:00:00.000Z',
    ...patch,
  }
}
