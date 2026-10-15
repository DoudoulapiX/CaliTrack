import type { CountedMovement, CountedVariant, CounterParams } from './types.ts'

/*
 * Seuils du compteur, tous nommés ici. Squats et curls : valeurs mesurées sur MM-Fit (13,5 h de séances
 * filmées, voir src/test/reps/README.md) ; pompes, dips et tractions : points de départ tirés de la littérature,
 * à régler sur des séries filmées avec MediaPipe (npm run reps:add), d'où `validated: false` (« en essai »).
 * Changer un seuil doit garder toutes les cibles de accuracy.test.ts (npm run reps:eval avant et après).
 */

export const COUNTED_MOVEMENTS = [
  'squat',
  'pushup',
  'dip',
  'pullup',
  'curl',
] as const satisfies readonly CountedMovement[]

/** Ce que mesure le compteur : plus la valeur est grande, plus le corps est tendu. */
export type SignalKind =
  /** Angle du genou (hanche, genou, cheville). */
  | 'kneeAngle'
  /** Angle du coude (épaule, coude, poignet). */
  | 'elbowAngle'
  /** Tractions : hauteur des mains au-dessus des épaules, en longueurs de bras (1 suspendu, ~0,3 en haut). */
  | 'hangRatio'
  /** Appui (dips, pompes) : hauteur des épaules au-dessus des mains, en longueurs de bras (essai seulement). */
  | 'supportRatio'

/**
 * Côtés du corps : `min` le plus plié des deux, `best` le mieux vu (on n'en change que si l'autre est nettement
 * mieux vu), `mean` la moyenne des deux, `perArm` un compte par bras (curls).
 */
export type SideRule = 'min' | 'best' | 'mean' | 'perArm'
/** Point d'appui qui ne doit pas bouger pendant une répétition. */
export type ContactPoint = 'ankles' | 'wrists' | 'elbow'
/** Partie du corps qui doit se déplacer pendant une répétition (en hauteur). */
export type MovingPoint = 'hips' | 'shoulders' | 'wrist'

export interface MovementSpec {
  readonly movement: CountedMovement
  readonly signal: SignalKind
  /** Angles mesurés dans l'espace (points `world`, quand l'image en a) ou sur l'image, en pixels. */
  readonly space: '2d' | '3d'
  readonly sides: SideRule
  /** En haut (corps tendu) au-dessus de cette valeur. */
  readonly extended: number
  /** En bas (répétition complète) sous cette valeur. */
  readonly flexed: number
  /** Sous cette valeur sans atteindre `flexed` : demi-répétition, montrée mais pas comptée. */
  readonly attempt: number
  /** Une répétition plus courte est « trop rapide ». */
  readonly minRepMs: number
  /** Points qu'il faut voir (un côté peut manquer, voir features.ts). */
  readonly need: readonly number[]
  /** `side` : filmé de profil seulement. */
  readonly view: 'any' | 'side'
  /** Buste au plus à tant de degrés de la verticale de l'image. */
  readonly maxTorsoTilt: number | null
  /** Buste au moins à tant de degrés de la verticale (pompes : presque à l'horizontale). */
  readonly minTorsoTilt: number | null
  /** Mains pas plus haut que les épaules moins tant de longueurs de buste (pompes, dips). */
  readonly handsMargin: number | null
  /** Pompes : angle épaule, hanche, bout de la ligne du corps, au moins tant de degrés (corps gainé). */
  readonly minBodyLine: number | null
  /** Bout de la ligne du corps des pompes : chevilles, ou genoux pour les pompes sur les genoux. */
  readonly bodyLine: 'ankle' | 'knee'
  /** Curls : le haut du bras reste à moins de tant de degrés de la verticale. */
  readonly maxUpperArmTilt: number | null
  readonly anchor: ContactPoint
  /** Déplacement maximal du point d'appui pendant une répétition, en longueurs de buste. */
  readonly maxAnchorDrift: number
  /**
   * Point d'appui fixé dans la pièce (pieds au sol, mains au sol ou sur la barre) : son déplacement se mesure
   * depuis la fin du mouvement précédent, pas seulement pendant la répétition (deux pas puis se baisser pour
   * ramasser quelque chose ne font pas un squat de plus). Le coude des curls, lui, peut bouger entre deux
   * répétitions.
   */
  readonly anchorFixed: boolean
  /**
   * Barres : les mains à plus de tant de longueurs de buste de leur place au départ veulent dire que la personne
   * a lâché les barres (position quittée, fin de série) ; null pour les autres mouvements.
   */
  readonly leaveAnchor: number | null
  readonly mover: MovingPoint
  /** Course minimale, en hauteur, de la partie qui bouge, en longueurs de buste. */
  readonly minTravel: number
  /** Barre ou barre EZ : les deux coudes plient ensemble, un seul compte. */
  readonly bothArms: boolean
  /** Exercice où le buste est droit : un buste couché veut dire que le téléphone l'est (consigne). */
  readonly upright: boolean
  /** Compte sûr enregistré tout seul ; sinon toujours à vérifier avant d'enregistrer (« en essai »). */
  readonly validated: boolean
}

