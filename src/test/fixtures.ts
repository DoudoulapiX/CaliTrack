import { buildCatalog, loadFedbExercises, type Catalog } from '@/content/exercises/catalog'
import { defaultProfile, defaultSettings } from '@/db/defaults'
import { V1_DEFAULT_DASHBOARD_CARDS, V1_DEFAULT_TABS } from '@/db/migrations'
import type {
  AiUsageRow,
  BodyReview,
  BoulderResult,
  CalendarEvent,
  ClimbingSession,
  ClimbStyle,
  CoachChange,
  CoachDay,
  CoachMessage,
  EquipmentItem,
  EquipmentKind,
  EventSeries,
  PantryItem,
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

/** Des réglages tels que les enregistrait la version 1 de l'appli (avant la nutrition et Oura). */
export function v1Settings(patch: Record<string, unknown> = {}): Record<string, unknown> {
  const settings: Record<string, unknown> = { ...defaultSettings('2026-10-12T08:00:00.000Z') }
  delete settings.aiModel
  delete settings.ouraClientId
  delete settings.ouraRelayUrl
  return {
    ...settings,
    tabs: [...V1_DEFAULT_TABS],
    dashboardCards: [...V1_DEFAULT_DASHBOARD_CARDS],
    ...patch,
  }
}

/* ------------------------------------------------------------------ */
/* Coach IA                                                            */
/* ------------------------------------------------------------------ */

/** Un exercice allégé par le coach : 3 séries de tractions au lieu de 4, sans charge. */
export function coachChange(patch: Partial<CoachChange> = {}): CoachChange {
  return {
    slotId: 'slot-1',
    plannedExerciseId: 'pull-up',
    action: 'lighter',
    exerciseId: 'pull-up',
    sets: 3,
    target: { kind: 'reps', min: 5, max: 8 },
    loadKg: null,
    reason: 'Nuit courte : une série de moins.',
    ...patch,
  }
}

/**
 * Le conseil du coach pour le mercredi 21 octobre 2026 : la séance B du programme de testProgram()
 * validée telle quelle, d'après une bonne nuit notée par la bague.
 */
export function coachDay(patch: Partial<CoachDay> = {}): CoachDay {
  return {
    date: '2026-10-21',
    model: 'claude-opus-5-5',
    checkIn: { sleep: null, energy: 'ok', soreness: 'none', zones: [], note: '' },
    basis: { readinessScore: 82, sleepScore: 78, sleepMin: 430, yesterdayKcal: 2650 },
    programId: 'p1',
    programSessionId: 'B',
    decision: 'asPlanned',
    changes: [],
    headline: 'Séance prévue validée',
    summary: 'Tu as bien récupéré : fais ta séance comme prévu.',
    tips: ['Bois un grand verre d’eau avant de commencer.'],
    ignored: false,
    createdAt: '2026-10-21T09:00:00.000Z',
    updatedAt: '2026-10-21T09:00:00.000Z',
    ...patch,
  }
}

/** L'analyse physique du 21 octobre 2026 : une sèche conseillée, 80 kg, 15 à 19 % de masse grasse. */
export function bodyReview(patch: Partial<BodyReview> = {}): BodyReview {
  return {
    date: '2026-10-21',
    model: 'claude-opus-5-5',
    suggestedPhase: 'cut',
    phase: 'cut',
    bodyFat: { low: 15, high: 19 },
    weightKg: 80,
    targets: { kcal: 2210, proteinG: 175, carbsG: 245, fatG: 60 },
    summary: 'Une sèche courte t’aiderait à affiner la taille.',
    observations: ['Bonne base musculaire au dos et aux épaules.'],
    advice: ['Garde tes protéines hautes pendant la sèche.'],
    appliedAt: null,
    createdAt: '2026-10-21T09:00:00.000Z',
    updatedAt: '2026-10-21T09:00:00.000Z',
    ...patch,
  }
}

/** Un aliment du frigo, ajouté à la main (des œufs par défaut). */
export function pantryItem(patch: Partial<PantryItem> = {}): PantryItem {
  return {
    id: 'pantry-1',
    place: 'fridge',
    name: 'Œufs',
    quantity: '6',
    source: 'manual',
    createdAt: '2026-10-21T09:00:00.000Z',
    updatedAt: '2026-10-21T09:00:00.000Z',
    ...patch,
  }
}

/**
 * Un message de la discussion, numéroté : questions aux numéros pairs et réponses aux impairs par défaut,
 * une minute après l'autre à partir du 21 octobre 2026 à 10 h (heure de Paris).
 */
export function coachMessage(
  seq: number,
  role: CoachMessage['role'] = seq % 2 === 0 ? 'user' : 'assistant',
  patch: Partial<CoachMessage> = {},
): CoachMessage {
  return {
    id: `msg-${String(seq)}`,
    seq,
    role,
    text: role === 'user' ? `Question ${String(seq)}` : `Réponse ${String(seq)}`,
    model: role === 'user' ? null : 'claude-opus-5-5',
    createdAt: new Date(Date.UTC(2026, 9, 21, 8, seq)).toISOString(),
    ...patch,
  }
}

/** Le compteur des demandes à Claude d'octobre 2026 sur cet appareil. */
export function aiUsageRow(patch: Partial<AiUsageRow> = {}): AiUsageRow {
  return {
    month: '2026-10',
    calls: 3,
    inputTokens: 12000,
    outputTokens: 5000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: 0.148,
    updatedAt: '2026-10-21T09:00:00.000Z',
    ...patch,
  }
}
