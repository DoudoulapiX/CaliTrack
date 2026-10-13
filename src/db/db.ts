import Dexie, { type EntityTable } from 'dexie'
import { settingsV1toV2 } from './migrations'
import type {
  AiUsageRow,
  AppSettings,
  BodyMetric,
  BodyReview,
  CalendarEvent,
  ClimbingSession,
  CoachDay,
  CoachMessage,
  EquipmentItem,
  EventSeries,
  Exercise,
  ExerciseMeta,
  Food,
  FoodEntry,
  Goal,
  GradeScale,
  Location,
  NutritionGoals,
  OuraDay,
  PantryItem,
  Profile,
  Program,
  Secret,
  Snapshot,
  Workout,
} from './types'

export type CaliTrackDB = Dexie & {
  settings: EntityTable<AppSettings, 'id'>
  profile: EntityTable<Profile, 'id'>
  locations: EntityTable<Location, 'id'>
  equipment: EntityTable<EquipmentItem, 'id'>
  customExercises: EntityTable<Exercise, 'id'>
  exerciseMeta: EntityTable<ExerciseMeta, 'exerciseId'>
  programs: EntityTable<Program, 'id'>
  events: EntityTable<CalendarEvent, 'id'>
  eventSeries: EntityTable<EventSeries, 'id'>
  workouts: EntityTable<Workout, 'id'>
  climbingSessions: EntityTable<ClimbingSession, 'id'>
  gradeScales: EntityTable<GradeScale, 'id'>
  goals: EntityTable<Goal, 'id'>
  bodyMetrics: EntityTable<BodyMetric, 'id'>
  snapshots: EntityTable<Snapshot, 'id'>
  foods: EntityTable<Food, 'id'>
  foodEntries: EntityTable<FoodEntry, 'id'>
  nutritionGoals: EntityTable<NutritionGoals, 'id'>
  ouraDays: EntityTable<OuraDay, 'date'>
  secrets: EntityTable<Secret, 'id'>
  coachDays: EntityTable<CoachDay, 'date'>
  bodyReviews: EntityTable<BodyReview, 'date'>
  pantryItems: EntityTable<PantryItem, 'id'>
  coachMessages: EntityTable<CoachMessage, 'id'>
  aiUsage: EntityTable<AiUsageRow, 'month'>
}

/**
 * Schéma de la base locale. Toute évolution ajoute une nouvelle version avec sa migration
 * (et un test dans migrations.test.ts) : on ne modifie jamais une version déjà publiée.
 */
export const SCHEMA_V1 = {
  settings: 'id',
  profile: 'id',
  locations: 'id',
  equipment: 'id, kind',
  customExercises: 'id',
  exerciseMeta: 'exerciseId',
  programs: 'id, createdAt',
  events: 'id, date, kind, seriesId, status, workoutId, climbingSessionId',
  eventSeries: 'id',
  workouts: 'id, date, status, programId, eventId',
  climbingSessions: 'id, date, status',
  gradeScales: 'id',
  goals: 'id, kind',
  bodyMetrics: 'id, date',
  snapshots: 'id, createdAt',
} as const

/** Version 2 : nutrition (aliments, journal des repas, objectifs), Oura et secrets (clé d'IA, jeton Oura). */
export const SCHEMA_V2 = {
  foods: 'id, barcode, source',
  foodEntries: 'id, date, foodId',
  nutritionGoals: 'id',
  ouraDays: 'date',
  secrets: 'id',
} as const

/**
 * Version 3 : coach IA (conseils du jour, analyses physiques, frigo et placards, discussion) et compteur
 * des demandes à Claude. Rien à convertir : seulement de nouvelles tables, vides au départ.
 */
export const SCHEMA_V3 = {
  coachDays: 'date',
  bodyReviews: 'date',
  pantryItems: 'id, place',
  coachMessages: 'id, seq',
  aiUsage: 'month',
} as const

export const DB_VERSION = 3

/**
 * Toutes les tables qui contiennent des données de l'utilisateur (exportées dans les sauvegardes et
 * remplacées par une restauration). Une nouvelle table va à la fin de cette liste, ou dans DEVICE_TABLES.
 */
export const DATA_TABLES = [
  'settings',
  'profile',
  'locations',
  'equipment',
  'customExercises',
  'exerciseMeta',
  'programs',
  'events',
  'eventSeries',
  'workouts',
  'climbingSessions',
  'gradeScales',
  'goals',
  'bodyMetrics',
  'foods',
  'foodEntries',
  'nutritionGoals',
  'ouraDays',
  'coachDays',
  'bodyReviews',
  'pantryItems',
  'coachMessages',
] as const

export type DataTableName = (typeof DATA_TABLES)[number]

/**
 * Tables propres à cet appareil, jamais dans les sauvegardes et gardées par une restauration : copies de
 * sécurité, secrets (clé d'IA, jeton Oura) et compteur des demandes à Claude. « Tout effacer » les vide.
 */
export const DEVICE_TABLES = ['snapshots', 'secrets', 'aiUsage'] as const

export function createDb(name = 'calitrack'): CaliTrackDB {
  const instance = new Dexie(name) as CaliTrackDB
  instance.version(1).stores(SCHEMA_V1)
  instance
    .version(2)
    .stores(SCHEMA_V2)
    .upgrade(async (tx) => {
      await tx
        .table('settings')
        .toCollection()
        .modify((row: Record<string, unknown>) => {
          Object.assign(row, settingsV1toV2(row))
        })
    })
  instance.version(3).stores(SCHEMA_V3)
  return instance
}

export const db = createDb()
