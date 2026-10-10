import type { ISODate, Weekday } from '@/lib/dates'
import type { WeightUnit } from '@/lib/units'

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

export type ThemeMode = 'system' | 'light' | 'dark'

/** Écrans qui peuvent occuper un onglet de la barre du bas. */
export type TabKey = 'today' | 'calendar' | 'training' | 'climbing' | 'goals' | 'library'

/** Cartes du tableau de bord « Aujourd'hui ». */
export type DashboardCardKey = 'todaySession' | 'week' | 'goals' | 'climbing' | 'weight' | 'records'

/** Modules que l'on peut masquer. */
export type ModuleKey = 'climbing'

export interface AppSettings {
  id: 'app'
  themeMode: ThemeMode
  accent: string
  weightUnit: WeightUnit
  tabs: TabKey[]
  dashboardCards: DashboardCardKey[]
  hiddenModules: ModuleKey[]
  restTimerDefaultSec: number
  restTimerSound: boolean
  voiceCues: boolean
  keepScreenOn: boolean
  backupReminderDays: number
  lastBackupAt: string | null
  onboardingDone: boolean
  activeGradeScaleId: string
  climbingGym: string
  /** Lieu utilisé pour filtrer les exercices « avec mon matériel ». */
  currentLocationId: string | null
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Profil                                                              */
/* ------------------------------------------------------------------ */

export type Sex = 'male' | 'female' | 'other'
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type GoalFocus = 'strength' | 'muscle' | 'fatLoss' | 'skills' | 'climbing' | 'endurance' | 'mobility'

export interface LevelTest {
  date: ISODate
  pushUps: number | null
  pullUps: number | null
  dips: number | null
  squats: number | null
  plankSec: number | null
  deadHangSec: number | null
}

export interface Profile {
  id: 'me'
  firstName: string
  birthYear: number | null
  sex: Sex | null
  heightCm: number | null
  weightKg: number | null
  experience: ExperienceLevel
  focuses: GoalFocus[]
  targetSkills: string[]
  sessionsPerWeek: number
  sessionMinutes: number
  trainingDays: Weekday[]
  climbingDays: Weekday[]
  levelTest: LevelTest | null
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Matériel et lieux                                                   */
/* ------------------------------------------------------------------ */

/**
 * Types de matériel connus. Les exercices déclarent ce dont ils ont besoin avec ces clés.
 * « floor » (le sol) et « wall » (un mur) sont toujours disponibles.
 */
export type EquipmentKind =
  | 'pullupBar'
  | 'rings'
  | 'dipBars'
  | 'parallettes'
  | 'lowBar'
  | 'bands'
  | 'dumbbells'
  | 'kettlebell'
  | 'barbell'
  | 'ezBar'
  | 'plates'
  | 'bench'
  | 'box'
  | 'chair'
  | 'table'
  | 'weightVest'
  | 'hangboard'
  | 'jumpRope'
  | 'abWheel'
  | 'trx'
  | 'mat'
  | 'foamRoller'
  | 'medicineBall'
  | 'swissBall'
  | 'cableMachine'
  | 'gymMachines'
  | 'smithMachine'
  | 'sled'
  | 'pole'
  | 'floor'
  | 'wall'
  | 'other'

export type LocationIcon = 'home' | 'gym' | 'park' | 'climb' | 'other'

export interface Location {
  id: string
  name: string
  icon: LocationIcon
  createdAt: string
}

export interface EquipmentItem {
  id: string
  kind: EquipmentKind
  name: string
  /** Charges disponibles en kg (haltères, kettlebells, gilet lesté, disques). */
  weightsKg: number[]
  /** Niveaux d'élastiques, du plus léger au plus fort. */
  bandLevels: string[]
  note: string
  locationIds: string[]
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Exercices                                                           */
/* ------------------------------------------------------------------ */

export type Muscle =
  | 'abdominals'
  | 'abductors'
  | 'adductors'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'forearms'
  | 'glutes'
  | 'hamstrings'
  | 'lats'
  | 'lower back'
  | 'middle back'
  | 'neck'
  | 'quadriceps'
  | 'shoulders'
  | 'traps'
  | 'triceps'

export type ExerciseCategory =
  | 'strength'
  | 'skill'
  | 'stretching'
  | 'plyometrics'
  | 'powerlifting'
  | 'olympic weightlifting'
  | 'strongman'
  | 'cardio'
  | 'mobility'

export type ExerciseLevel = 'beginner' | 'intermediate' | 'expert'

/** Ce que l'on note pour chaque série. */
export type ExerciseMeasure = 'reps' | 'time'

export interface Exercise {
  id: string
  name: string
  nameEn: string | null
  aliases: string[]
  category: ExerciseCategory
  level: ExerciseLevel
  mechanic: 'compound' | 'isolation' | null
  force: 'push' | 'pull' | 'static' | null
  primaryMuscles: Muscle[]
  secondaryMuscles: Muscle[]
  /** Liste d'alternatives : il suffit d'avoir tout le matériel d'une des listes. [] = rien. */
  equipment: EquipmentKind[][]
  instructions: string[]
  tips: string[]
  /** Animation de silhouette (exercices CaliTrack), identifiant dans content/figures. */
  figure: string | null
  /** Photos de démonstration (chemins relatifs dans public/ex). */
  frames: string[]
  measure: ExerciseMeasure
  /** Vrai si l'exercice se fait un côté après l'autre. */
  unilateral: boolean
  source: 'fedb' | 'calitrack' | 'custom'
}

export interface ExerciseMeta {
  exerciseId: string
  favorite: boolean
  note: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Programmes                                                          */
/* ------------------------------------------------------------------ */

export type SlotTarget =
  { kind: 'reps'; min: number; max: number } | { kind: 'time'; min: number; max: number }

export interface ProgramSlot {
  id: string
  /** Progression suivie (voir content/programs/ladders) ; null pour un exercice fixe. */
  ladderId: string | null
  exerciseId: string
  sets: number
  target: SlotTarget
  /** Charge ajoutée (haltère, kettlebell, gilet lesté) ; null au poids du corps. */
  loadKg: number | null
  restSec: number
  note: string
  /** Séances réussies (toutes les séries en haut de la fourchette) d'affilée. */
  successStreak: number
  /** Séances ratées (moyenne des séries sous le bas de la fourchette) d'affilée. */
  failStreak: number
}

export type BlockKind = 'warmup' | 'skill' | 'strength' | 'core' | 'conditioning' | 'cooldown'

export interface ProgramBlock {
  id: string
  kind: BlockKind
  title: string
  slots: ProgramSlot[]
}

export type SessionEmphasis = 'full' | 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'skills'

export interface ProgramSession {
  id: string
  name: string
  emphasis: SessionEmphasis
  /** Jours de la semaine où cette séance est prévue. */
  weekdays: Weekday[]
  blocks: ProgramBlock[]
}

export interface Program {
  id: string
  name: string
  active: boolean
  source: 'generated' | 'custom'
  focuses: GoalFocus[]
  /** Lieu dont le matériel sert au programme ; null : tout le matériel. */
  locationId: string | null
  sessions: ProgramSession[]
  startDate: ISODate
  /** Une semaine allégée toutes les N semaines ; null : jamais. */
  deloadEveryWeeks: number | null
  /** Pourquoi ce programme : explications écrites à sa création. */
  rationale: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Calendrier                                                          */
/* ------------------------------------------------------------------ */

export type EventKind = 'program' | 'climbing' | 'cardio' | 'custom' | 'rest'
export type EventStatus = 'planned' | 'done' | 'skipped'

export interface CalendarEvent {
  id: string
  date: ISODate
  time: string | null
  kind: EventKind
  title: string
  durationMin: number | null
  programId: string | null
  programSessionId: string | null
  seriesId: string | null
  status: EventStatus
  workoutId: string | null
  climbingSessionId: string | null
  energyKcal: number | null
  distanceKm: number | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface EventSeries {
  id: string
  kind: EventKind
  title: string
  weekdays: Weekday[]
  intervalWeeks: number
  startDate: ISODate
  endDate: ISODate | null
  time: string | null
  durationMin: number | null
  notes: string
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Séances réalisées                                                   */
/* ------------------------------------------------------------------ */

export interface WorkoutSet {
  id: string
  reps: number | null
  durationSec: number | null
  loadKg: number | null
  assistance: string | null
  rpe: number | null
  done: boolean
  completedAt: string | null
}

export interface WorkoutExercise {
  id: string
  exerciseId: string
  slotId: string | null
  /** Bloc de la séance prévue (échauffement, renforcement…) ; null pour un exercice ajouté en route. */
  block: BlockKind | null
  target: SlotTarget | null
  restSec: number
  sets: WorkoutSet[]
  note: string
}

export type ProgressionKind =
  'levelUp' | 'levelDown' | 'moreLoad' | 'lessLoad' | 'moreReps' | 'lessReps' | 'keep'

/** Ce qui change pour la prochaine fois, après une séance (le texte est composé à l'affichage). */
export interface ProgressionChange {
  slotId: string
  fromExerciseId: string
  toExerciseId: string
  fromTarget: SlotTarget
  toTarget: SlotTarget
  fromLoadKg: number | null
  toLoadKg: number | null
  kind: ProgressionKind
}

export interface Workout {
  id: string
  date: ISODate
  startedAt: string
  endedAt: string | null
  title: string
  programId: string | null
  programSessionId: string | null
  eventId: string | null
  exercises: WorkoutExercise[]
  rpe: number | null
  notes: string
  status: 'active' | 'done'
  /** Semaine allégée : moins de séries et pas de progression. */
  deload: boolean
  progression: ProgressionChange[]
}

/* ------------------------------------------------------------------ */
/* Escalade                                                            */
/* ------------------------------------------------------------------ */

export interface Grade {
  key: string
  label: string
  color: string
  textColor: string
  font: string
}

export interface GradeScale {
  id: string
  name: string
  grades: Grade[]
  builtIn: boolean
}

export type BoulderResult = 'flash' | 'sent' | 'project' | 'failed'

export type ClimbStyle =
  | 'slab'
  | 'vertical'
  | 'overhang'
  | 'roof'
  | 'crimps'
  | 'slopers'
  | 'pinches'
  | 'pockets'
  | 'jugs'
  | 'dyno'
  | 'coordination'
  | 'compression'
  | 'technical'
  | 'endurance'

export interface BoulderAttempt {
  id: string
  gradeKey: string
  result: BoulderResult
  attempts: number
  styles: ClimbStyle[]
  note: string
  createdAt: string
}

export interface ClimbingSession {
  id: string
  date: ISODate
  gym: string
  scaleId: string
  durationMin: number | null
  notes: string
  eventId: string | null
  boulders: BoulderAttempt[]
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Objectifs                                                           */
/* ------------------------------------------------------------------ */

export type MilestoneCriterion =
  | { kind: 'reps'; exerciseId: string; value: number }
  | { kind: 'time'; exerciseId: string; value: number }
  | { kind: 'load'; exerciseId: string; value: number }

export interface GoalMilestone {
  id: string
  title: string
  criterion: MilestoneCriterion | null
  achievedAt: string | null
}

export type GoalKind = 'skill' | 'exercise' | 'bodyweight' | 'climbing' | 'custom'

export interface Goal {
  id: string
  kind: GoalKind
  title: string
  pinned: boolean
  archived: boolean
  achievedAt: string | null
  deadline: ISODate | null
  /** Objectif « figure » : étapes à franchir. */
  skillId: string | null
  milestones: GoalMilestone[]
  /** Objectif « exercice » : atteindre une valeur (répétitions, secondes ou kg). */
  exerciseId: string | null
  metric: 'reps' | 'time' | 'load' | null
  startValue: number | null
  targetValue: number | null
  /** Objectif « escalade » : réussir N blocs d'un niveau donné. */
  scaleId: string | null
  gradeKey: string | null
  targetCount: number | null
  /** Objectif libre : avancement saisi à la main, de 0 à 100. */
  manualProgress: number
  createdAt: string
  updatedAt: string
}

/* ------------------------------------------------------------------ */
/* Corps                                                               */
/* ------------------------------------------------------------------ */

export interface BodyMetric {
  id: string
  date: ISODate
  weightKg: number | null
  bodyFatPct: number | null
  waistCm: number | null
  note: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* Copies de sécurité internes                                         */
/* ------------------------------------------------------------------ */

export interface Snapshot {
  id: string
  createdAt: string
  reason: 'before-import' | 'manual'
  sizeBytes: number
  data: string
}
