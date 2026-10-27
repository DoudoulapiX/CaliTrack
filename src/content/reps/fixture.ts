import { z } from 'zod'
import type { CountedMovement, ImagePoint, PoseFrame, WorldPoint } from './types.ts'

/*
 * Fichiers de points (« fixtures ») : le squelette d'une vraie série, jamais d'image. Une image par entrée de
 * `frames` : [t, points sur l'image, points dans l'espace], en entiers (millièmes sur l'image, millimètres dans
 * l'espace), et seulement les points utiles (`joints`). `0` à la place des points : personne n'est vu.
 */

/** Nombre de points d'un squelette MediaPipe. */
export const POSE_POINTS = 33

/** Points gardés dans les fichiers : nez, épaules, coudes, poignets, hanches, genoux, chevilles. */
export const FIXTURE_JOINTS: readonly number[] = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]

/** Une image : temps (ms), puis [x‰, y‰, visibilité‰] et [x, y, z] en mm par point, ou 0. */
export type FixtureFrame = readonly [t: number, image: readonly number[] | 0, world: readonly number[] | 0]

export interface RepFixture {
  readonly format: 1
  readonly name: string
  /** Mouvement filmé ; null : moment sans exercice compté (marche, repos), essayé avec les cinq mouvements. */
  readonly movement: CountedMovement | null
  readonly exerciseId: string | null
  /** 'negative' : rien ne doit être compté, quel que soit le mouvement. */
  readonly kind: 'set' | 'negative'
  /** Le compte attendu (exact) et, si on le sait, s'il doit être sûr. */
  readonly expected: { readonly reps: number; readonly confident?: boolean }
  /** 'tune' : sert à régler les seuils ; 'check' : seulement à les vérifier. */
  readonly split: 'tune' | 'check'
  readonly source: string
  readonly licence: string
  /** Ce qui a calculé les points (par exemple « mediapipe-0.10.35-lite-cpu »). */
  readonly estimator: string
  readonly notes?: string
  readonly fps: number
  /** Taille de l'image analysée en pixels. */
  readonly width: number
  readonly height: number
  readonly joints: readonly number[]
  readonly frames: readonly FixtureFrame[]
}

export type FixtureMeta = Omit<RepFixture, 'format' | 'joints' | 'frames'>

const MOVEMENTS = ['squat', 'pushup', 'dip', 'pullup', 'curl'] as const satisfies readonly CountedMovement[]
const integers = z.array(z.number().int())
const points = z.union([integers, z.literal(0)])

export const repFixtureSchema: z.ZodType<RepFixture> = z
  .strictObject({
    format: z.literal(1),
    name: z.string().min(1),
    movement: z.enum(MOVEMENTS).nullable(),
    exerciseId: z.string().min(1).nullable(),
    kind: z.enum(['set', 'negative']),
    expected: z.strictObject({ reps: z.number().int().min(0), confident: z.boolean().optional() }),
    split: z.enum(['tune', 'check']),
    source: z.string().min(1),
    licence: z.string().min(1),
    estimator: z.string().min(1),
    notes: z.string().optional(),
    fps: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    joints: z
      .array(
        z
          .number()
          .int()
          .min(0)
          .max(POSE_POINTS - 1),
      )
      .min(1),
    frames: z.array(z.tuple([z.number().int(), points, points])),
  })
  .superRefine((fixture, context) => {
    const problem = (message: string) => {
      context.addIssue({ code: 'custom', message })
    }
    if (new Set(fixture.joints).size !== fixture.joints.length) problem('Point en double dans joints')
    if ((fixture.kind === 'negative') !== (fixture.movement === null)) {
      problem('Un fichier négatif n’a pas de mouvement, une série en a un')
    }
    if (fixture.kind === 'negative' && fixture.expected.reps !== 0) problem('Un fichier négatif attend 0')
    const size = fixture.joints.length * 3
    let last = Number.NEGATIVE_INFINITY
    for (const [index, [t, image, world]] of fixture.frames.entries()) {
      if (t <= last) problem(`Image ${index} : temps pas croissant`)
      last = t
      if (image !== 0 && image.length !== size)
        problem(`Image ${index} : ${image.length} nombres sur l’image`)
      if (world !== 0 && world.length !== size)
        problem(`Image ${index} : ${world.length} nombres dans l’espace`)
    }
  })

