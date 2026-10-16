import type { ExerciseMeasure } from '@/db/types'
import type { CountedMovement, CountedVariant, VariantOverrides } from './types.ts'

/*
 * Exercices que la caméra sait compter, par identifiant exact (jamais par le nom, qui est une traduction).
 * Chaque échelon « répétitions » des progressions de pompes, dips, tractions et squats est soit compté, soit
 * listé dans NOT_COUNTED avec sa raison : un nouvel échelon oblige à trancher (movements.test.ts).
 */

const variant = (movement: CountedMovement, overrides: VariantOverrides = {}): CountedVariant => ({
  movement,
  overrides,
})

const all = (ids: readonly string[], value: CountedVariant): [string, CountedVariant][] =>
  ids.map((id) => [id, value])

const SQUATS = [
  'squat',
  'squat-assisted',
  'Goblet_Squat',
  'Dumbbell_Squat',
  'Barbell_Squat',
  'Barbell_Full_Squat',
  'Front_Barbell_Squat',
  'Front_Squats_With_Two_Kettlebells',
  'Front_Squat_Clean_Grip',
  'Wide_Stance_Barbell_Squat',
  'Narrow_Stance_Squats',
  'Plie_Dumbbell_Squat',
  'Squats_-_With_Bands',
  'Overhead_Squat',
  'Zercher_Squats',
  'Box_Squat',
  'Dumbbell_Squat_To_A_Bench',
  'Barbell_Squat_To_A_Bench',
]

/** Pompes filmées de profil. */
const PUSHUPS = [
  'pushup',
  'pushup-decline',
  'pushup-diamond',
  'Push-Up_Wide',
  'Pushups_Close_and_Wide_Hand_Positions',
  'Close-Grip_Push-Up_off_of_a_Dumbbell',
  'Push-Ups_With_Feet_On_An_Exercise_Ball',
]
/** Pompes inclinées : le buste penche moins. */
const INCLINE_PUSHUPS = [
  'pushup-incline',
  'Incline_Push-Up_Medium',
  'Incline_Push-Up_Wide',
  'Incline_Push-Up_Close-Grip',
  'Incline_Push-Up_Reverse_Grip',
  'Suspended_Push-Up',
]

/** Dips filmés de profil. */
const DIPS = ['dip', 'dip-band', 'dip-ring', 'dip-bench', 'Weighted_Bench_Dip']
/** Dips penchés en avant. */
const LEANING_DIPS = ['dip-straight-bar', 'Dips_-_Chest_Version']

const PULLUPS = [
  'pullup',
  'chinup',
  'pullup-band',
  'pullup-chest-to-bar',
  'pullup-l-sit',
  'Weighted_Pull_Ups',
  'V-Bar_Pullup',
  'Mixed_Grip_Chin',
  'Wide-Grip_Rear_Pull-Up',
]

/**
 * Curls aux haltères ou à l'élastique : un bras après l'autre ou les deux ensemble, chaque bras compte (sauf le curl
 * marteau alterné : sa fiche compte les deux bras pour une répétition). Seul le curl alterné aux haltères est vérifié
 * sur de vraies séries (MM-Fit) ; les autres sont en essai, comme les curls à la barre (specFor), jusqu'à des séries
 * filmées qui les vérifient (npm run reps:add).
 */
const ALTERNATE_CURL = 'Dumbbell_Alternate_Bicep_Curl'
const PAIRED_CURL = 'Alternate_Hammer_Curl'
const CURLS = [
  'curl-band',
  'Dumbbell_Bicep_Curl',
  'Hammer_Curls',
  'Cross_Body_Hammer_Curl',
  'Zottman_Curl',
  'Standing_Dumbbell_Reverse_Curl',
  'Standing_Inner-Biceps_Curl',
  'Seated_Dumbbell_Curl',
]
/** Curls à la barre ou à la barre EZ : les deux coudes plient ensemble. */
const BAR_CURLS = [
  'Barbell_Curl',
  'Close-Grip_Standing_Barbell_Curl',
  'Wide-Grip_Standing_Barbell_Curl',
  'Reverse_Barbell_Curl',
  'Drag_Curl',
  'EZ-Bar_Curl',
  'Close-Grip_EZ_Bar_Curl',
  'Close-Grip_EZ-Bar_Curl_with_Band',
]

