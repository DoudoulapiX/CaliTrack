/**
 * Squelettes fabriqués pour tester le compteur caméra : une personne en fil de fer (longueurs d'un adulte), vue de
 * face, de dos ou de profil, qui fait ses répétitions jusqu'à l'angle voulu. Servent aux tests du calcul
 * (src/content/reps) et aux fichiers synth-*.json rejoués de bout en bout (pose-synth.test.ts vérifie qu'ils
 * sont à jour).
 */
import { encodeFixture, type RepFixture } from '@/content/reps/fixture'
import type { CountedMovement, ImagePoint, PoseFrame, WorldPoint } from '@/content/reps/types'

/** Un point du corps en mètres, repère de la personne : vers sa gauche, vers le haut, vers l'avant. */
type V3 = readonly [left: number, up: number, forward: number]
type Skeleton = ReadonlyMap<number, V3>

/** Longueurs du corps, en mètres. */
export const BODY = {
  shoulderHalf: 0.19,
  hipHalf: 0.13,
  torso: 0.5,
  neck: 0.22,
  upperArm: 0.3,
  forearm: 0.27,
  thigh: 0.45,
  shin: 0.43,
  ankleHeight: 0.08,
  /** Tractions : demi-écart des mains sur la barre. */
  grip: 0.32,
} as const

const DEG = Math.PI / 180

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const norm = (a: V3) => Math.sqrt(dot(a, a))
const unit = (a: V3): V3 => scale(a, 1 / norm(a))
const mid = (a: V3, b: V3): V3 => scale(add(a, b), 0.5)

/** Distance entre les deux bouts d'un membre de longueurs a et b plié à `angle` degrés (loi des cosinus). */
export function reach(a: number, b: number, angle: number): number {
  return Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(angle * DEG))
}

/** Coude ou genou entre p et q (segments a et b), plié du côté de `toward`. */
function bend(p: V3, q: V3, a: number, b: number, toward: V3): V3 {
  const d = norm(sub(q, p))
  const u = unit(sub(q, p))
  const along = (a * a - b * b + d * d) / (2 * d)
  const out = Math.sqrt(Math.max(0, a * a - along * along))
  const perp = unit(sub(toward, scale(u, dot(toward, u))))
  return add(add(p, scale(u, along)), scale(perp, out))
}

/**
 * Dans le plan haut/avant, le point le plus haut à la distance `r` de `c` et `s` de `d` (croisement des deux
 * cercles).
 */
function upperCrossing(c: V3, r: number, d: V3, s: number): V3 {
  const dx = d[2] - c[2]
  const dy = d[1] - c[1]
  const l = Math.hypot(dx, dy)
  const a = (r * r - s * s + l * l) / (2 * l)
  const h = Math.sqrt(Math.max(0, r * r - a * a))
  const px = c[2] + (a * dx) / l
  const py = c[1] + (a * dy) / l
  const first: V3 = [c[0], py - (h * dx) / l, px + (h * dy) / l]
  const second: V3 = [c[0], py + (h * dx) / l, px - (h * dy) / l]
  return first[1] >= second[1] ? first : second
}

/** Côté de la personne : +1 sa gauche (points impairs 11, 13…), −1 sa droite. */
const SIDE_SIGN = [1, -1] as const
const SHOULDER = [11, 12] as const
const ELBOW = [13, 14] as const
const WRIST = [15, 16] as const
const HIP = [23, 24] as const
const KNEE = [25, 26] as const
const ANKLE = [27, 28] as const

function skeleton(entries: readonly (readonly [number, V3])[]): Skeleton {
  return new Map(entries)
}

