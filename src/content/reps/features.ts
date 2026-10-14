import {
  distance,
  isInside,
  jointAngle,
  midpoint,
  tiltFromVertical,
  toPixel,
  type Pixel,
} from './geometry.ts'
import { MISSING_JOINTS_ALLOWED, type ContactPoint, type MovementSpec, type MovingPoint } from './specs.ts'
import type { BodyPart, CounterParams, PoseFrame } from './types.ts'

/*
 * Ce que le compteur lit sur une image : points utilisables, mesure de chaque côté, côté suivi, position,
 * angle de vue. Pur : l'état d'une image à l'autre (côté suivi, longueur des bras) vient de l'appelant.
 */

/** Côté du corps (numérotation MediaPipe) : 0 le côté gauche de la personne (11, 13, 15, 23…), 1 le droit. */
export type Side = 0 | 1
export const SIDES: readonly Side[] = [0, 1]

/** Paires de points, côté gauche puis droit. */
export const SHOULDER = [11, 12] as const
export const ELBOW = [13, 14] as const
export const WRIST = [15, 16] as const
export const HIP = [23, 24] as const
export const KNEE = [25, 26] as const
export const ANKLE = [27, 28] as const
const NOSE = 0

type Pair = readonly [number, number]

export interface Body {
  readonly frame: PoseFrame
  /** Visibilité d'un point (0 s'il n'existe pas). */
  visibility(joint: number): number
  /** Point utilisable : assez visible et dans l'image, loin du bord. */
  usable(joint: number): boolean
  /** Le point en pixels. */
  pixel(joint: number): Pixel
  /** Milieu des épaules utilisables (ou la seule utilisable), null sans épaule. */
  readonly shoulder: Pixel | null
  readonly hip: Pixel | null
  /** Longueur du buste (épaules → hanches) en pixels ; NaN sans épaule ou sans hanche. */
  readonly torso: number
}

type BodyParams = Pick<CounterParams, 'minVisibility' | 'edgeMargin'>

/** Le corps vu sur l'image, ou null quand personne n'est vu. */
export function readBody(frame: PoseFrame, params: BodyParams): Body | null {
  const image = frame.image
  if (!image) return null
  const visibility = (joint: number) => image[joint]?.[2] ?? 0
  const usable = (joint: number) => {
    const point = image[joint]
    return point !== undefined && point[2] >= params.minVisibility && isInside(point, params.edgeMargin)
  }
  const pixel = (joint: number): Pixel => {
    const point = image[joint]
    return point ? toPixel(point, frame.width, frame.height) : [Number.NaN, Number.NaN]
  }
  const pairOf = (pair: Pair): Pixel | null => pairPoint({ usable, pixel }, pair, null)
  const shoulder = pairOf(SHOULDER)
  const hip = pairOf(HIP)
  const torso = shoulder && hip ? distance(shoulder, hip) : Number.NaN
  return { frame, visibility, usable, pixel, shoulder, hip, torso }
}

/**
 * Un point d'une paire : celui du côté demandé (null s'il n'est pas utilisable) ; sans côté, le milieu des deux
 * quand les deux sont utilisables, sinon celui qui l'est.
 */
export function pairPoint(body: Pick<Body, 'usable' | 'pixel'>, pair: Pair, side: Side | null): Pixel | null {
  if (side !== null) return body.usable(pair[side]) ? body.pixel(pair[side]) : null
  const [a, b] = pair
  if (body.usable(a) && body.usable(b)) return midpoint(body.pixel(a), body.pixel(b))
  if (body.usable(a)) return body.pixel(a)
  if (body.usable(b)) return body.pixel(b)
  return null
}

const TRIPLES: Readonly<Record<'kneeAngle' | 'elbowAngle', readonly [Pair, Pair, Pair]>> = {
  kneeAngle: [HIP, KNEE, ANKLE],
  elbowAngle: [SHOULDER, ELBOW, WRIST],
}

