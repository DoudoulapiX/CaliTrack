import { distance, smoothingWeight, type Pixel } from './geometry.ts'
import { SIDES, type Side } from './features.ts'
import { FEET_DRIFT_TORSO, type MovementSpec } from './specs.ts'
import type { CounterParams, Phase, RejectReason } from './types.ts'

/*
 * Suivi d'une mesure (un côté, ou un bras pour les curls) : en haut → descend → en bas → remonte. La répétition
 * est comptée en remontant, après des contrôles dans cet ordre : durée, position tenue, déplacement des hanches
 * et des pieds, point d'appui immobile, course suffisante.
 *
 * Un point d'appui fixé dans la pièce (pieds au sol, mains au sol ou sur la barre) ne doit pas bouger depuis la
 * fin du mouvement précédent : faire deux pas puis se baisser pour ramasser quelque chose n'est pas un squat de
 * plus. Chaque côté est suivi à part : un pas ne déplace qu'un pied, et un point qui disparaît ne fait pas sauter
 * le milieu des deux.
 */

/** Point d'appui de chaque côté (gauche, droit), en pixels ; null quand il n'est pas vu ou pas suivi. */
export type SidePoints = readonly [left: Pixel | null, right: Pixel | null]

export interface TrackerInput {
  readonly t: number
  /** Mesure brute de l'image (lissée ici). */
  readonly value: number
  /** En position sur cette image. */
  readonly posture: boolean
  /** Hanches et chevilles (x en pixels), longueur du buste en pixels. */
  readonly hipX: number
  readonly ankleX: number | null
  readonly torso: number
  /** Point d'appui, de chaque côté. */
  readonly anchors: SidePoints
  /** Partie qui bouge, en pixels (null quand elle n'est pas vue). */
  readonly mover: Pixel | null
  /** Barre : mesure du bras le moins plié, quand les deux bras sont vus. */
  readonly pair?: number | null
}

export type TrackerEvent =
  | { readonly kind: 'rep'; readonly t: number; readonly durationMs: number; readonly min: number }
  | { readonly kind: 'partial'; readonly t: number; readonly min: number }
  | {
      readonly kind: 'rejected'
      readonly t: number
      readonly why: RejectReason
      readonly durationMs: number
      readonly min: number
    }
  /**
   * Des répétitions ont pu passer sans être vues : trou dans les images plus long que gapResetMs (le mouvement en
   * cours est perdu, et une répétition entière a pu s'y faire), ou suivi repris en pleine série (`resumed`) sur
   * une personne qui n'est pas en haut du mouvement.
   */
  | { readonly kind: 'lost'; readonly t: number }

export interface RepTracker {
  /** Une image utilisable ; rend l'évènement de fin de mouvement, s'il y en a un. */
  step(input: TrackerInput): TrackerEvent | null
  readonly phase: Phase
  /** Mesure lissée (null avant la première image). */
  readonly value: number | null
}

export type TrackerParams = Pick<
  CounterParams,
  'tauMs' | 'gapResetMs' | 'maxRepMs' | 'postureShare' | 'driftTorso'
>

type TrackerSpec = Pick<
  MovementSpec,
  'extended' | 'flexed' | 'attempt' | 'minRepMs' | 'maxAnchorDrift' | 'anchorFixed' | 'minTravel'
>

interface Movement {
  /** Moment estimé où la mesure est passée sous `extended`. */
  readonly startT: number
  readonly startHipX: number
  readonly startAnkleX: number | null
  readonly torso0: number
  min: number
  /** Barre : la mesure la plus basse du bras le moins plié (null tant qu'il n'est pas vu). */
  pairMin: number | null
  frames: number
  postureFrames: number
  /** Place de référence du point d'appui, par côté : fin du mouvement précédent, sinon début de celui-ci. */
  anchor0: [Pixel | null, Pixel | null]
  anchorDrift: number
  moverMin: number | null
  moverMax: number | null
}

export interface TrackerOptions {
  /**
   * Suivi repris en pleine série (une autre personne vient de passer) : si la première image ne montre pas la
   * personne en haut du mouvement, celui qu'elle faisait est perdu.
   */
  readonly resumed?: boolean
}