const SHOULDERS = [11, 12]
const ARMS = [11, 12, 13, 14, 15, 16]
const HIPS = [23, 24]
const LEGS = [23, 24, 25, 26, 27, 28]
const ANKLES = [27, 28]
const KNEES = [25, 26]

const COMMON = {
  minTorsoTilt: null,
  handsMargin: null,
  minBodyLine: null,
  bodyLine: 'ankle',
  maxUpperArmTilt: null,
  leaveAnchor: null,
  bothArms: false,
} as const

export const SPECS: Readonly<Record<CountedMovement, MovementSpec>> = {
  // MM-Fit : flexed 110° donne 56/64 séries exactes (squats peu profonds manqués), 115 à 125° donnent 61/64.
  squat: {
    ...COMMON,
    movement: 'squat',
    signal: 'kneeAngle',
    space: '3d',
    sides: 'min',
    extended: 150,
    flexed: 120,
    attempt: 135,
    minRepMs: 600,
    need: [...SHOULDERS, ...LEGS],
    view: 'any',
    maxTorsoTilt: 60,
    anchor: 'ankles',
    maxAnchorDrift: 0.3,
    anchorFixed: true,
    mover: 'hips',
    minTravel: 0.25,
    upright: true,
    validated: true,
  },
  pushup: {
    ...COMMON,
    movement: 'pushup',
    signal: 'elbowAngle',
    space: '2d',
    sides: 'best',
    extended: 145,
    flexed: 105,
    attempt: 125,
    minRepMs: 500,
    need: [...ARMS, ...HIPS, ...ANKLES],
    view: 'side',
    maxTorsoTilt: null,
    minTorsoTilt: 50,
    handsMargin: 0.3,
    minBodyLine: 140,
    anchor: 'wrists',
    maxAnchorDrift: 0.3,
    anchorFixed: true,
    mover: 'shoulders',
    minTravel: 0.15,
    upright: false,
    validated: false,
  },
  dip: {
    ...COMMON,
    movement: 'dip',
    signal: 'elbowAngle',
    space: '2d',
    sides: 'best',
    extended: 145,
    flexed: 105,
    attempt: 125,
    minRepMs: 600,
    need: [...ARMS, ...HIPS],
    view: 'side',
    maxTorsoTilt: 45,
    handsMargin: 0.1,
    anchor: 'wrists',
    maxAnchorDrift: 0.3,
    anchorFixed: true,
    leaveAnchor: 0.5,
    mover: 'shoulders',
    minTravel: 0.15,
    upright: true,
    validated: false,
  },
  // Pas de nez : filmé de dos, il est caché.
  pullup: {
    ...COMMON,
    movement: 'pullup',
    signal: 'hangRatio',
    space: '2d',
    sides: 'mean',
    extended: 0.8,
    flexed: 0.45,
    attempt: 0.65,
    minRepMs: 700,
    need: ARMS,
    view: 'any',
    maxTorsoTilt: 40,
    anchor: 'wrists',
    maxAnchorDrift: 0.3,
    anchorFixed: true,
    leaveAnchor: 0.5,
    mover: 'shoulders',
    minTravel: 0.3,
    upright: true,
    validated: false,
  },
  // MM-Fit : 35° pour le haut du bras refusait de vrais curls alternés (le coude s'écarte jusqu'à 44°), 75° pour
  // flexed manquait la dernière répétition d'une série fatiguée. 59/59 séries exactes.
  curl: {
    ...COMMON,
    movement: 'curl',
    signal: 'elbowAngle',
    space: '3d',
    sides: 'perArm',
    extended: 130,
    flexed: 80,
    attempt: 105,
    minRepMs: 500,
    need: [...ARMS, ...HIPS],
    view: 'any',
    maxTorsoTilt: 30,
    maxUpperArmTilt: 60,
    anchor: 'elbow',
    maxAnchorDrift: 0.45,
    anchorFixed: false,
    mover: 'wrist',
    minTravel: 0.25,
    upright: true,
    validated: true,
  },
}

