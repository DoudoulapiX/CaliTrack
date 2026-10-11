import type { EquipmentKind, Exercise, ExerciseCategory, ExerciseMeasure, Muscle } from '@/db/types'
import { frenchSpacing } from '../../lib/typography.ts'
import { FEDB_MERGED_INTO } from './calisthenics.ts'

/*
 * Transforme la base libre free-exercise-db (domaine public, en anglais) en fiches CaliTrack en français.
 * scripts/build-exercises.ts écrit le résultat dans src/data/fedb.json ; un test vérifie que ce fichier
 * correspond toujours à la source et aux traductions (scripts/i18n/fr).
 */

/** Fiche telle que publiée par free-exercise-db. */
export interface FedbRaw {
  id: string
  name: string
  force: 'push' | 'pull' | 'static' | null
  level: 'beginner' | 'intermediate' | 'expert'
  mechanic: 'compound' | 'isolation' | null
  equipment: string | null
  primaryMuscles: Muscle[]
  secondaryMuscles: Muscle[]
  instructions: string[]
  category: ExerciseCategory
  images: string[]
}

/** Traduction française d'une fiche, avec d'éventuelles corrections. */
export interface FedbTranslation {
  /** Nom. */
  n: string
  /** Étapes. */
  s?: string[]
  /** Conseils. */
  t?: string[]
  /** Matériel, s'il diffère de la déduction automatique. */
  e?: EquipmentKind[][]
  /** Mesure, si elle diffère de la déduction automatique. */
  m?: ExerciseMeasure
  /** Un côté après l'autre, si cela diffère de la déduction automatique. */
  u?: boolean
}

export type FedbTranslations = Record<string, FedbTranslation>

const BY_EQUIPMENT: Record<string, EquipmentKind[][]> = {
  'body only': [],
  machine: [['gymMachines']],
  other: [['other']],
  'foam roll': [['foamRoller']],
  kettlebells: [['kettlebell']],
  dumbbell: [['dumbbells']],
  cable: [['cableMachine']],
  barbell: [['barbell']],
  bands: [['bands']],
  'medicine ball': [['medicineBall']],
  'exercise ball': [['swissBall']],
  'e-z curl bar': [['ezBar']],
}

const BOX: EquipmentKind[][] = [['box'], ['bench']]
const BAR: EquipmentKind[][] = [['pullupBar']]
const STRAPS: EquipmentKind[][] = [['trx'], ['rings']]
const SLED: EquipmentKind[][] = [['sled']]
const PLATES: EquipmentKind[][] = [['plates']]