export function createRepTracker(
  spec: TrackerSpec,
  params: TrackerParams,
  { resumed = false }: TrackerOptions = {},
): RepTracker {
  let value: number | null = null
  let lastT: number | null = null
  let phase: Phase = 'unknown'
  let current: Movement | null = null
  /** Place du point d'appui à la fin du mouvement précédent (null : pas encore de mouvement fini). */
  let rest: SidePoints | null = null

  function verdict(
    input: TrackerInput,
    move: Movement,
    reachedBottom: boolean,
    crossing: number,
  ): TrackerEvent | null {
    const { t } = input
    const durationMs = crossing - move.startT
    const reached = reachedBottom && (move.pairMin === null || move.pairMin <= spec.attempt)
    if (!reached) return move.min <= spec.attempt ? { kind: 'partial', t, min: move.min } : null
    const drift = Math.abs(input.hipX - move.startHipX) / input.torso
    const feet =
      input.ankleX !== null && move.startAnkleX !== null
        ? Math.abs(input.ankleX - move.startAnkleX) / input.torso
        : 0
    const share = move.frames > 0 ? move.postureFrames / move.frames : 0
    const travel =
      move.moverMin === null || move.moverMax === null ? null : (move.moverMax - move.moverMin) / move.torso0
    const why: RejectReason | null =
      durationMs < spec.minRepMs
        ? 'fast'
        : durationMs > params.maxRepMs
          ? 'slow'
          : share < params.postureShare
            ? 'posture'
            : drift > params.driftTorso || feet > FEET_DRIFT_TORSO
              ? 'drift'
              : move.anchorDrift / move.torso0 > spec.maxAnchorDrift
                ? 'anchor'
                : travel === null || travel < spec.minTravel
                  ? 'travel'
                  : null
    return why === null
      ? { kind: 'rep', t, durationMs, min: move.min }
      : { kind: 'rejected', t, why, durationMs, min: move.min }
  }

  return {
    step(input) {
      const { t } = input
      const first = lastT === null
      const dt = lastT === null ? 0 : t - lastT
      const reset = lastT !== null && dt > params.gapResetMs
      // Une répétition (minRepMs) tient dans un tel trou : ce qui s'y est passé n'est pas compté, il faut le dire.
      const lost: TrackerEvent | null = reset && phase !== 'unknown' ? { kind: 'lost', t } : null
      if (reset) {
        // Trou dans les images : le lissage et le mouvement en cours repartent de zéro (pas de répétition à
        // cheval sur un trou).
        value = null
        if (phase !== 'unknown') phase = 'top'
        current = null
        rest = null
      }
      value = value === null ? input.value : value + smoothingWeight(dt, params.tauMs) * (input.value - value)
      lastT = t
      const v = value
      // Un seuil franchi l'a été entre l'image d'avant et celle-ci : au milieu, pour ne pas raccourcir une
      // répétition quand des images manquent.
      const crossing = reset ? t : t - dt / 2
      if (phase === 'unknown') {
        if (v >= spec.extended) phase = 'top'
        return first && resumed && phase === 'unknown' ? { kind: 'lost', t } : null
      }
      if (phase === 'top' && v < spec.extended) {
        phase = 'down'
        current = {
          startT: crossing,
          startHipX: input.hipX,
          startAnkleX: input.ankleX,
          torso0: input.torso,
          min: v,
          pairMin: null,
          frames: 0,
          postureFrames: 0,
          anchor0: spec.anchorFixed
            ? [rest?.[0] ?? input.anchors[0], rest?.[1] ?? input.anchors[1]]
            : [input.anchors[0], input.anchors[1]],
          anchorDrift: 0,
          moverMin: input.mover?.[1] ?? null,
          moverMax: input.mover?.[1] ?? null,
        }
      }
      if ((phase === 'down' || phase === 'bottom') && current) {
        const move = current
        move.frames++
        if (input.posture) move.postureFrames++
        for (const side of SIDES) {
          const point = input.anchors[side]
          const from = move.anchor0[side]
          if (point && from) move.anchorDrift = Math.max(move.anchorDrift, distance(point, from))
          else if (point) move.anchor0[side] = point
        }
        if (input.mover) {
          const y = input.mover[1]
          move.moverMin = move.moverMin === null ? y : Math.min(move.moverMin, y)
          move.moverMax = move.moverMax === null ? y : Math.max(move.moverMax, y)
        }
        move.min = Math.min(move.min, v)
        if (input.pair !== undefined && input.pair !== null) {
          move.pairMin = move.pairMin === null ? input.pair : Math.min(move.pairMin, input.pair)
        }
        if (phase === 'down' && v <= spec.flexed) phase = 'bottom'
        if (v >= spec.extended) {
          const event = verdict(input, move, phase === 'bottom', crossing)
          phase = 'top'
          current = null
          rest = input.anchors
          return event
        }
      }
      return lost
    },
    get phase() {
      return phase
    },
    get value() {
      return value
    },
  }
}

/** Deux bras qui finissent une répétition à moins de `mergeMs` l'un de l'autre font une seule répétition. */
export interface ArmMerger {
  /** Une répétition de ce bras : vrai si elle compte, faux si elle double celle de l'autre bras. */
  add(side: Side, t: number): boolean
  reset(): void
}

export function createArmMerger(mergeMs: number): ArmMerger {
  let last: [number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
  return {
    add(side, t) {
      const other = last[side === 0 ? 1 : 0]
      last[side] = t
      return t - other >= mergeMs
    },
    reset() {
      last = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]
    },
  }
}