/** Les trois points mesurés d'un côté (pour les rapports de hauteur : épaule, coude, poignet). */
export function sideJoints(
  spec: Pick<MovementSpec, 'signal'>,
  side: Side,
): readonly [number, number, number] {
  const [a, b, c] = spec.signal === 'kneeAngle' ? TRIPLES.kneeAngle : TRIPLES.elbowAngle
  return [a[side], b[side], c[side]]
}

/** Longueur d'un bras sur l'image (épaule → coude → poignet), en pixels ; null s'il n'est pas vu. */
export function armLength(body: Body, side: Side): number | null {
  const [s, e, w] = [SHOULDER[side], ELBOW[side], WRIST[side]]
  if (!(body.usable(s) && body.usable(e) && body.usable(w))) return null
  return distance(body.pixel(s), body.pixel(e)) + distance(body.pixel(e), body.pixel(w))
}

/**
 * La mesure d'un côté : angle en degrés (dans l'espace si demandé et connu, sinon en pixels), ou rapport de
 * hauteur en longueurs de bras (`arm` : longueur mesurée bras tendus, sinon celle de l'image). Null quand un des
 * points manque.
 */
export function sideSignal(
  spec: Pick<MovementSpec, 'signal' | 'space'>,
  body: Body,
  side: Side,
  arm: number | null = null,
): number | null {
  const [a, b, c] = sideJoints(spec, side)
  if (!(body.usable(a) && body.usable(b) && body.usable(c))) return null
  if (spec.signal === 'hangRatio' || spec.signal === 'supportRatio') {
    const length = arm ?? armLength(body, side)
    if (length === null || !(length > 0)) return null
    const above = body.pixel(a)[1] - body.pixel(c)[1]
    return spec.signal === 'hangRatio' ? above / length : -above / length
  }
  const world = spec.space === '3d' ? body.frame.world : null
  const point = (joint: number): readonly number[] => world?.[joint] ?? body.pixel(joint)
  const angle = jointAngle(point(a), point(b), point(c))
  return Number.isNaN(angle) ? null : angle
}

/**
 * Le côté suivi (règle `best`) : celui dont les points mesurés sont le mieux vus. On garde le précédent tant que
 * l'autre n'est pas mieux vu de `margin` ; à égalité, l'épaule la plus proche du téléphone (z plus petit).
 */
export function chooseBestSide(
  available: readonly [boolean, boolean],
  scores: readonly [number, number],
  depths: readonly [number, number] | null,
  previous: Side | null,
  margin: number,
): Side | null {
  if (!available[0] && !available[1]) return null
  if (previous !== null && available[previous]) {
    const other: Side = previous === 0 ? 1 : 0
    return available[other] && scores[other] > scores[previous] + margin ? other : previous
  }
  if (!available[0]) return 1
  if (!available[1]) return 0
  if (scores[0] !== scores[1]) return scores[1] > scores[0] ? 1 : 0
  return depths !== null && depths[1] < depths[0] ? 1 : 0
}

/** Position de départ et de travail du mouvement (sur l'image, téléphone debout : y = la verticale). */
export function postureOk(spec: MovementSpec, body: Body): boolean {
  const { shoulder, hip, torso } = body
  if (!shoulder || !hip || !(torso > 0)) return false
  const tilt = tiltFromVertical(shoulder, hip)
  if (spec.maxTorsoTilt !== null && !(tilt < spec.maxTorsoTilt)) return false
  if (spec.minTorsoTilt !== null && !(tilt > spec.minTorsoTilt)) return false
  const ys = (pair: Pair) => pair.filter((joint) => body.usable(joint)).map((joint) => body.pixel(joint)[1])
  switch (spec.movement) {
    case 'squat': {
      // Debout : les chevilles plus bas que les hanches.
      const ankles = ys(ANKLE)
      return ankles.length > 0 && Math.max(...ankles) > hip[1]
    }
    case 'pushup': {
      // Mains sous les épaules (la plus basse), corps gainé de l'épaule à la cheville (ou au genou).
      const wrists = ys(WRIST)
      if (wrists.length === 0) return false
      if (!(Math.max(...wrists) > shoulder[1] - (spec.handsMargin ?? 0) * torso)) return false
      const end = pairPoint(body, spec.bodyLine === 'knee' ? KNEE : ANKLE, null)
      return end !== null && jointAngle(shoulder, hip, end) >= (spec.minBodyLine ?? 0)
    }
    case 'dip': {
      // En appui : les mains au niveau des épaules ou plus bas (la plus haute).
      const wrists = ys(WRIST)
      return wrists.length > 0 && Math.min(...wrists) > shoulder[1] - (spec.handsMargin ?? 0) * torso
    }
    case 'pullup': {
      // Suspendu : les deux mains au-dessus des épaules.
      const wrists = ys(WRIST)
      return wrists.length === 2 && Math.max(...wrists) < shoulder[1]
    }
    case 'curl':
      return true
  }
}

