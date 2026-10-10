import { z } from 'zod'
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
  Workout,
} from './types'

/*
 * Schémas de validation des données importées (sauvegardes). Ils reproduisent exactement les types
 * de types.ts : la vérification de compilation en bas du fichier échoue si l'un des deux change seul.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const timestamp = z.string().min(1)
const weekday = z.literal([1, 2, 3, 4, 5, 6, 7])
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)

export const equipmentKind = z.enum([
  'pullupBar',
  'rings',
  'dipBars',
  'parallettes',
  'lowBar',
  'bands',
  'dumbbells',
  'kettlebell',
  'barbell',
  'ezBar',
  'plates',
  'bench',
  'box',
  'chair',
  'table',
  'weightVest',
  'hangboard',
  'jumpRope',
  'abWheel',
  'trx',
  'mat',
  'foamRoller',
  'medicineBall',
  'swissBall',
  'cableMachine',
  'gymMachines',
  'smithMachine',
  'sled',
  'pole',
  'floor',
  'wall',
  'other',
])

const goalFocus = z.enum(['strength', 'muscle', 'fatLoss', 'skills', 'climbing', 'endurance', 'mobility'])

export const settingsSchema = z.object({
  id: z.literal('app'),
  themeMode: z.enum(['system', 'light', 'dark']),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  weightUnit: z.enum(['kg', 'lb']),
  tabs: z.array(z.enum(['today', 'calendar', 'training', 'climbing', 'goals', 'library'])),
  dashboardCards: z.array(z.enum(['todaySession', 'week', 'goals', 'climbing', 'weight', 'records'])),
  hiddenModules: z.array(z.enum(['climbing'])),
  restTimerDefaultSec: z.number().int().min(0).max(3600),
  restTimerSound: z.boolean(),
  voiceCues: z.boolean(),
  keepScreenOn: z.boolean(),
  backupReminderDays: z.number().int().min(0).max(365),
  lastBackupAt: timestamp.nullable(),
  onboardingDone: z.boolean(),
  activeGradeScaleId: z.string(),
  climbingGym: z.string(),
  currentLocationId: z.string().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const levelTestSchema = z.object({
  date: isoDate,
  pushUps: z.number().int().min(0).nullable(),
  pullUps: z.number().int().min(0).nullable(),
  dips: z.number().int().min(0).nullable(),
  squats: z.number().int().min(0).nullable(),
  plankSec: z.number().int().min(0).nullable(),
  deadHangSec: z.number().int().min(0).nullable(),
})

export const profileSchema = z.object({
  id: z.literal('me'),
  firstName: z.string(),
  birthYear: z.number().int().nullable(),
  sex: z.enum(['male', 'female', 'other']).nullable(),
  heightCm: z.number().positive().nullable(),
  weightKg: z.number().positive().nullable(),
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  focuses: z.array(goalFocus),
  targetSkills: z.array(z.string()),
  sessionsPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(10).max(240),
  trainingDays: z.array(weekday),
  climbingDays: z.array(weekday),
  levelTest: levelTestSchema.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const locationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  icon: z.enum(['home', 'gym', 'park', 'climb', 'other']),
  createdAt: timestamp,
})

export const equipmentSchema = z.object({
  id: z.string().min(1),
  kind: equipmentKind,
  name: z.string(),
  weightsKg: z.array(z.number().positive()),
  bandLevels: z.array(z.string()),
  note: z.string(),
  locationIds: z.array(z.string()),
  createdAt: timestamp,
})

const muscle = z.enum([
  'abdominals',
  'abductors',
  'adductors',
  'biceps',
  'calves',
  'chest',
  'forearms',
  'glutes',
  'hamstrings',
  'lats',
  'lower back',
  'middle back',
  'neck',
  'quadriceps',
  'shoulders',
  'traps',
  'triceps',
])

export const exerciseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameEn: z.string().nullable(),
  aliases: z.array(z.string()),
  category: z.enum([
    'strength',
    'skill',
    'stretching',
    'plyometrics',
    'powerlifting',
    'olympic weightlifting',
    'strongman',
    'cardio',
    'mobility',
  ]),
  level: z.enum(['beginner', 'intermediate', 'expert']),
  mechanic: z.enum(['compound', 'isolation']).nullable(),
  force: z.enum(['push', 'pull', 'static']).nullable(),
  primaryMuscles: z.array(muscle),
  secondaryMuscles: z.array(muscle),
  equipment: z.array(z.array(equipmentKind)),
  instructions: z.array(z.string()),
  tips: z.array(z.string()),
  figure: z.string().nullable(),
  frames: z.array(z.string()),
  measure: z.enum(['reps', 'time']),
  unilateral: z.boolean(),
  source: z.enum(['fedb', 'calitrack', 'custom']),
})

export const exerciseMetaSchema = z.object({
  exerciseId: z.string().min(1),
  favorite: z.boolean(),
  note: z.string(),
  updatedAt: timestamp,
})

const slotTarget = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reps'), min: z.number().min(0), max: z.number().min(0) }),
  z.object({ kind: z.literal('time'), min: z.number().min(0), max: z.number().min(0) }),
])

const programSlot = z.object({
  id: z.string().min(1),
  ladderId: z.string().nullable(),
  exerciseId: z.string().min(1),
  sets: z.number().int().min(1).max(20),
  target: slotTarget,
  loadKg: z.number().nullable(),
  restSec: z.number().int().min(0).max(3600),
  note: z.string(),
  successStreak: z.number().int().min(0),
  failStreak: z.number().int().min(0),
})

const programBlock = z.object({
  id: z.string().min(1),
  kind: z.enum(['warmup', 'skill', 'strength', 'core', 'conditioning', 'cooldown']),
  title: z.string(),
  slots: z.array(programSlot),
})

const programSession = z.object({
  id: z.string().min(1),
  name: z.string(),
  emphasis: z.enum(['full', 'push', 'pull', 'legs', 'upper', 'lower', 'skills']),
  weekdays: z.array(weekday),
  blocks: z.array(programBlock),
})

export const programSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  active: z.boolean(),
  source: z.enum(['generated', 'custom']),
  focuses: z.array(goalFocus),
  locationId: z.string().nullable(),
  sessions: z.array(programSession),
  startDate: isoDate,
  deloadEveryWeeks: z.number().int().min(2).max(52).nullable(),
  rationale: z.array(z.string()),
  notes: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const eventKind = z.enum(['program', 'climbing', 'cardio', 'custom', 'rest'])

export const eventSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  time: time.nullable(),
  kind: eventKind,
  title: z.string(),
  durationMin: z.number().min(0).nullable(),
  programId: z.string().nullable(),
  programSessionId: z.string().nullable(),
  seriesId: z.string().nullable(),
  status: z.enum(['planned', 'done', 'skipped']),
  workoutId: z.string().nullable(),
  climbingSessionId: z.string().nullable(),
  energyKcal: z.number().min(0).nullable(),
  distanceKm: z.number().min(0).nullable(),
  notes: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const eventSeriesSchema = z.object({
  id: z.string().min(1),
  kind: eventKind,
  title: z.string(),
  weekdays: z.array(weekday),
  intervalWeeks: z.number().int().min(1).max(52),
  startDate: isoDate,
  endDate: isoDate.nullable(),
  time: time.nullable(),
  durationMin: z.number().min(0).nullable(),
  notes: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const workoutSet = z.object({
  id: z.string().min(1),
  reps: z.number().min(0).nullable(),
  durationSec: z.number().min(0).nullable(),
  loadKg: z.number().nullable(),
  assistance: z.string().nullable(),
  rpe: z.number().min(0).max(10).nullable(),
  done: z.boolean(),
  completedAt: timestamp.nullable(),
})

const workoutExercise = z.object({
  id: z.string().min(1),
  exerciseId: z.string().min(1),
  slotId: z.string().nullable(),
  target: slotTarget.nullable(),
  restSec: z.number().int().min(0).max(3600),
  sets: z.array(workoutSet),
  note: z.string(),
})

const progressionChange = z.object({
  slotId: z.string(),
  fromExerciseId: z.string(),
  toExerciseId: z.string(),
  fromTarget: slotTarget,
  toTarget: slotTarget,
  fromLoadKg: z.number().nullable(),
  toLoadKg: z.number().nullable(),
  kind: z.enum(['levelUp', 'levelDown', 'moreLoad', 'lessLoad', 'moreReps', 'lessReps', 'keep']),
})

export const workoutSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  startedAt: timestamp,
  endedAt: timestamp.nullable(),
  title: z.string(),
  programId: z.string().nullable(),
  programSessionId: z.string().nullable(),
  eventId: z.string().nullable(),
  exercises: z.array(workoutExercise),
  rpe: z.number().min(0).max(10).nullable(),
  notes: z.string(),
  status: z.enum(['active', 'done']),
  deload: z.boolean(),
  progression: z.array(progressionChange),
})

const grade = z.object({
  key: z.string().min(1),
  label: z.string(),
  color: z.string(),
  textColor: z.string(),
  font: z.string(),
})

export const gradeScaleSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  grades: z.array(grade),
  builtIn: z.boolean(),
})

const boulder = z.object({
  id: z.string().min(1),
  gradeKey: z.string(),
  result: z.enum(['flash', 'sent', 'project', 'failed']),
  attempts: z.number().int().min(0),
  styles: z.array(
    z.enum([
      'slab',
      'vertical',
      'overhang',
      'roof',
      'crimps',
      'slopers',
      'pinches',
      'pockets',
      'jugs',
      'dyno',
      'coordination',
      'compression',
      'technical',
      'endurance',
    ]),
  ),
  note: z.string(),
  createdAt: timestamp,
})

export const climbingSessionSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  gym: z.string(),
  scaleId: z.string(),
  durationMin: z.number().min(0).nullable(),
  notes: z.string(),
  eventId: z.string().nullable(),
  boulders: z.array(boulder),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const criterion = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reps'), exerciseId: z.string(), value: z.number() }),
  z.object({ kind: z.literal('time'), exerciseId: z.string(), value: z.number() }),
  z.object({ kind: z.literal('load'), exerciseId: z.string(), value: z.number() }),
])

export const goalSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['skill', 'exercise', 'bodyweight', 'climbing', 'custom']),
  title: z.string(),
  pinned: z.boolean(),
  archived: z.boolean(),
  achievedAt: timestamp.nullable(),
  deadline: isoDate.nullable(),
  skillId: z.string().nullable(),
  milestones: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      criterion: criterion.nullable(),
      achievedAt: timestamp.nullable(),
    }),
  ),
  exerciseId: z.string().nullable(),
  metric: z.enum(['reps', 'time', 'load']).nullable(),
  startValue: z.number().nullable(),
  targetValue: z.number().nullable(),
  scaleId: z.string().nullable(),
  gradeKey: z.string().nullable(),
  targetCount: z.number().int().min(0).nullable(),
  manualProgress: z.number().min(0).max(100),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const bodyMetricSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  weightKg: z.number().positive().nullable(),
  bodyFatPct: z.number().min(0).max(100).nullable(),
  waistCm: z.number().positive().nullable(),
  note: z.string(),
  createdAt: timestamp,
})

/* Vérification de compilation : chaque schéma correspond exactement à son type (une différence casse `tsc`). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T
export type SchemaMatchesTypes = [
  Expect<Same<z.infer<typeof settingsSchema>, AppSettings>>,
  Expect<Same<z.infer<typeof profileSchema>, Profile>>,
  Expect<Same<z.infer<typeof locationSchema>, Location>>,
  Expect<Same<z.infer<typeof equipmentSchema>, EquipmentItem>>,
  Expect<Same<z.infer<typeof exerciseSchema>, Exercise>>,
  Expect<Same<z.infer<typeof exerciseMetaSchema>, ExerciseMeta>>,
  Expect<Same<z.infer<typeof programSchema>, Program>>,
  Expect<Same<z.infer<typeof eventSchema>, CalendarEvent>>,
  Expect<Same<z.infer<typeof eventSeriesSchema>, EventSeries>>,
  Expect<Same<z.infer<typeof workoutSchema>, Workout>>,
  Expect<Same<z.infer<typeof gradeScaleSchema>, GradeScale>>,
  Expect<Same<z.infer<typeof climbingSessionSchema>, ClimbingSession>>,
  Expect<Same<z.infer<typeof goalSchema>, Goal>>,
  Expect<Same<z.infer<typeof bodyMetricSchema>, BodyMetric>>,
]

/** Schéma de chaque table exportée dans une sauvegarde. */
export const TABLE_SCHEMAS = {
  settings: settingsSchema,
  profile: profileSchema,
  locations: locationSchema,
  equipment: equipmentSchema,
  customExercises: exerciseSchema,
  exerciseMeta: exerciseMetaSchema,
  programs: programSchema,
  events: eventSchema,
  eventSeries: eventSeriesSchema,
  workouts: workoutSchema,
  climbingSessions: climbingSessionSchema,
  gradeScales: gradeScaleSchema,
  goals: goalSchema,
  bodyMetrics: bodyMetricSchema,
} as const