/** Matériel des fiches mal classées dans la base d'origine (« body only », « other » ou sans matériel). */
const EQUIPMENT_FIXES: Record<string, EquipmentKind[][]> = {
  // « other »
  'Anterior_Tibialis-SMR': [['foamRoller']],
  'Foot-SMR': [['foamRoller']],
  'Neck-SMR': [['foamRoller']],
  Backward_Drag: SLED,
  Bear_Crawl_Sled_Drags: SLED,
  Forward_Drag_with_Press: SLED,
  Prowler_Sprint: SLED,
  'Sled_Drag_-_Harness': SLED,
  Sled_Overhead_Backward_Walk: SLED,
  Sled_Overhead_Triceps_Extension: SLED,
  Sled_Push: SLED,
  Sled_Reverse_Flye: SLED,
  Sled_Row: SLED,
  Behind_Head_Chest_Stretch: [],
  Bench_Sprint: BOX,
  Bodyweight_Mid_Row: [['pullupBar'], ['lowBar']],
  Box_Jump_Multiple_Response: [['box']],
  Box_Skip: [['box']],
  Front_Box_Jump: [['box']],
  Lateral_Box_Jump: [['box']],
  Side_to_Side_Box_Shuffle: [['box']],
  'Single-Leg_High_Box_Squat': BOX,
  Depth_Jump_Leap: [['box']],
  Linear_Depth_Jump: [['box']],
  'Incline_Push-Up_Depth_Jump': BOX,
  Drop_Push: [['box']],
  Quick_Leap: [['box']],
  'Single-Leg_Stride_Jump': BOX,
  'Single_Leg_Push-off': BOX,
  Stride_Jump_Crossover: BOX,
  Chair_Leg_Extended_Stretch: [['chair']],
  Chair_Upper_Body_Stretch: [['chair']],
  Chest_And_Front_Of_Shoulder_Stretch: [],
  'Dips_-_Chest_Version': [['dipBars']],
  Farmers_Walk: [['dumbbells'], ['kettlebell']],
  Front_Cone_Hops_or_hurdle_hops: [],
  Hurdle_Hops: [],
  Lateral_Cone_Hops: [],
  'Single-Cone_Sprint_Drill': [],
  'Side_Hop-Sprint': [],
  'Single-Leg_Hop_Progression': [],
  'Single-Leg_Lateral_Hop': [],
  Front_Plate_Raise: PLATES,
  Plate_Pinch: PLATES,
  Plate_Twist: PLATES,
  Reverse_Plate_Curls: PLATES,
  Standing_Olympic_Plate_Hand_Squeeze: PLATES,
  Svend_Press: PLATES,
  'Otis-Up': [['plates'], ['dumbbells']],
  Gironda_Sternum_Chins: BAR,
  Mixed_Grip_Chin: BAR,
  Side_To_Side_Chins: BAR,
  Kipping_Muscle_Up: BAR,
  One_Handed_Hang: BAR,
  'Rocky_Pull-Ups_Pulldowns': [['pullupBar', 'cableMachine']],
  Weighted_Pull_Ups: [
    ['pullupBar', 'weightVest'],
    ['pullupBar', 'dumbbells'],
  ],
  Hyperextensions_Back_Extensions: [['gymMachines']],
  Inverted_Row_with_Straps: STRAPS,
  Suspended_Fallout: STRAPS,
  'Suspended_Push-Up': STRAPS,
  Suspended_Reverse_Crunch: STRAPS,
  Suspended_Row: STRAPS,
  Suspended_Split_Squat: STRAPS,
  Knee_Hip_Raise_On_Parallel_Bars: [['dipBars']],
  Lying_Face_Down_Plate_Neck_Resistance: [['bench', 'plates']],
  Lying_Face_Up_Plate_Neck_Resistance: [['bench', 'plates']],
  Rope_Jumping: [['jumpRope']],
  Seated_Band_Hamstring_Curl: [['bands']],
  'Weighted_Sit-Ups_-_With_Bands': [['bench', 'bands']],
  Weighted_Bench_Dip: [['bench', 'plates']],
  IT_Band_and_Glute_Stretch: [],
  Intermediate_Groin_Stretch: [],
  Intermediate_Hip_Flexor_and_Quad_Stretch: [],
  Lying_Bent_Leg_Groin: [],
  Lying_Hamstring: [],
  'On-Your-Back_Quad_Stretch': [],
  Overhead_Lat: [],
  Peroneals_Stretch: [],
  Posterior_Tibialis_Stretch: [],
  Quad_Stretch: [],
  Round_The_World_Shoulder_Stretch: [],
  Seated_Hamstring_and_Calf_Stretch: [],
  Standing_Biceps_Stretch: [],
  Standing_Elevated_Quad_Stretch: [],
  Standing_Hamstring_and_Calf_Stretch: [],
  Platform_Hamstring_Slides: [],
  // « body only » ou sans matériel
  Chair_Lower_Back_Stretch: [['chair']],
  Bench_Jump: BOX,
  'Close-Grip_Push-Up_off_of_a_Dumbbell': [['dumbbells']],
  'Crunch_-_Legs_On_Exercise_Ball': [['swissBall']],
  Decline_Crunch: [['bench']],
  Decline_Oblique_Crunch: [['bench']],
  Decline_Reverse_Crunch: [['bench']],
  'Flat_Bench_Leg_Pull-In': [['bench']],
  Flat_Bench_Lying_Leg_Raise: [['bench']],
  'Seated_Flat_Bench_Leg_Pull-In': [['bench']],
  Seated_Leg_Tucks: [['bench'], ['chair']],
  Gorilla_Chin_Crunch: BAR,
  'V-Bar_Pullup': BAR,
  'Wide-Grip_Rear_Pull-Up': BAR,
  Hyperextensions_With_No_Hyperextension_Bench: [['bench']],
  'Step-up_with_Knee_Raise': BOX,
}