/** Debout, bras le long du corps (coudes à `elbows` degrés, avant-bras vers l'avant), pieds au sol en 0. */
function standing(elbows: readonly [number, number] = [175, 175]): Skeleton {
  const entries: [number, V3][] = []
  const hipUp = BODY.ankleHeight + BODY.shin + BODY.thigh
  for (const side of [0, 1] as const) {
    const s = SIDE_SIGN[side]
    entries.push([ANKLE[side], [s * BODY.hipHalf, BODY.ankleHeight, 0]])
    entries.push([KNEE[side], [s * BODY.hipHalf, BODY.ankleHeight + BODY.shin, 0]])
    entries.push([HIP[side], [s * BODY.hipHalf, hipUp, 0]])
    const shoulder: V3 = [s * BODY.shoulderHalf, hipUp + BODY.torso, 0]
    const elbow = add(shoulder, [0, -BODY.upperArm, 0])
    const folded = 180 - elbows[side]
    entries.push([SHOULDER[side], shoulder])
    entries.push([ELBOW[side], elbow])
    entries.push([
      WRIST[side],
      add(elbow, scale([0, -Math.cos(folded * DEG), Math.sin(folded * DEG)], BODY.forearm)),
    ])
  }
  entries.push([0, [0, hipUp + BODY.torso + BODY.neck, 0.08]])
  return skeleton(entries)
}

/** Squat : genoux à `knee` degrés (dans l'espace), tibias vers l'avant, buste penché. */
function squat(knee: number): Skeleton {
  const flexion = 180 - knee
  const shinTilt = 0.45 * flexion * DEG
  const thighTilt = 0.55 * flexion * DEG
  const lean = 0.6 * thighTilt
  const entries: [number, V3][] = []
  const hips: V3[] = []
  for (const side of [0, 1] as const) {
    const s = SIDE_SIGN[side]
    const ankle: V3 = [s * BODY.hipHalf, BODY.ankleHeight, 0]
    const kneePoint = add(ankle, scale([0, Math.cos(shinTilt), Math.sin(shinTilt)], BODY.shin))
    const hip = add(kneePoint, scale([0, Math.cos(thighTilt), -Math.sin(thighTilt)], BODY.thigh))
    hips.push(hip)
    entries.push([ANKLE[side], ankle], [KNEE[side], kneePoint], [HIP[side], hip])
  }
  const hipMid = mid(hips[0]!, hips[1]!)
  const up: V3 = [0, Math.cos(lean), Math.sin(lean)]
  const shoulderMid = add(hipMid, scale(up, BODY.torso))
  for (const side of [0, 1] as const) {
    const s = SIDE_SIGN[side]
    const shoulder = add(shoulderMid, [s * BODY.shoulderHalf, 0, 0])
    const elbow = add(shoulder, [0, -BODY.upperArm, 0.05])
    entries.push(
      [SHOULDER[side], shoulder],
      [ELBOW[side], elbow],
      [WRIST[side], add(elbow, [0, -BODY.forearm, 0.08])],
    )
  }
  entries.push([0, add(add(shoulderMid, scale(up, BODY.neck)), [0, 0, 0.08])])
  return skeleton(entries)
}

/** Curl debout : coudes collés au corps, à `elbows` degrés (gauche, droit). */
function curl(elbows: readonly [number, number]): Skeleton {
  return standing(elbows)
}

/** Traction : mains sur la barre (origine au milieu de la barre), coudes à `elbow` degrés, dans le plan du dos. */
function pullup(elbow: number): Skeleton {
  const d = reach(BODY.upperArm, BODY.forearm, elbow)
  const spread = BODY.grip - BODY.shoulderHalf
  const drop = Math.sqrt(Math.max(0, d * d - spread * spread))
  const entries: [number, V3][] = []
  for (const side of [0, 1] as const) {
    const s = SIDE_SIGN[side]
    const wrist: V3 = [s * BODY.grip, 0, 0]
    const shoulder: V3 = [s * BODY.shoulderHalf, -drop, 0]
    entries.push([WRIST[side], wrist], [SHOULDER[side], shoulder])
    entries.push([ELBOW[side], bend(shoulder, wrist, BODY.upperArm, BODY.forearm, [s, 0, 0])])
    const hip: V3 = [s * BODY.hipHalf, -drop - BODY.torso, 0]
    const knee = add(hip, [0, -BODY.thigh, 0.04])
    entries.push([HIP[side], hip], [KNEE[side], knee], [ANKLE[side], add(knee, [0, -BODY.shin, 0.02])])
  }
  entries.push([0, [0, -drop + BODY.neck, 0.08]])
  return skeleton(entries)
}