/** Curls : le haut du bras reste près de la verticale, vers le bas (lever ou balancer le bras ne compte pas). */
export function armOk(spec: MovementSpec, body: Body, side: Side): boolean {
  if (spec.maxUpperArmTilt === null) return true
  const [s, e] = [SHOULDER[side], ELBOW[side]]
  if (!(body.usable(s) && body.usable(e))) return false
  return tiltFromVertical(body.pixel(s), body.pixel(e)) < spec.maxUpperArmTilt
}

/** Mouvements filmés de profil : les épaules se recouvrent presque (ou une seule est vue). */
export function viewOk(spec: MovementSpec, body: Body, params: Pick<CounterParams, 'sideSpread'>): boolean {
  if (spec.view !== 'side') return true
  if (!(body.usable(SHOULDER[0]) && body.usable(SHOULDER[1]))) return true
  return distance(body.pixel(SHOULDER[0]), body.pixel(SHOULDER[1])) < params.sideSpread * body.torso
}

/** Le côté d'un point (0 gauche : 11, 13, 15, 23…, 1 droit), null pour le visage. */
export function jointSide(joint: number): Side | null {
  if (joint < 11) return null
  return joint % 2 === 1 ? 0 : 1
}

/** La partie du corps qui manque, pour la consigne : tête, mains, pieds, sinon le corps. */
export function missingPart(missing: readonly number[]): BodyPart {
  if (missing.includes(NOSE)) return 'head'
  if (missing.some((joint) => (WRIST as readonly number[]).includes(joint))) return 'hands'
  if (missing.some((joint) => (ANKLE as readonly number[]).includes(joint))) return 'feet'
  return 'body'
}

const POINTS: Readonly<Record<ContactPoint | MovingPoint, Pair>> = {
  ankles: ANKLE,
  wrists: WRIST,
  elbow: ELBOW,
  hips: HIP,
  shoulders: SHOULDER,
  wrist: WRIST,
}

/** Point d'appui ou partie qui bouge, du côté suivi (ou des deux côtés, sans côté), en pixels. */
export function bodyPoint(body: Body, kind: ContactPoint | MovingPoint, side: Side | null): Pixel | null {
  return pairPoint(body, POINTS[kind], side)
}

/** Ce qui ne change pas d'une image à l'autre : côté suivi et longueur des bras tendus, s'ils sont connus. */
export interface FeatureState {
  readonly side: Side | null
  readonly armLengths: readonly [number | null, number | null]
}

export const NO_FEATURE_STATE: FeatureState = { side: null, armLengths: [null, null] }