/** Exercices comptés : identifiant → mouvement et réglages de la variante. */
export const COUNTED_EXERCISES: Readonly<Record<string, CountedVariant>> = Object.fromEntries([
  ...all(SQUATS, variant('squat')),
  ...all(PUSHUPS, variant('pushup')),
  ['pushup-knee', variant('pushup', { bodyLine: 'knee' })],
  ...all(INCLINE_PUSHUPS, variant('pushup', { minTorsoTilt: 25 })),
  ...all(DIPS, variant('dip')),
  ...all(LEANING_DIPS, variant('dip', { maxTorsoTilt: 50 })),
  ...all(PULLUPS, variant('pullup')),
  [ALTERNATE_CURL, variant('curl')],
  ...all(CURLS, variant('curl', { trial: true })),
  [PAIRED_CURL, variant('curl', { trial: true, armPairs: true })],
  ...all(BAR_CURLS, variant('curl', { bothArms: true })),
])

const ONE_SIDE = 'un côté à la fois : le compte par côté n’est pas validé'
const LOWERING = 'descente seule : pas de montée à compter'
const AIRBORNE = 'les mains ou les pieds quittent le sol'
const SUPPORTED = 'buste ou bras appuyé en biais, ou machine'

/** Exercices proches qui ne sont pas comptés, avec la raison (pour le code, pas affichée). */
export const NOT_COUNTED: Readonly<Record<string, string>> = {
  'pushup-wall': 'buste presque vertical : on ne le distingue pas de la station debout',
  'pushup-archer': ONE_SIDE,
  'pushup-one-arm': ONE_SIDE,
  'pullup-archer': ONE_SIDE,
  'pullup-one-arm': ONE_SIDE,
  'split-squat': ONE_SIDE,
  'bulgarian-split-squat': ONE_SIDE,
  Split_Squat_with_Dumbbells: ONE_SIDE,
  'pistol-box': ONE_SIDE,
  'pistol-assisted': ONE_SIDE,
  pistol: ONE_SIDE,
  'shrimp-squat': ONE_SIDE,
  Kettlebell_Pistol_Squat: ONE_SIDE,
  Concentration_Curls: ONE_SIDE,
  Standing_Concentration_Curl: ONE_SIDE,
  'pushup-pseudo-planche': 'mains aux hanches : l’angle du coude en haut n’est pas validé',
  'pushup-clap': AIRBORNE,
  'squat-jump': AIRBORNE,
  Weighted_Jump_Squat: AIRBORNE,
  'dip-negative': LOWERING,
  'pullup-negative': LOWERING,
  'pullup-one-arm-negative': LOWERING,
  'muscleup-negative': LOWERING,
  'hspu-wall-negative': LOWERING,
  Incline_Dumbbell_Curl: SUPPORTED,
  Alternate_Incline_Dumbbell_Curl: SUPPORTED,
  Incline_Hammer_Curls: SUPPORTED,
  Preacher_Curl: SUPPORTED,
  Smith_Machine_Squat: SUPPORTED,
}

/**
 * La variante comptée d'un exercice de la séance, ou null : exercice au temps, pas dans la liste, ou créé par
 * l'utilisateur (`perso-…`, sans mouvement connu).
 */
export function countableVariant(exerciseId: string, measure: ExerciseMeasure): CountedVariant | null {
  if (measure !== 'reps' || !Object.hasOwn(COUNTED_EXERCISES, exerciseId)) return null
  return COUNTED_EXERCISES[exerciseId] ?? null
}