/** Dips : mains sur les barres (origine), coudes à `elbow` degrés vers l'arrière, buste un peu penché. */
function dip(elbow: number): Skeleton {
  const folded = 180 - elbow
  const d = reach(BODY.upperArm, BODY.forearm, elbow)
  const armLean = 0.25 * folded * DEG
  const lean = (5 + 0.25 * folded) * DEG
  const entries: [number, V3][] = []
  const shoulders: V3[] = []
  for (const side of [0, 1] as const) {
    const s = SIDE_SIGN[side]
    const wrist: V3 = [s * BODY.shoulderHalf, 0, 0]
    const shoulder = add(wrist, scale([0, Math.cos(armLean), Math.sin(armLean)], d))
    shoulders.push(shoulder)
    entries.push([WRIST[side], wrist], [SHOULDER[side], shoulder])
    entries.push([ELBOW[side], bend(shoulder, wrist, BODY.upperArm, BODY.forearm, [0, 0, -1])])
  }
  const shoulderMid = mid(shoulders[0]!, shoulders[1]!)
  const down: V3 = [0, -Math.cos(lean), -Math.sin(lean)]
  for (const side of [0, 1] as const) {
    const s = SIDE_SIGN[side]
    const hip = add(add(shoulderMid, scale(down, BODY.torso)), [s * BODY.hipHalf, 0, 0])
    const knee = add(hip, scale([0, -0.94, 0.34], BODY.thigh))
    entries.push(
      [HIP[side], hip],
      [KNEE[side], knee],
      [ANKLE[side], add(knee, scale([0, -0.2, -0.98], BODY.shin))],
    )
  }
  entries.push([
    0,
    add(add(shoulderMid, scale([0, Math.cos(lean), Math.sin(lean)], BODY.neck)), [0, 0, 0.08]),
  ])
  return skeleton(entries)
}

/**
 * Pompes : mains au sol sous les épaules (origine), corps gainé des chevilles (ou des genoux) aux épaules,
 * coudes à `elbow` degrés vers les pieds.
 */
function pushup(elbow: number, kneeling: boolean): Skeleton {
  const line = (kneeling ? 0 : BODY.shin) + BODY.thigh + BODY.torso
  const pivotUp = kneeling ? 0.05 : BODY.ankleHeight
  const straight = BODY.upperArm + BODY.forearm
  const pivotBack = Math.sqrt(line * line - (straight - pivotUp) ** 2)
  const d = reach(BODY.upperArm, BODY.forearm, elbow)
  const entries: [number, V3][] = []
  const shoulders: V3[] = []
  const hips: V3[] = []
  for (const side of [0, 1] as const) {
    const s = SIDE_SIGN[side]
    const wrist: V3 = [s * BODY.shoulderHalf, 0, 0]
    const pivot: V3 = [s * BODY.shoulderHalf, pivotUp, -pivotBack]
    const shoulder = upperCrossing(wrist, d, pivot, line)
    shoulders.push(shoulder)
    entries.push([WRIST[side], wrist], [SHOULDER[side], shoulder])
    entries.push([ELBOW[side], bend(shoulder, wrist, BODY.upperArm, BODY.forearm, [0, 0.3, -1])])
    const along = unit(sub(shoulder, pivot))
    const lateral = (half: number): V3 => [s * (half - BODY.shoulderHalf), 0, 0]
    const at = (length: number, half: number) => add(add(pivot, scale(along, length)), lateral(half))
    const hip = at(kneeling ? BODY.thigh : BODY.shin + BODY.thigh, BODY.hipHalf)
    hips.push(hip)
    entries.push([HIP[side], hip])
    if (kneeling) {
      const knee = at(0, BODY.hipHalf)
      entries.push([KNEE[side], knee], [ANKLE[side], add(knee, scale([0, 0.25, -0.97], BODY.shin))])
    } else {
      entries.push([ANKLE[side], at(0, BODY.hipHalf)], [KNEE[side], at(BODY.shin, BODY.hipHalf)])
    }
  }
  const shoulderMid = mid(shoulders[0]!, shoulders[1]!)
  const forward = unit(sub(shoulderMid, mid(hips[0]!, hips[1]!)))
  entries.push([0, add(add(shoulderMid, scale(forward, BODY.neck)), [0, 0.03, 0])])
  return skeleton(entries)
}