/** Seuils communs à tous les mouvements (voir CounterParams pour leur sens). */
export const COUNTER_PARAMS: CounterParams = {
  minVisibility: 0.5,
  edgeMargin: 0.02,
  tauMs: 80,
  gapResetMs: 700,
  hintStableMs: 1500,
  armMs: 1000,
  armHipSpeed: 0.6,
  jumpTorso: 0.6,
  jumpWindowMs: 300,
  maxRepMs: 12_000,
  postureShare: 0.7,
  driftTorso: 0.6,
  perArmMergeMs: 700,
  idleBefore3Ms: 10_000,
  idleFactor: 3,
  idleMinMs: 6000,
  idleMaxMs: 12_000,
  leftMs: 2500,
  goneMs: 2500,
  cadenceGapFactor: 2.5,
  cadenceGapMs: 3000,
  confidentShare: 0.85,
  minFps: 8,
  tooClose: 0.45,
  tooFar: 0.08,
  sideSpread: 0.55,
  sideSwitch: 0.15,
  phoneUprightDeg: 60,
  phoneUprightMs: 1000,
  darkLight: 50,
  darkVisibility: [0.3, 0.65],
}

/** Points utiles qui peuvent manquer quand la mesure est faite quand même (un côté caché en partie). */
export const MISSING_JOINTS_ALLOWED = 3
/** Constante de temps du lissage de la vitesse des hanches. */
export const HIP_SPEED_TAU_MS = 300
/** Au-delà de cet écart entre deux images, la vitesse des hanches repart de zéro. */
export const HIP_SPEED_GAP_MS = 1000
/** Déplacement horizontal des chevilles permis pendant une répétition, en longueurs de buste. */
export const FEET_DRIFT_TORSO = 0.5

/** Les seuils d'une variante : ceux du mouvement, avec ses réglages propres. */
export function specFor(variant: CountedVariant): MovementSpec {
  const base = SPECS[variant.movement]
  const { bodyLine, minTorsoTilt, maxTorsoTilt, bothArms, trial } = variant.overrides
  const line = bodyLine ?? base.bodyLine
  return {
    ...base,
    ...(minTorsoTilt === undefined ? {} : { minTorsoTilt }),
    ...(maxTorsoTilt === undefined ? {} : { maxTorsoTilt }),
    ...(base.movement === 'pushup'
      ? { bodyLine: line, need: [...ARMS, ...HIPS, ...(line === 'knee' ? KNEES : ANKLES)] }
      : {}),
    // Barre : un seul suivi, sur le coude le plus plié ; l'autre doit plier aussi (rep-tracker.ts). En essai tant
    // qu'aucune vraie série à la barre ne vérifie ce suivi (src/test/reps/README.md).
    ...(bothArms === true && base.sides === 'perArm'
      ? ({ bothArms: true, sides: 'min', validated: false } as const)
      : {}),
    ...(trial === true ? { validated: false } : {}),
  }
}

/** La variante de base d'un mouvement (sans réglage propre). */
export function defaultVariant(movement: CountedMovement): CountedVariant {
  return { movement, overrides: {} }
}

/**
 * Autres réglages à comparer avec `npm run reps:eval -- --variant <nom>` (jamais utilisés par l'appli) : un
 * réglage par défaut ne change que si le tableau montre plus de séries exactes, sans plus d'erreurs sûres.
 */
export const SPEC_ALTERNATIVES: Readonly<
  Record<string, { readonly movement: CountedMovement; readonly patch: Partial<MovementSpec> }>
> = {
  // Hauteur des épaules au-dessus des mains : ne dépend pas de l'angle de vue. Seuils équivalents à 145°,
  // 105° et 125° au coude, bras à la verticale.
  'dip:supportRatio': {
    movement: 'dip',
    patch: { signal: 'supportRatio', view: 'any', extended: 0.93, flexed: 0.8, attempt: 0.87 },
  },
  'pushup:supportRatio': {
    movement: 'pushup',
    patch: { signal: 'supportRatio', view: 'any', extended: 0.93, flexed: 0.8, attempt: 0.87 },
  },
  'pullup:elbowAngle3d': {
    movement: 'pullup',
    patch: { signal: 'elbowAngle', space: '3d', extended: 145, flexed: 75, attempt: 110 },
  },
  'squat:flexed110': { movement: 'squat', patch: { flexed: 110 } },
  'squat:flexed115': { movement: 'squat', patch: { flexed: 115 } },
  'squat:flexed125': { movement: 'squat', patch: { flexed: 125 } },
}
