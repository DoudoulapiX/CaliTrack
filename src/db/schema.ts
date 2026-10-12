import { z } from 'zod'
import { isISODate } from '@/lib/dates'
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
  Workout,
} from './types'

/*
 * Schémas de validation des données importées (sauvegardes). Ils reproduisent exactement les types
 * de types.ts : la vérification de compilation en bas du fichier échoue si l'un des deux change seul.
 */

const isoDate = z.string().refine(isISODate, 'Date invalide')
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
  tabs: z.array(z.enum(['today', 'calendar', 'training', 'nutrition', 'climbing', 'goals', 'library'])),
  dashboardCards: z.array(
    z.enum(['todaySession', 'recovery', 'nutrition', 'week', 'goals', 'climbing', 'weight', 'records']),
  ),
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
  aiModel: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']),
  ouraClientId: z.string(),
  ouraRelayUrl: z.string(),
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

const blockKind = z.enum(['warmup', 'skill', 'strength', 'core', 'conditioning', 'cooldown'])

const programBlock = z.object({
  id: z.string().min(1),
  kind: blockKind,
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
  block: blockKind.nullable(),
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
  plannedFor: isoDate.nullable(),
  eventId: z.string().nullable(),
  exercises: z.array(workoutExercise),
  rpe: z.number().min(0).max(10).nullable(),
  notes: z.string(),
  status: z.enum(['active', 'done']),
  deload: z.boolean(),
  progression: z.array(progressionChange),
})

/** Un texte qui n'est pas fait que d'espaces. */
const named = z.string().regex(/\S/, 'Nom vide')

const grade = z.object({
  key: z.string().min(1),
  label: named,
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  font: z.string(),
})

export const gradeScaleSchema = z.object({
  id: z.string().min(1),
  name: named,
  grades: z
    .array(grade)
    .min(1)
    .refine((grades) => new Set(grades.map((g) => g.key)).size === grades.length, 'Niveau en double'),
  builtIn: z.boolean(),
})

