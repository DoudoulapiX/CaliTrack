import Dexie, { type EntityTable } from 'dexie'
import type {
  AppSettings,
  BodyMetric,
  CalendarEvent,
  ClimbingSession,
  EquipmentItem,
  EventSeries,
  Exercise,
  ExerciseMeta,
  Goal,
  GradeScale,
  Location,
  Profile,
  Program,
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
}

/**
 * Schéma de la base locale. Toute évolution ajoute une nouvelle version avec sa migration
 * (et un test dans db.test.ts) : on ne modifie jamais une version déjà publiée.
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
  climbingSessions: 'id, date, eventId',
  gradeScales: 'id',
  goals: 'id, kind',
  bodyMetrics: 'id, date',
  snapshots: 'id, createdAt',
} as const

export const DB_VERSION = 1

/** Toutes les tables qui contiennent des données de l'utilisateur (exportées dans les sauvegardes). */
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
] as const

export type DataTableName = (typeof DATA_TABLES)[number]

export function createDb(name = 'calitrack'): CaliTrackDB {
  const instance = new Dexie(name) as CaliTrackDB
  instance.version(1).stores(SCHEMA_V1)
  return instance
}

export const db = createDb()
