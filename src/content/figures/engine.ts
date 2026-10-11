/*
 * Moteur des petites animations d'exercices : une silhouette vue de profil (tournée vers la droite),
 * décrite par quelques images clés. Les membres se placent soit par angles (cinématique directe),
 * soit en visant un point (cinématique inverse : mains sur la barre, pieds au sol…).
 * Fichier sans dépendance pour être utilisable aussi par les scripts Node.
 */

export type Vec = readonly [number, number]

/** Longueurs des segments, en unités du dessin (zone de 200 × 160). */
export const BONES = {
  torso: 36,
  neck: 7,
  head: 8,
  upperArm: 21,
  forearm: 19,
  thigh: 30,
  shin: 29,
  foot: 8,
} as const

/** Membre : angles absolus en degrés (0 = droite, 90 = bas) ou point visé avec le sens du pli. */
export type Limb = { a: number; b: number } | { to: Vec; bend: 1 | -1 }

export interface Pose {
  hip: Vec
  /** Direction hanche → épaules, en degrés, ou point vers lequel pointe le buste. */
  torso: number | Vec
  /** Direction épaules → tête en degrés (par défaut celle du buste). */
  head?: number
  arm: Limb
  /** Bras du fond (par défaut identique au bras de devant). */
  arm2?: Limb
  leg: Limb
  leg2?: Limb
  /** Angle du pied (par défaut perpendiculaire au tibia, orteils vers l'avant). */
  foot?: number
  foot2?: number
}

export type Prop =
  | { kind: 'floor'; y: number }
  | { kind: 'bar'; x: number; y: number }
  | { kind: 'wall'; x: number; y?: number }
  | { kind: 'box'; x: number; y: number; w: number; h: number }
  | { kind: 'parallettes'; x: number; y: number }
  | { kind: 'dipbars'; x: number; y: number }
  | { kind: 'rings'; x: number; y: number }
  | { kind: 'pole'; x: number }
  | { kind: 'hangboard'; x: number; y: number }
  | { kind: 'band'; from: Vec; to: Vec }
  | { kind: 'dumbbell'; at: 'hand' | 'hand2' }

export interface FigureAnim {
  frames: Pose[]
  /** Durée d'un cycle complet, en secondes. */
  duration: number
  /** pingpong : aller-retour ; loop : boucle ; still : posture tenue (légère respiration). */
  mode?: 'pingpong' | 'loop' | 'still'
  /** Poids relatif de chaque transition (permet de marquer un temps d'arrêt). */
  weights?: number[]
  props?: Prop[]
  /** Cadre du dessin [x, y, largeur, hauteur] si la zone par défaut ne suffit pas. */
  view?: readonly [number, number, number, number]
  /** Vue de face : les deux bras et les deux jambes sont dessinés pareil. */
  frontal?: boolean
}

export interface Joints {
  hip: Vec
  neck: Vec
  headBase: Vec
  head: Vec
  elbow: Vec
  hand: Vec
  elbow2: Vec
  hand2: Vec
  knee: Vec
  ankle: Vec
  toe: Vec
  knee2: Vec
  ankle2: Vec
  toe2: Vec
}

const RAD = Math.PI / 180

export function dir(angleDeg: number, length: number): Vec {
  return [Math.cos(angleDeg * RAD) * length, Math.sin(angleDeg * RAD) * length]
}

function add(a: Vec, b: Vec): Vec {
  return [a[0] + b[0], a[1] + b[1]]
}