const toInt = (value: number) => Math.round(value * 1000)
const fromInt = (value: number | undefined) => (value ?? 0) / 1000

/** Une image du fichier : points gardés seulement, en entiers ; un point absent compte comme invisible. */
export function encodeFrame(frame: PoseFrame, joints: readonly number[] = FIXTURE_JOINTS): FixtureFrame {
  const image = frame.image
  const world = frame.world
  return [
    Math.round(frame.t),
    image
      ? joints.flatMap((joint) => {
          const point = image[joint]
          return point ? [toInt(point[0]), toInt(point[1]), toInt(point[2])] : [0, 0, 0]
        })
      : 0,
    world
      ? joints.flatMap((joint) => {
          const point = world[joint]
          return point ? [toInt(point[0]), toInt(point[1]), toInt(point[2])] : [0, 0, 0]
        })
      : 0,
  ]
}

/** Un fichier complet ; les temps sont gardés tels quels. */
export function encodeFixture(
  meta: FixtureMeta,
  frames: readonly PoseFrame[],
  joints: readonly number[] = FIXTURE_JOINTS,
): RepFixture {
  return {
    format: 1,
    name: meta.name,
    movement: meta.movement,
    exerciseId: meta.exerciseId,
    kind: meta.kind,
    expected: meta.expected,
    split: meta.split,
    source: meta.source,
    licence: meta.licence,
    estimator: meta.estimator,
    ...(meta.notes === undefined ? {} : { notes: meta.notes }),
    fps: meta.fps,
    width: meta.width,
    height: meta.height,
    joints: [...joints],
    frames: frames.map((frame) => encodeFrame(frame, joints)),
  }
}

/** Les images du fichier, avec leurs 33 points : ceux qui n'y sont pas sont invisibles (visibilité 0). */
export function decodeFixture(fixture: RepFixture): PoseFrame[] {
  const slot = new Map(fixture.joints.map((joint, index) => [joint, index * 3]))
  const expand = <P>(values: readonly number[], point: (a: number, b: number, c: number) => P): P[] =>
    Array.from({ length: POSE_POINTS }, (_, joint) => {
      const at = slot.get(joint)
      return at === undefined
        ? point(0, 0, 0)
        : point(fromInt(values[at]), fromInt(values[at + 1]), fromInt(values[at + 2]))
    })
  return fixture.frames.map(([t, image, world]) => ({
    t,
    width: fixture.width,
    height: fixture.height,
    image: image === 0 ? null : expand<ImagePoint>(image, (x, y, visibility) => [x, y, visibility]),
    world: world === 0 ? null : expand<WorldPoint>(world, (x, y, z) => [x, y, z]),
  }))
}

/** Arrondi des temps au millième de seconde : une image à 133 ms compte pour 133,3 ms. */
const SLACK_MS = 1

/**
 * Garde au plus `fps` images par seconde, comme un téléphone plus lent : la première image, puis la première de
 * chaque intervalle de 1000 / fps ms (calé sur la première, recalé après un trou).
 */
export function decimate(frames: readonly PoseFrame[], fps: number): PoseFrame[] {
  const step = 1000 / fps
  const kept: PoseFrame[] = []
  let due = Number.NEGATIVE_INFINITY
  for (const frame of frames) {
    if (frame.t + SLACK_MS < due) continue
    kept.push(frame)
    due = due + step > frame.t ? due + step : frame.t + step
  }
  return kept
}