const boulder = z.object({
  id: z.string().min(1),
  gradeKey: z.string(),
  result: z.enum(['flash', 'sent', 'project', 'failed']),
  attempts: z.number().int().min(1),
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

export const climbingSessionSchema = z
  .object({
    id: z.string().min(1),
    date: isoDate,
    status: z.enum(['active', 'done']),
    startedAt: timestamp,
    endedAt: timestamp.nullable(),
    gym: z.string(),
    scaleId: z.string().min(1),
    durationMin: z.number().int().min(0).max(1440).nullable(),
    rpe: z.number().min(0).max(10).nullable(),
    notes: z.string(),
    boulders: z.array(boulder),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .refine((s) => (s.status === 'active') === (s.endedAt === null), {
    message: 'Une séance en cours n’a pas de fin, une séance terminée en a une.',
    path: ['endedAt'],
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

const grams = z.number().min(0)

const nutrients = z.object({
  kcal: grams,
  protein: grams,
  carbs: grams,
  fat: grams,
  fiber: grams.nullable(),
  sugars: grams.nullable(),
  satFat: grams.nullable(),
  salt: grams.nullable(),
})

export const foodSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['off', 'custom']),
  name: named,
  brand: z.string(),
  barcode: z.string().nullable(),
  per100: nutrients,
  servingG: z.number().positive().nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const foodEntrySchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  source: z.enum(['ciqual', 'off', 'custom', 'ai', 'quick']),
  foodId: z.string().nullable(),
  name: named,
  grams: z.number().positive().nullable(),
  per100: nutrients.nullable(),
  nutrients,
  note: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const nutritionGoalsSchema = z.object({
  id: z.literal('me'),
  phase: z.enum(['cut', 'maintain', 'bulk']),
  activity: z.enum(['sedentary', 'light', 'moderate', 'active', 'veryActive']),
  kcal: z.number().int().positive().nullable(),
  proteinG: grams.nullable(),
  carbsG: grams.nullable(),
  fatG: grams.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const ouraDaySchema = z.object({
  date: isoDate,
  sleepScore: z.number().nullable(),
  readinessScore: z.number().nullable(),
  activityScore: z.number().nullable(),
  sleepMin: z.number().min(0).nullable(),
  sleepEfficiency: z.number().nullable(),
  hrvMs: z.number().min(0).nullable(),
  lowestHr: z.number().min(0).nullable(),
  temperatureDeviation: z.number().nullable(),
  activeKcal: z.number().min(0).nullable(),
  totalKcal: z.number().min(0).nullable(),
  steps: z.number().min(0).nullable(),
  syncedAt: timestamp,
})

/*
 * Coach IA. Ces schémas décrivent nos propres données : z.enum y est permis. Les réponses de Claude sont
 * lues avec des schémas plus lâches, puis nettoyées avant d'arriver ici.
 */

const coachChange = z.object({
  slotId: z.string().min(1),
  plannedExerciseId: z.string().min(1),
  action: z.enum(['lighter', 'swap', 'skip']),
  exerciseId: z.string().min(1),
  sets: z.number().int().min(1).max(20),
  target: slotTarget,
  loadKg: z.number().nullable(),
  reason: z.string().max(160),
})

export const coachDaySchema = z.object({
  date: isoDate,
  // Jamais z.enum : une sauvegarde faite avec un ancien modèle doit rester lisible.
  model: z.string(),
  checkIn: z.object({
    sleep: z.enum(['bad', 'ok', 'good']).nullable(),
    energy: z.enum(['low', 'ok', 'high']),
    soreness: z.enum(['none', 'light', 'strong']),
    zones: z.array(z.enum(['back', 'chest', 'shoulders', 'arms', 'forearms', 'core', 'legs'])),
    note: z.string().max(300),
  }),
  basis: z.object({
    readinessScore: z.number().nullable(),
    sleepScore: z.number().nullable(),
    sleepMin: z.number().min(0).nullable(),
    yesterdayKcal: z.number().min(0).nullable(),
  }),
  programId: z.string().nullable(),
  programSessionId: z.string().nullable(),
  decision: z.enum(['asPlanned', 'lighter', 'rest']).nullable(),
  changes: z.array(coachChange),
  headline: z.string().max(80),
  summary: z.string().max(600),
  tips: z.array(z.string().max(200)).max(4),
  ignored: z.boolean(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

const nutritionPhase = z.enum(['cut', 'maintain', 'bulk'])
const bodyFatPct = z.number().min(3).max(60)

export const bodyReviewSchema = z.object({
  date: isoDate,
  model: z.string(),
  suggestedPhase: nutritionPhase,
  phase: nutritionPhase,
  bodyFat: z.object({ low: bodyFatPct, high: bodyFatPct }).nullable(),
  weightKg: z.number().positive(),
  targets: z.object({ kcal: z.number().int().positive(), proteinG: grams, carbsG: grams, fatG: grams }),
  summary: z.string().max(600),
  observations: z.array(z.string().max(200)).max(4),
  advice: z.array(z.string().max(200)).max(4),
  appliedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const pantryItemSchema = z.object({
  id: z.string().min(1),
  place: z.enum(['fridge', 'freezer', 'cupboard']),
  name: named.max(60),
  quantity: z.string().max(40),
  source: z.enum(['manual', 'photo']),
  createdAt: timestamp,
  updatedAt: timestamp,
})

export const coachMessageSchema = z.object({
  id: z.string().min(1),
  seq: z.number().int().min(0),
  role: z.enum(['user', 'assistant']),
  text: named.max(20000),
  model: z.string().nullable(),
  createdAt: timestamp,
})

/** Compteur des demandes à Claude, par mois : il reste sur l'appareil (hors des sauvegardes). */
export const aiUsageSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  calls: z.number().int().min(0),
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  cacheReadTokens: z.number().int().min(0),
  cacheWriteTokens: z.number().int().min(0),
  costUsd: z.number().min(0),
  updatedAt: timestamp,
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
  Expect<Same<z.infer<typeof foodSchema>, Food>>,
  Expect<Same<z.infer<typeof foodEntrySchema>, FoodEntry>>,
  Expect<Same<z.infer<typeof nutritionGoalsSchema>, NutritionGoals>>,
  Expect<Same<z.infer<typeof ouraDaySchema>, OuraDay>>,
  Expect<Same<z.infer<typeof coachDaySchema>, CoachDay>>,
  Expect<Same<z.infer<typeof bodyReviewSchema>, BodyReview>>,
  Expect<Same<z.infer<typeof pantryItemSchema>, PantryItem>>,
  Expect<Same<z.infer<typeof coachMessageSchema>, CoachMessage>>,
  Expect<Same<z.infer<typeof aiUsageSchema>, AiUsageRow>>,
]

/** Schéma de chaque table exportée dans une sauvegarde (aiUsage reste sur l'appareil : pas ici). */
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
  foods: foodSchema,
  foodEntries: foodEntrySchema,
  nutritionGoals: nutritionGoalsSchema,
  ouraDays: ouraDaySchema,
  coachDays: coachDaySchema,
  bodyReviews: bodyReviewSchema,
  pantryItems: pantryItemSchema,
  coachMessages: coachMessageSchema,
} as const