function angleOf(from: Vec, to: Vec): number {
  return Math.atan2(to[1] - from[1], to[0] - from[0]) / RAD
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/** Place un membre à deux segments ; renvoie l'articulation du milieu et l'extrémité. */
export function solveLimb(root: Vec, limb: Limb, upper: number, lower: number): { mid: Vec; end: Vec } {
  if ('a' in limb) {
    const mid = add(root, dir(limb.a, upper))
    return { mid, end: add(mid, dir(limb.b, lower)) }
  }
  const d = Math.min(Math.max(dist(root, limb.to), Math.abs(upper - lower) + 0.01), upper + lower - 0.01)
  const base = angleOf(root, limb.to)
  const cos = (upper * upper + d * d - lower * lower) / (2 * upper * d)
  const alpha = Math.acos(Math.min(1, Math.max(-1, cos))) / RAD
  const mid = add(root, dir(base + limb.bend * alpha, upper))
  const end = add(root, dir(base, d))
  return { mid, end }
}

/** Angles (haut, bas) équivalents à un membre placé, pour interpoler entre deux postures. */
function limbAngles(root: Vec, limb: Limb, upper: number, lower: number): { a: number; b: number } {
  if ('a' in limb) return limb
  const { mid, end } = solveLimb(root, limb, upper, lower)
  return { a: angleOf(root, mid), b: angleOf(mid, end) }
}

/** Angle du buste, qu'il soit donné en degrés ou par un point visé. */
export function torsoAngle(pose: Pose): number {
  return typeof pose.torso === 'number' ? pose.torso : angleOf(pose.hip, pose.torso)
}

export function solvePose(pose: Pose): Joints {
  const { hip } = pose
  const torso = torsoAngle(pose)
  const neck = add(hip, dir(torso, BONES.torso))
  const headAngle = pose.head ?? torso
  const headBase = add(neck, dir(headAngle, BONES.neck))
  const head = add(neck, dir(headAngle, BONES.neck + BONES.head))
  const arm = solveLimb(neck, pose.arm, BONES.upperArm, BONES.forearm)
  const arm2 = solveLimb(neck, pose.arm2 ?? pose.arm, BONES.upperArm, BONES.forearm)
  const leg = solveLimb(hip, pose.leg, BONES.thigh, BONES.shin)
  const leg2 = solveLimb(hip, pose.leg2 ?? pose.leg, BONES.thigh, BONES.shin)
  const shin = angleOf(leg.mid, leg.end)
  const shin2 = angleOf(leg2.mid, leg2.end)
  const toe = add(leg.end, dir(pose.foot ?? shin - 90, BONES.foot))
  const toe2 = add(leg2.end, dir(pose.foot2 ?? pose.foot ?? shin2 - 90, BONES.foot))
  return {
    hip,
    neck,
    headBase,
    head,
    elbow: arm.mid,
    hand: arm.end,
    elbow2: arm2.mid,
    hand2: arm2.end,
    knee: leg.mid,
    ankle: leg.end,
    toe,
    knee2: leg2.mid,
    ankle2: leg2.end,
    toe2,
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((((b - a) % 360) + 540) % 360) - 180
  return a + delta * t
}

function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
}

function lerpLimb(rootA: Vec, rootB: Vec, a: Limb, b: Limb, t: number, upper: number, lower: number): Limb {
  if ('to' in a && 'to' in b) return { to: lerpVec(a.to, b.to, t), bend: a.bend }
  const fa = limbAngles(rootA, a, upper, lower)
  const fb = limbAngles(rootB, b, upper, lower)
  return { a: lerpAngle(fa.a, fb.a, t), b: lerpAngle(fa.b, fb.b, t) }
}

function optionalAngle(a: number | undefined, b: number | undefined, t: number): number | undefined {
  if (a === undefined && b === undefined) return undefined
  if (a === undefined || b === undefined) return t < 0.5 ? a : b
  return lerpAngle(a, b, t)
}

/** Posture intermédiaire entre deux images clés (t de 0 à 1). */
export function interpolatePose(a: Pose, b: Pose, t: number): Pose {
  const torsoA = torsoAngle(a)
  const torsoB = torsoAngle(b)
  const neckA = add(a.hip, dir(torsoA, BONES.torso))
  const neckB = add(b.hip, dir(torsoB, BONES.torso))
  return {
    hip: lerpVec(a.hip, b.hip, t),
    torso: lerpAngle(torsoA, torsoB, t),
    head: lerpAngle(a.head ?? torsoA, b.head ?? torsoB, t),
    arm: lerpLimb(neckA, neckB, a.arm, b.arm, t, BONES.upperArm, BONES.forearm),
    arm2: lerpLimb(neckA, neckB, a.arm2 ?? a.arm, b.arm2 ?? b.arm, t, BONES.upperArm, BONES.forearm),
    leg: lerpLimb(a.hip, b.hip, a.leg, b.leg, t, BONES.thigh, BONES.shin),
    leg2: lerpLimb(a.hip, b.hip, a.leg2 ?? a.leg, b.leg2 ?? b.leg, t, BONES.thigh, BONES.shin),
    foot: optionalAngle(a.foot, b.foot, t),
    foot2: optionalAngle(a.foot2 ?? a.foot, b.foot2 ?? b.foot, t),
  }
}

function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Suite des images clés parcourues pendant un cycle. */
function sequence(anim: FigureAnim): Pose[] {
  const { frames } = anim
  const mode = anim.mode ?? (frames.length > 1 ? 'pingpong' : 'still')
  if (frames.length <= 1 || mode === 'still') {
    const only = frames[0]
    if (!only) return []
    // Maintien : légère respiration pour que la silhouette reste vivante.
    const breathe: Pose = { ...only, hip: [only.hip[0], only.hip[1] - 0.8] }
    return [only, breathe, only]
  }
  if (mode === 'loop') return [...frames, frames[0] as Pose]
  return [...frames, ...frames.slice(0, -1).reverse()]
}

/** Échantillonne un cycle complet de l'animation. */
export function samplePoses(anim: FigureAnim, samples = 40): Pose[] {
  const seq = sequence(anim)
  if (seq.length === 0) return []
  const transitions = seq.length - 1
  const weights = Array.from(
    { length: transitions },
    (_, i) => anim.weights?.[i % (anim.weights.length || 1)] ?? 1,
  )
  const total = weights.reduce((s, w) => s + w, 0)
  const result: Pose[] = []
  for (let i = 0; i <= samples; i++) {
    let time = (i / samples) * total
    let k = 0
    while (k < transitions - 1 && time > (weights[k] ?? 1)) {
      time -= weights[k] ?? 1
      k++
    }
    const local = Math.min(1, Math.max(0, time / (weights[k] ?? 1)))
    const from = seq[k] as Pose
    const to = seq[k + 1] as Pose
    result.push(interpolatePose(from, to, ease(local)))
  }
  return result
}

function fmt(n: number): string {
  return (Math.round(n * 10) / 10).toString()
}

function path(points: Vec[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p[0])} ${fmt(p[1])}`).join(' ')
}

export interface FigurePaths {
  body: string
  arm: string
  arm2: string
  leg: string
  leg2: string
  head: Vec
  hand: Vec
  hand2: Vec
}

export function posePaths(pose: Pose): FigurePaths {
  const j = solvePose(pose)
  return {
    body: path([j.hip, j.neck, j.headBase]),
    arm: path([j.neck, j.elbow, j.hand]),
    arm2: path([j.neck, j.elbow2, j.hand2]),
    leg: path([j.hip, j.knee, j.ankle, j.toe]),
    leg2: path([j.hip, j.knee2, j.ankle2, j.toe2]),
    head: [Math.round(j.head[0] * 10) / 10, Math.round(j.head[1] * 10) / 10],
    hand: j.hand,
    hand2: j.hand2,
  }
}