const NEEDS_BENCH = /(^|_)(Bench|Incline|Decline|Preacher|Lying|Seated)(_|$)/
const FREE_WEIGHTS = new Set(['barbell', 'dumbbell', 'e-z curl bar'])
const TIME_NAME =
  /(^|_)(Plank|Isometric|Hold|Vacuum|Carry|Sprint|Battling_Ropes|Rope_Jumping|Skating|Bicycling)(_|$)|(^|_)Walk$/
const UNILATERAL_NAME = /(^|[_-])(Single|One)[_-](Arm|Leg|Handed)([_-]|$)/i

function equipmentOf(raw: FedbRaw): EquipmentKind[][] {
  const fixed = EQUIPMENT_FIXES[raw.id]
  if (fixed) return fixed
  if (/(^|_)Smith(_|$)/.test(raw.id)) return [['smithMachine']]
  const base = BY_EQUIPMENT[raw.equipment ?? 'body only'] ?? [['other']]
  if (raw.equipment && FREE_WEIGHTS.has(raw.equipment) && NEEDS_BENCH.test(raw.id)) {
    return base.map((alternative) => [...alternative, 'bench'])
  }
  return base
}

function measureOf(raw: FedbRaw): ExerciseMeasure {
  if (raw.category === 'stretching' || raw.category === 'cardio') return 'time'
  return TIME_NAME.test(raw.id) ? 'time' : 'reps'
}

export function fedbToExercise(raw: FedbRaw, fr: FedbTranslation | undefined): Exercise {
  return {
    id: raw.id,
    name: frenchSpacing(fr?.n ?? raw.name),
    nameEn: raw.name,
    aliases: [],
    category: raw.category,
    level: raw.level,
    mechanic: raw.mechanic,
    force: raw.force,
    primaryMuscles: raw.primaryMuscles,
    secondaryMuscles: raw.secondaryMuscles,
    equipment: fr?.e ?? equipmentOf(raw),
    instructions: (fr?.s ?? raw.instructions).map(frenchSpacing),
    tips: (fr?.t ?? []).map(frenchSpacing),
    figure: null,
    frames: raw.images.map((_, index) => `${raw.id}/${index}.webp`),
    measure: fr?.m ?? measureOf(raw),
    unilateral: fr?.u ?? UNILATERAL_NAME.test(raw.id),
    source: 'fedb',
  }
}

/** Fiches de la base générale, sans celles fusionnées dans une fiche CaliTrack, triées par identifiant. */
export function buildFedbExercises(raws: FedbRaw[], translations: FedbTranslations): Exercise[] {
  return raws
    .filter((raw) => !Object.hasOwn(FEDB_MERGED_INTO, raw.id))
    .map((raw) => fedbToExercise(raw, translations[raw.id]))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/** Problèmes dans les traductions : clés inconnues, fiches fusionnées, textes vides. */
export function translationProblems(raws: FedbRaw[], translations: FedbTranslations): string[] {
  const ids = new Set(raws.map((raw) => raw.id))
  const problems: string[] = []
  for (const [id, fr] of Object.entries(translations)) {
    if (!ids.has(id)) problems.push(`${id} : fiche inconnue`)
    else if (Object.hasOwn(FEDB_MERGED_INTO, id))
      problems.push(`${id} : fusionnée dans ${FEDB_MERGED_INTO[id] ?? ''}`)
    if (!fr.n.trim()) problems.push(`${id} : nom vide`)
    if (fr.s?.length === 0 || fr.s?.some((step) => !step.trim())) problems.push(`${id} : étape vide`)
    if (fr.t?.some((tip) => !tip.trim())) problems.push(`${id} : conseil vide`)
  }
  return problems
}

/** Une fiche par ligne : le fichier reste lisible et ses différences faciles à relire. */
export function serializeExercises(list: Exercise[]): string {
  return `[\n${list.map((exercise) => JSON.stringify(exercise)).join(',\n')}\n]\n`
}