/** La position d'un mouvement à cet angle (curls : un angle par bras). */
export function synthPose(
  movement: CountedMovement,
  angle: number | readonly [number, number],
  options: { readonly kneeling?: boolean } = {},
): Skeleton {
  const both: readonly [number, number] = typeof angle === 'number' ? [angle, angle] : angle
  switch (movement) {
    case 'squat':
      return squat(both[0])
    case 'curl':
      return curl(both)
    case 'pullup':
      return pullup(both[0])
    case 'dip':
      return dip(both[0])
    case 'pushup':
      return pushup(both[0], options.kneeling ?? false)
  }
}

/** Où et comment le téléphone voit la personne. */
export interface SynthCamera {
  /** Rotation de la personne : 0 de face, 90 de profil (côté gauche vers le téléphone), 180 de dos. */
  readonly yaw: number
  /** Position sur l'image (pixels) de l'origine du repère de la personne. */
  readonly origin: readonly [x: number, y: number]
  /** Pixels par mètre. */
  readonly pixelsPerMetre: number
  readonly width: number
  readonly height: number
  /** Téléphone penché : l'image tourne de tant de degrés (sens des aiguilles d'une montre) autour de son centre. */
  readonly roll?: number
}

/** Cadrage de chaque mouvement sur une image de téléphone debout (480 × 640). */
export const SYNTH_CAMERAS: Readonly<Record<CountedMovement, SynthCamera>> = {
  squat: { yaw: 0, origin: [240, 600], pixelsPerMetre: 285, width: 480, height: 640 },
  curl: { yaw: 0, origin: [240, 600], pixelsPerMetre: 285, width: 480, height: 640 },
  pullup: { yaw: 180, origin: [240, 70], pixelsPerMetre: 250, width: 480, height: 640 },
  dip: { yaw: 90, origin: [240, 400], pixelsPerMetre: 260, width: 480, height: 640 },
  pushup: { yaw: 90, origin: [100, 520], pixelsPerMetre: 220, width: 480, height: 640 },
}

/** Angles du haut et du bas d'une répétition complète. */
export const SYNTH_RANGE: Readonly<
  Record<CountedMovement, { readonly top: number; readonly bottom: number }>
> = {
  squat: { top: 175, bottom: 85 },
  curl: { top: 170, bottom: 40 },
  pullup: { top: 175, bottom: 50 },
  dip: { top: 170, bottom: 80 },
  pushup: { top: 170, bottom: 80 },
}

const POINTS = 33
/** Points du visage, des mains et des pieds : posés sur le nez, le poignet ou la cheville le plus proche. */
function nearestKnown(joint: number): number {
  if (joint <= 10) return 0
  if (joint >= 17 && joint <= 22) return joint % 2 === 1 ? 15 : 16
  if (joint >= 29) return joint % 2 === 1 ? 27 : 28
  return joint
}

/** Petit bruit reproductible (les vrais points tremblent un peu). */
function jitter(seed: number): number {
  let x = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return ((x >>> 0) / 0xffffffff) * 2 - 1
}

