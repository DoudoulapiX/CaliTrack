import { idleLimit, trimByCadence } from './cadence.ts'
import { judge } from './confidence.ts'
import {
  ANKLE,
  armLength,
  bodyPoint,
  measureFrame,
  missingPart,
  pairPoint,
  SIDES,
  sidePoints,
  type Body,
  type FrameFeatures,
  type Side,
} from './features.ts'
import { distance, median, smoothingWeight, type Pixel } from './geometry.ts'
import { createArmMerger, createRepTracker, type RepTracker, type TrackerEvent } from './rep-tracker.ts'
import { COUNTER_PARAMS, HIP_SPEED_GAP_MS, HIP_SPEED_TAU_MS, specFor, type MovementSpec } from './specs.ts'
import type {
  CounterDebug,
  CounterParams,
  CounterResult,
  CounterSnapshot,
  CounterStatus,
  CountedVariant,
  EndReason,
  Phase,
  PlacementHint,
  PoseFrame,
  RejectReason,
  RepEvent,
} from './types.ts'

/*
 * Compteur d'une série : reçoit les images analysées, cherche la personne, arme (position de départ tenue 1 s,
 * immobile), compte, et termine tout seul (pause, position quittée, personne partie) ou sur demande. Le temps est
 * toujours celui des images : le même fichier de points donne toujours le même compte.
 *
 *   searching ─(utilisable, en position, hanches immobiles)─▶ arming ─(tenu armMs)─▶ counting ─▶ ended
 *       ▲                         │ (position perdue)
 *       └─────────────────────────┘
 */

export interface RepCounterOptions {
  readonly variant: CountedVariant
  /** Répétitions déjà comptées pour cette série (« Continuer la série »). */
  readonly offset?: number
  readonly params?: Partial<CounterParams>
  /** Seuils du mouvement à essayer à la place des siens (npm run reps:eval -- --variant), jamais dans l'appli. */
  readonly spec?: Partial<MovementSpec>
}

export interface RepCounter {
  /** light : lumière moyenne 0..255 de l'image, si mesurée. */
  push(frame: PoseFrame, light?: number | null): CounterSnapshot
  /** Pas d'image depuis un moment (caméra figée) : laisse passer le temps. */
  tick(t: number): CounterSnapshot
  /** Termine maintenant et rend le résultat ; un second appel rend le même. */
  finish(t: number, why: 'manual' | 'interrupted'): CounterResult
  /** Le résultat une fois la série terminée, sinon null. */
  readonly result: CounterResult | null
  readonly snapshot: CounterSnapshot
}

/** Constante de temps de la mesure des images par seconde affichée. */
const FPS_TAU_MS = 1000
/** Temps depuis le départ avant de juger la cadence des images. */
const FPS_MIN_SPAN_MS = 1000

const PHASE_ORDER: readonly Phase[] = ['unknown', 'top', 'down', 'bottom']
/**
 * Refus d'une vraie répétition ratée, qui comptent jusqu'à la fin de la série (la dernière répétition est souvent
 * la plus dure). Pas `fast` : une flexion éclair après la série (MM-Fit w00) n'en est pas une, et une répétition
 * coupée par un trou d'images est déjà dite perdue ; ni `drift`, ni `anchor` : c'est la personne qui s'en va.
 */
const FAILED_ATTEMPTS: readonly RejectReason[] = ['slow', 'posture', 'travel']
const SIDE_NAME = ['left', 'right'] as const

function sameHint(a: PlacementHint | null, b: PlacementHint | null): boolean {
  if (a === null || b === null) return a === b
  return a.kind === b.kind && (a.kind !== 'out' || (b.kind === 'out' && a.part === b.part))
}