export interface FrameFeatures {
  readonly t: number
  /** null : personne n'est vu. */
  readonly body: Body | null
  /** Mesure de chaque côté (gauche, droit), null quand un point manque. */
  readonly values: readonly [number | null, number | null]
  /** La mesure suivie (côtés combinés selon la règle du mouvement ; le bras le plus plié pour `perArm`). */
  readonly signal: number | null
  /** Côté suivi (`best`), ou côté de la mesure quand un seul est vu. */
  readonly side: Side | null
  /** Barre : la mesure du bras le moins plié, quand les deux sont vus. */
  readonly pair: number | null
  /** Points utiles qui manquent. */
  readonly missing: readonly number[]
  /** Assez de points pour mesurer. */
  readonly measured: boolean
  /** Bon angle de vue. */
  readonly view: boolean
  /** Image utilisable : mesurée, assez de points, bon angle de vue. */
  readonly good: boolean
  /** Utilisable et en position. */
  readonly posture: boolean
  /** Curls : haut du bras près de la verticale, par côté (toujours vrai pour les autres mouvements). */
  readonly arms: readonly [boolean, boolean]
  /** Visibilité moyenne des points utiles (0 sans personne). */
  readonly visibility: number
  /** Inclinaison du buste depuis la verticale de l'image, en degrés ; null sans buste. */
  readonly tilt: number | null
}

/** Tout ce que le compteur lit sur une image. */
export function measureFrame(
  frame: PoseFrame,
  spec: MovementSpec,
  params: CounterParams,
  state: FeatureState = NO_FEATURE_STATE,
): FrameFeatures {
  const body = readBody(frame, params)
  if (!body) {
    return {
      t: frame.t,
      body: null,
      values: [null, null],
      signal: null,
      side: null,
      pair: null,
      missing: spec.need,
      measured: false,
      view: false,
      good: false,
      posture: false,
      arms: [false, false],
      visibility: 0,
      tilt: null,
    }
  }
  const torsoKnown = body.torso > 0
  const valueOf = (side: Side) => (torsoKnown ? sideSignal(spec, body, side, state.armLengths[side]) : null)
  const values = [valueOf(0), valueOf(1)] as const
  const available: readonly [boolean, boolean] = [values[0] !== null, values[1] !== null]
  const [left, right] = values
  let signal: number | null = null
  let side: Side | null = null
  let pair: number | null = null
  if (left !== null || right !== null) {
    side = left === null ? 1 : right === null ? 0 : null
    switch (spec.sides) {
      case 'best': {
        const score = (s: Side) => Math.min(...sideJoints(spec, s).map((joint) => body.visibility(joint)))
        const world = frame.world
        const depth = (s: Side) => world?.[SHOULDER[s]]?.[2] ?? 0
        side = chooseBestSide(
          available,
          [score(0), score(1)],
          world ? [depth(0), depth(1)] : null,
          state.side,
          params.sideSwitch,
        )
        signal = side === null ? null : values[side]
        break
      }
      case 'mean':
        signal = left === null ? right : right === null ? left : (left + right) / 2
        break
      case 'min':
      case 'perArm':
        signal = left === null ? right : right === null ? left : Math.min(left, right)
        if (left !== null && right !== null) {
          side = spec.sides === 'min' && !spec.bothArms ? (left <= right ? 0 : 1) : null
          pair = spec.bothArms ? Math.max(left, right) : null
        }
        break
    }
  }
  const missing = spec.need.filter((joint) => !body.usable(joint))
  // Côté suivi (pompes, dips de profil) : ce côté entier suffit, l'autre peut être caché.
  const sideComplete =
    spec.sides === 'best' &&
    side !== null &&
    missing.every((joint) => jointSide(joint) !== null && jointSide(joint) !== side)
  const measured = signal !== null && (missing.length <= MISSING_JOINTS_ALLOWED || sideComplete)
  const view = torsoKnown && viewOk(spec, body, params)
  const good = measured && view
  const arms = [armOk(spec, body, 0), armOk(spec, body, 1)] as const
  const visibility = spec.need.reduce((sum, joint) => sum + body.visibility(joint), 0) / spec.need.length
  const tilt = body.shoulder && body.hip && torsoKnown ? tiltFromVertical(body.shoulder, body.hip) : null
  return {
    t: frame.t,
    body,
    values,
    signal,
    side,
    pair,
    missing,
    measured,
    view,
    good,
    posture: good && postureOk(spec, body),
    arms,
    visibility,
    tilt,
  }
}