export interface ProjectOptions {
  readonly camera: SynthCamera
  /** Décalage de toute la personne sur l'image, en pixels (une autre personne ailleurs). */
  readonly shift?: readonly [x: number, y: number]
  /** Visibilité des points (côté loin du téléphone en profil : `far`). */
  readonly visibility?: number
  readonly far?: number
  /** Bruit sur l'image, en fraction de la largeur ou de la hauteur. */
  readonly noise?: number
  readonly seed?: number
}

/** Le squelette vu par le téléphone : points sur l'image (normalisés) et dans l'espace (mètres, hanches en 0). */
export function project(
  body: Skeleton,
  t: number,
  { camera, shift = [0, 0], visibility = 0.95, far = 0.75, noise = 0, seed = 0 }: ProjectOptions,
): PoseFrame {
  const yaw = camera.yaw * DEG
  const roll = (camera.roll ?? 0) * DEG
  const [cx, cy] = [camera.width / 2, camera.height / 2]
  const turn = (x: number, y: number): readonly [number, number] => [
    cx + (x - cx) * Math.cos(roll) - (y - cy) * Math.sin(roll),
    cy + (x - cx) * Math.sin(roll) + (y - cy) * Math.cos(roll),
  ]
  const toCamera = ([l, u, f]: V3): V3 => [
    l * Math.cos(yaw) - f * Math.sin(yaw),
    -u,
    -f * Math.cos(yaw) - l * Math.sin(yaw),
  ]
  const known = (joint: number) => body.get(joint) ?? body.get(nearestKnown(joint)) ?? ([0, 0, 0] as V3)
  const hipMid = toCamera(mid(known(23), known(24)))
  const profile = Math.abs(Math.sin(yaw)) > 0.7
  const fromBack = Math.cos(yaw) < -0.5
  const shoulderDepth = [toCamera(known(11))[2], toCamera(known(12))[2]]
  const farSide = (shoulderDepth[0] ?? 0) > (shoulderDepth[1] ?? 0) ? 0 : 1
  const image: ImagePoint[] = []
  const world: WorldPoint[] = []
  for (let joint = 0; joint < POINTS; joint++) {
    const point = toCamera(known(nearestKnown(joint)))
    const wobble = (k: number) => (noise === 0 ? 0 : noise * jitter(seed * 4099 + joint * 7 + k))
    const [px, py] = turn(
      camera.origin[0] + shift[0] + point[0] * camera.pixelsPerMetre,
      camera.origin[1] + shift[1] + point[1] * camera.pixelsPerMetre,
    )
    const x = px / camera.width + wobble(1)
    const y = py / camera.height + wobble(2)
    const side = joint >= 11 ? (joint % 2 === 1 ? 0 : 1) : null
    const seen = joint <= 10 && fromBack ? 0.2 : profile && side === farSide ? far : visibility
    image.push([x, y, seen])
    world.push([point[0] - hipMid[0], point[1] - hipMid[1], point[2] - hipMid[2]])
  }
  return { t, width: camera.width, height: camera.height, image, world }
}

/** Une répétition fabriquée. */
export interface SynthRep {
  /** Part de la descente complète (1 : jusqu'à l'angle du bas ; 0,5 : demi-répétition). */
  readonly depth?: number
  readonly durationMs?: number
  /** Pause en haut, après la répétition. */
  readonly pauseMs?: number
  /** Curls : le bras qui travaille (0 gauche, 1 droit) ; sinon les deux. */
  readonly arm?: 0 | 1
}