export function createRepCounter(options: RepCounterOptions): RepCounter {
  const spec: MovementSpec = { ...specFor(options.variant), ...options.spec }
  const params: CounterParams = { ...COUNTER_PARAMS, ...options.params }
  const offset = options.offset ?? 0
  const perArm = spec.sides === 'perArm'

  let status: CounterStatus = 'searching'
  let armSince = 0
  let goAt: number | null = null
  let trackers: RepTracker[] | null = null
  const merger = createArmMerger(params.perArmMergeMs)

  // Images
  let lastFrameT: number | null = null
  let frameInterval: number | null = null
  let framesSinceGo = 0
  let lastGood: number | null = null
  let lastHip: Pixel | null = null
  let lastHipT: number | null = null
  let hipSpeed = 0
  let side: Side | null = null
  let armSamples: [number[], number[]] = [[], []]
  let armLengths: readonly [number | null, number | null] = [null, null]
  // Barres : place des mains pendant l'armement, puis au départ.
  let anchorSamples: Pixel[] = []
  let anchorHome: Pixel | null = null
  let badPostureSince: number | null = null
  let tiltSince: number | null = null
  const samples: { t: number; ok: boolean }[] = []

  // Répétitions
  let pending: number[] = []
  const repTimes: number[] = []
  let reps = 0
  let partials = 0
  const rejections: { readonly t: number; readonly why: RejectReason }[] = []
  let lastReject: RejectReason | null = null
  /** Moments où des répétitions ont pu passer sans être vues (trou dans les images, autre personne). */
  const lostTimes: number[] = []
  let lastRepAt: number | null = null
  let event: (RepEvent & { readonly id: number }) | null = null
  let eventId = 0

  // Consigne
  let hint: PlacementHint | null = { kind: 'noPerson' }
  let candidate: PlacementHint | null = null
  let candidateSince = 0
  let seenFrame = false

  let features: FrameFeatures | null = null
  let result: CounterResult | null = null
  let snapshot = buildSnapshot()

  function emit(next: RepEvent): void {
    eventId++
    event = { ...next, id: eventId }
  }

  /** resumed : repris en pleine série, après le passage d'une autre personne (voir createRepTracker). */
  function newTrackers(resumed = false): RepTracker[] {
    merger.reset()
    const tracker = () => createRepTracker(spec, params, { resumed })
    return perArm ? [tracker(), tracker()] : [tracker()]
  }

  function allAtTop(): boolean {
    return trackers !== null && trackers.every((tracker) => tracker.phase === 'top')
  }

  function addRep(t: number): void {
    if (status === 'arming') {
      pending.push(t)
      return
    }
    reps++
    lastRepAt = t
    repTimes.push(t)
    emit({ kind: 'rep', t, reps: offset + reps })
  }

  function onEvent(ev: TrackerEvent | null, arm: Side | null): void {
    if (!ev) return
    if (ev.kind === 'rep') {
      // Curls à deux bras : le second bras qui finit presque en même temps fait la même répétition.
      if (arm !== null && !merger.add(arm, ev.t)) return
      addRep(ev.t)
    } else if (ev.kind === 'partial') {
      partials++
      emit({ kind: 'partial', t: ev.t })
    } else if (ev.kind === 'lost') {
      lostTimes.push(ev.t)
    } else {
      rejections.push({ t: ev.t, why: ev.why })
      lastReject = ev.why
      emit({ kind: 'rejected', t: ev.t, why: ev.why })
    }
  }

  function go(t: number): void {
    status = 'counting'
    goAt = t
    framesSinceGo = 1
    lastRepAt = t
    const lengthOf = (values: readonly number[]) => {
      const length = median(values)
      return Number.isNaN(length) ? null : length
    }
    armLengths = [lengthOf(armSamples[0]), lengthOf(armSamples[1])]
    anchorHome =
      anchorSamples.length > 0
        ? [median(anchorSamples.map((point) => point[0])), median(anchorSamples.map((point) => point[1]))]
        : null
    // Les répétitions faites pendant l'armement comptent (quelqu'un qui commence tout de suite).
    if (pending.length > 0) {
      reps += pending.length
      repTimes.push(...pending)
      emit({ kind: 'rep', t, reps: offset + reps })
    }
    pending = []
  }

  /** Images par seconde depuis le départ ; null tant que c'est trop tôt pour le dire. */
  function fpsSinceGo(): number | null {
    if (goAt === null || lastFrameT === null) return null
    const span = lastFrameT - goAt
    return span >= FPS_MIN_SPAN_MS ? ((framesSinceGo - 1) * 1000) / span : null
  }

  function end(t: number, why: EndReason): CounterResult {
    const { kept, doubtful } = trimByCadence(repTimes, params)
    const start = goAt ?? Number.POSITIVE_INFINITY
    const lastRep = kept.length > 0 ? Math.max(...repTimes) : null
    const windowEnd = lastRep !== null && lastRep >= start ? lastRep : t
    const inWindow = samples.filter((sample) => sample.t >= start && sample.t <= windowEnd)
    const quality = inWindow.length > 0 ? inWindow.filter((sample) => sample.ok).length / inWindow.length : 1
    // Après la dernière répétition gardée, seule une vraie répétition ratée compte.
    const rejected = rejections.filter(
      ({ t: time, why }) =>
        time >= start && ((lastRep !== null && time <= lastRep) || FAILED_ATTEMPTS.includes(why)),
    ).length
    const verdict = judge(
      {
        reps: kept.length,
        doubtful: doubtful.length,
        rejected,
        lost: lostTimes.filter((time) => time >= start).length,
        quality,
        fps: fpsSinceGo(),
        endedBy: why,
        validated: spec.validated,
      },
      params,
    )
    const done: CounterResult = {
      reps: offset + kept.length,
      doubtful: doubtful.length,
      partials,
      rejected,
      confident: verdict.confident,
      reasons: verdict.reasons,
      endedBy: why,
      repTimes: kept,
    }
    result = done
    status = 'ended'
    hint = null
    trackers = null
    return done
  }

  function rawHint(f: FrameFeatures, light: number | null, t: number): PlacementHint | null {
    const body = f.body
    if (!body) return { kind: 'noPerson' }
    const height = body.frame.height
    if (body.torso > params.tooClose * height) return { kind: 'tooClose' }
    if (body.torso < params.tooFar * height) return { kind: 'tooFar' }
    if (!f.measured) return { kind: 'out', part: missingPart(f.missing) }
    if (spec.upright && tiltSince !== null && t - tiltSince >= params.phoneUprightMs) {
      return { kind: 'phoneUpright' }
    }
    if (!f.view) return { kind: 'turnSide' }
    if (!f.posture) return { kind: 'position' }
    const [low, high] = params.darkVisibility
    if ((light !== null && light < params.darkLight) || (f.visibility >= low && f.visibility < high)) {
      return { kind: 'dark' }
    }
    if ((status === 'searching' || status === 'arming') && hipSpeed >= params.armHipSpeed) {
      return { kind: 'holdStill' }
    }
    return null
  }

  /** Une consigne ne change qu'après être restée la même hintStableMs (pas de clignotement). */
  function updateHint(raw: PlacementHint | null, t: number): void {
    if (!seenFrame) {
      seenFrame = true
      hint = raw
      candidate = raw
      candidateSince = t
      return
    }
    if (sameHint(raw, hint)) {
      candidate = raw
      candidateSince = t
    } else if (!sameHint(raw, candidate)) {
      candidate = raw
      candidateSince = t
    } else if (t - candidateSince >= params.hintStableMs) {
      hint = raw
    }
  }

  function buildDebug(): CounterDebug {
    const f = features
    let signal = f?.signal ?? null
    let phase: Phase = 'unknown'
    if (trackers) {
      const values = trackers.map((tracker) => tracker.value).filter((value) => value !== null)
      signal = values.length > 0 ? Math.min(...values) : signal
      phase = trackers
        .map((tracker) => tracker.phase)
        .reduce((a, b) => (PHASE_ORDER.indexOf(b) > PHASE_ORDER.indexOf(a) ? b : a))
    }
    const both = f !== null && f.values[0] !== null && f.values[1] !== null
    const counted = samples.filter((sample) => goAt !== null && sample.t >= goAt)
    return {
      signal,
      flexed: spec.flexed,
      extended: spec.extended,
      phase,
      side: f !== null && f.side !== null ? SIDE_NAME[f.side] : both ? 'both' : null,
      visibility: f?.visibility ?? 0,
      quality: counted.length > 0 ? counted.filter((sample) => sample.ok).length / counted.length : 0,
      fps: frameInterval !== null && frameInterval > 0 ? 1000 / frameInterval : 0,
      lastReject,
    }
  }

  function buildSnapshot(): CounterSnapshot {
    const fps = fpsSinceGo()
    return {
      status,
      reps: result ? result.reps : offset + reps,
      partials,
      hint,
      event,
      debug: buildDebug(),
      slow: fps !== null && fps < params.minFps,
    }
  }

  /** Barres : les mains sont loin de leur place au départ (la personne a lâché). */
  function offBars(body: Body): boolean {
    if (spec.leaveAnchor === null || anchorHome === null) return false
    const anchor = bodyPoint(body, spec.anchor, null)
    return anchor !== null && distance(anchor, anchorHome) / body.torso > spec.leaveAnchor
  }

  function step(f: FrameFeatures, t: number): void {
    const body = f.body
    const good = f.good
    const posture = f.posture
    // Une autre personne : les hanches sautent entre deux images proches.
    if (good && body?.hip && lastHip && lastHipT !== null && t - lastHipT < params.jumpWindowMs) {
      if (distance(body.hip, lastHip) / body.torso > params.jumpTorso) {
        if (status === 'counting') {
          // Le mouvement en cours est perdu ; les nouveaux suivis le disent aussi s'ils ne trouvent pas la
          // personne en haut (au retour de la bonne personne, en plein mouvement).
          if (trackers?.some((tracker) => tracker.phase === 'down' || tracker.phase === 'bottom')) {
            lostTimes.push(t)
          }
          trackers = newTrackers(true)
          // Les mains de la nouvelle personne servent de nouvelle place.
          anchorHome = bodyPoint(body, spec.anchor, null)
        }
        if (status === 'arming') {
          status = 'searching'
          trackers = null
          pending = []
        }
      }
    }
    // Vitesse horizontale des hanches (marcher les déplace, un squat ou une traction non).
    if (good && body?.hip && lastHip && lastHipT !== null && t - lastHipT < HIP_SPEED_GAP_MS) {
      const dt = Math.max(1, t - lastHipT)
      const speed = Math.abs(body.hip[0] - lastHip[0]) / body.torso / (dt / 1000)
      hipSpeed += smoothingWeight(dt, HIP_SPEED_TAU_MS) * (speed - hipSpeed)
    } else if (good) hipSpeed = 0
    if (good && body?.hip) {
      lastHip = body.hip
      lastHipT = t
      lastGood = t
    }

    if (status === 'searching' || status === 'arming') {
      const start = good && posture && hipSpeed < params.armHipSpeed
      if (start && status === 'searching') {
        status = 'arming'
        armSince = t
        trackers = newTrackers()
        pending = []
        armSamples = [[], []]
        anchorSamples = []
      } else if (start && t - armSince >= params.armMs) {
        go(t)
      } else if (!start && status === 'arming') {
        status = 'searching'
        trackers = null
        pending = []
      }
      if (status !== 'arming') return
      if (body) {
        for (const s of SIDES) {
          const length = armLength(body, s)
          if (length !== null) armSamples[s].push(length)
        }
        const anchor = bodyPoint(body, spec.anchor, null)
        if (anchor) anchorSamples.push(anchor)
      }
    }

    if (status === 'counting') {
      samples.push({ t, ok: good && posture })
    }
    if (!good || !body?.hip || !trackers) {
      if (status === 'counting' && reps > 0 && lastGood !== null && t - lastGood > params.goneMs) {
        end(t, 'gone')
      }
      return
    }
    const ankleX = pairPoint(body, ANKLE, null)?.[0] ?? null
    const input = { t, hipX: body.hip[0], ankleX, torso: body.torso }
    if (perArm) {
      for (const s of SIDES) {
        const value = f.values[s]
        const tracker = trackers[s]
        if (value === null || !tracker) continue
        const ev = tracker.step({
          ...input,
          value,
          posture: posture && f.arms[s],
          anchors: sidePoints(body, spec.anchor, s),
          mover: bodyPoint(body, spec.mover, s),
        })
        onEvent(ev, s)
      }
    } else if (f.signal !== null && trackers[0]) {
      const pointSide = spec.sides === 'best' ? f.side : null
      const armsOk = SIDES.every((s) => f.values[s] === null || f.arms[s])
      const ev = trackers[0].step({
        ...input,
        value: f.signal,
        pair: f.pair,
        posture: posture && armsOk,
        anchors: sidePoints(body, spec.anchor, pointSide),
        mover: bodyPoint(body, spec.mover, pointSide),
      })
      onEvent(ev, null)
    }
    if (status !== 'counting') return
    const top = allAtTop()
    if (reps > 0 && top && lastRepAt !== null && t - lastRepAt > idleLimit(repTimes, params)) {
      end(t, 'idle')
      return
    }
    if (posture && !offBars(body)) badPostureSince = null
    else badPostureSince ??= t
    // Position quittée (debout, descendu de la barre) : fin de série, où que soit le mouvement en cours.
    if (reps > 0 && badPostureSince !== null && t - badPostureSince > params.leftMs) end(t, 'left')
  }

  return {
    push(frame, light = null) {
      if (result || (lastFrameT !== null && frame.t <= lastFrameT)) return snapshot
      const t = frame.t
      if (lastFrameT !== null) {
        const dt = t - lastFrameT
        frameInterval =
          frameInterval === null ? dt : frameInterval + smoothingWeight(dt, FPS_TAU_MS) * (dt - frameInterval)
      }
      lastFrameT = t
      if (goAt !== null) framesSinceGo++
      const f = measureFrame(frame, spec, params, { side, armLengths })
      features = f
      if (spec.sides === 'best' && f.side !== null) side = f.side
      tiltSince = f.tilt !== null && f.tilt > params.phoneUprightDeg ? (tiltSince ?? t) : null
      step(f, t)
      if (status !== 'ended') updateHint(rawHint(f, light, t), t)
      snapshot = buildSnapshot()
      return snapshot
    },
    tick(t) {
      if (result) return snapshot
      if (status === 'counting' && reps > 0) {
        const top = allAtTop()
        if (lastGood !== null && t - lastGood > params.goneMs) end(t, 'gone')
        else if (top && lastRepAt !== null && t - lastRepAt > idleLimit(repTimes, params)) end(t, 'idle')
        else if (badPostureSince !== null && t - badPostureSince > params.leftMs) end(t, 'left')
      }
      snapshot = buildSnapshot()
      return snapshot
    },
    finish(t, why) {
      if (result) return result
      const done = end(Math.max(t, lastFrameT ?? t), why)
      snapshot = buildSnapshot()
      return done
    },
    get result() {
      return result
    },
    get snapshot() {
      return snapshot
    },
  }
}