export interface SynthSetOptions {
  readonly movement: CountedMovement
  /** Nombre de répétitions complètes, ou chacune décrite. */
  readonly reps: number | readonly SynthRep[]
  readonly fps?: number
  readonly repMs?: number
  readonly pauseMs?: number
  /** Position de départ tenue avant la première répétition. */
  readonly leadMs?: number
  /** Après la dernière : reste en position (`stay`), quitte la position (`leave` : debout, descendu de la barre), ou sort de l'image (`gone`). */
  readonly tailMs?: number
  readonly after?: 'stay' | 'leave' | 'gone'
  /** Curls : un bras après l'autre (sinon les deux ensemble). */
  readonly alternate?: boolean
  readonly top?: number
  readonly bottom?: number
  readonly kneeling?: boolean
  /** `mover` : la partie qui devrait bouger reste à sa hauteur, c'est le point d'appui qui bouge. */
  readonly pinned?: 'anchor' | 'mover'
  /** Moments où personne n'est vu (ms depuis le début). */
  readonly gaps?: readonly (readonly [from: number, to: number])[]
  /**
   * La personne se déplace sur le côté (vers sa gauche si `metres` est positif), à vitesse constante, de `at` à
   * `at + durationMs` (ms depuis le début).
   */
  readonly walk?: { readonly at: number; readonly metres: number; readonly durationMs: number }
  /** À partir de ce moment, une autre personne ailleurs dans l'image (décalée de `switchShift` pixels). */
  readonly switchAt?: number
  readonly switchShift?: number
  readonly camera?: Partial<SynthCamera>
  readonly visibility?: number
  readonly far?: number
  readonly noise?: number
  /** Temps de la première image (ms). */
  readonly startT?: number
}

/** Hauteur moyenne de ces points (mètres, vers le haut). */
const height = (body: Skeleton, joints: readonly number[]) =>
  joints.reduce((sum, joint) => sum + (body.get(joint)?.[1] ?? 0), 0) / joints.length

/** La hauteur (y vers le haut, mètres) de la partie qui bouge, pour `pinned: 'mover'`. */
function moverHeight(movement: CountedMovement, body: Skeleton): number {
  switch (movement) {
    case 'squat':
      return height(body, HIP)
    case 'curl':
      return height(body, WRIST)
    default:
      return height(body, SHOULDER)
  }
}

/**
 * La personne a quitté la position : debout, bras le long du corps, hanches à la hauteur du départ (tractions :
 * descendue de la barre, épaules 30 cm sous la position suspendue ; dips : descendue des barres, hanches 30 cm
 * plus bas).
 */
function leavingPose(movement: CountedMovement, start: Skeleton): Skeleton {
  const body = standing()
  const lift =
    movement === 'pullup'
      ? height(start, SHOULDER) - 0.3 - height(body, SHOULDER)
      : movement === 'dip'
        ? height(start, HIP) - 0.3 - height(body, HIP)
        : height(start, HIP) - height(body, HIP)
  return new Map([...body].map(([joint, point]) => [joint, add(point, [0, lift, 0])]))
}

/** Temps pour quitter la position (descendre de la barre, se relever). */
const LEAVE_MS = 800

/** Entre deux positions : `k` de 0 (la première) à 1 (la seconde). */
function blend(from: Skeleton, to: Skeleton, k: number): Skeleton {
  return new Map([...from].map(([joint, point]) => [joint, add(point, scale(sub(to.get(joint)!, point), k))]))
}

/** Une série complète, image par image (temps entiers, comme dans les fichiers de points). */
export function synthSet(options: SynthSetOptions): PoseFrame[] {
  const {
    movement,
    fps = 15,
    repMs = 2000,
    pauseMs = 500,
    leadMs = 1500,
    tailMs = 2000,
    after = 'stay',
    alternate = false,
    kneeling = false,
    pinned = 'anchor',
    gaps = [],
    switchShift = 100,
    startT = 0,
  } = options
  const range = SYNTH_RANGE[movement]
  const top = options.top ?? range.top
  const bottom = options.bottom ?? range.bottom
  const camera: SynthCamera = { ...SYNTH_CAMERAS[movement], ...options.camera }
  const reps: readonly SynthRep[] =
    typeof options.reps === 'number'
      ? Array.from({ length: options.reps }, (_, i) => (alternate ? { arm: i % 2 === 0 ? 0 : 1 } : {}))
      : options.reps
  const schedule: { start: number; end: number; rep: SynthRep }[] = []
  let at = leadMs
  for (const rep of reps) {
    const duration = rep.durationMs ?? repMs
    schedule.push({ start: at, end: at + duration, rep })
    at += duration + (rep.pauseMs ?? pauseMs)
  }
  const total = at + tailMs
  const start = synthPose(movement, top, { kneeling })
  const reference = moverHeight(movement, start)
  const leaving = leavingPose(movement, start)
  const frames: PoseFrame[] = []
  for (let i = 0; ; i++) {
    const elapsed = Math.round((i * 1000) / fps)
    if (elapsed > total) break
    const t = startT + elapsed
    const hidden = gaps.some(([from, to]) => elapsed >= from && elapsed < to)
    const done = elapsed >= at
    if (hidden || (done && after === 'gone')) {
      frames.push({ t, width: camera.width, height: camera.height, image: null, world: null })
      continue
    }
    let angles: [number, number] = [top, top]
    const current = schedule.find(({ start, end }) => elapsed >= start && elapsed < end)
    if (current) {
      const progress = (elapsed - current.start) / (current.end - current.start)
      const low = top - (current.rep.depth ?? 1) * (top - bottom)
      const angle = top - ((top - low) * (1 - Math.cos(2 * Math.PI * progress))) / 2
      const arm = current.rep.arm
      angles = arm === undefined ? [angle, angle] : arm === 0 ? [angle, top] : [top, angle]
    }
    let body =
      done && after === 'leave'
        ? blend(start, leaving, Math.min(1, (elapsed - at) / LEAVE_MS))
        : synthPose(movement, angles, { kneeling })
    if (pinned === 'mover' && !(done && after === 'leave')) {
      const lift = reference - moverHeight(movement, body)
      body = new Map([...body].map(([joint, point]) => [joint, add(point, [0, lift, 0])]))
    }
    if (options.walk) {
      const { at: from, metres, durationMs } = options.walk
      const aside = metres * Math.min(1, Math.max(0, (elapsed - from) / durationMs))
      body = new Map([...body].map(([joint, point]) => [joint, add(point, [aside, 0, 0])]))
    }
    const switched = options.switchAt !== undefined && elapsed >= options.switchAt
    frames.push(
      project(body, t, {
        camera,
        shift: switched ? [switchShift, 0] : [0, 0],
        ...(options.visibility === undefined ? {} : { visibility: options.visibility }),
        ...(options.far === undefined ? {} : { far: options.far }),
        ...(options.noise === undefined ? {} : { noise: options.noise, seed: i }),
      }),
    )
  }
  return frames
}

const SYNTH_META = {
  kind: 'set',
  split: 'check',
  source: 'Squelette fabriqué par src/test/pose-synth.ts (aucune image, aucune personne filmée)',
  licence: 'Données fabriquées pour CaliTrack, sans source extérieure',
  estimator: 'synthetic',
  fps: 15,
  width: 480,
  height: 640,
} as const

/** Les fichiers synth-*.json de src/test/reps, rejoués par les tests de bout en bout. */
export const SYNTH_FIXTURES: Readonly<Record<string, () => RepFixture>> = {
  'synth-squat-3': () =>
    encodeFixture(
      {
        ...SYNTH_META,
        name: 'synth-squat-3',
        movement: 'squat',
        exerciseId: 'squat',
        expected: { reps: 3, confident: true },
        notes: '3 squats de 2 s, départ tenu 1,5 s, debout 2 s à la fin.',
      },
      synthSet({ movement: 'squat', reps: 3 }),
    ),
  'synth-pullup-3': () =>
    encodeFixture(
      {
        ...SYNTH_META,
        name: 'synth-pullup-3',
        movement: 'pullup',
        exerciseId: 'pullup',
        expected: { reps: 3, confident: false },
        notes:
          '3 tractions de 2 s vues de dos, suspendu 1,5 s avant, 2 s après. En essai : compte à vérifier.',
      },
      synthSet({ movement: 'pullup', reps: 3 }),
    ),
}
