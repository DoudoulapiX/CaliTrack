import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { PoseFrame } from '@/content/reps/types'
import { cameraProblem, openCamera, stopStream, type CameraProblem, type Facing } from '@/lib/camera'
import { startFrameLoop, videoFrameScheduler, type FrameLoop, type FrameScheduler } from './frame-loop'
import { sampleLight } from './light'
import { paintOverlay } from './overlay'
import {
  openPoseEngine,
  PoseEngineError,
  type Delegate,
  type PoseEngine,
  type PoseEngineProblem,
} from './pose-engine'

/*
 * La caméra et le moteur de squelette du compteur. Le moteur se charge dès que la feuille s'ouvre (seulement
 * les fichiers de l'appli, aucune caméra) ; la caméra ne démarre qu'après un toucher (`cameraOn`), une fois le
 * moteur prêt. Chaque image analysée part vers `onFrame`, puis le squelette se dessine sur `overlayRef`.
 * L'appli passe en arrière-plan : caméra coupée, moteur fermé, et rien ne repart tout seul (« Réessayer »).
 */

export type { FrameScheduler } from './frame-loop'

export type PoseCameraProblem = CameraProblem | PoseEngineProblem | 'crashed' | 'stopped'

export type PoseCameraState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly step: 'engine' | 'camera' }
  | { readonly kind: 'running' }
  | { readonly kind: 'problem'; readonly problem: PoseCameraProblem }

export interface PoseCameraStats {
  /** Images analysées par seconde. */
  readonly fps: number
  /** Durée médiane d'une analyse, en millisecondes. */
  readonly msP50: number | null
  /** Lumière moyenne de l'image, de 0 à 255. */
  readonly light: number | null
  /** Images analysées depuis l'ouverture de la caméra, et celles où une personne a été vue. */
  readonly frames: number
  readonly detected: number
  readonly delegate: Delegate | null
}

export interface PoseCameraDeps {
  openEngine?: typeof openPoseEngine
  openCamera?: typeof openCamera
  scheduler?: FrameScheduler
}

export interface PoseCameraOptions {
  /** Feuille ouverte : le moteur se charge. */
  open: boolean
  /** Après « Ouvrir la caméra » : la caméra démarre. */
  cameraOn: boolean
  /** Faux pendant le repos et les écrans de résultat : la caméra reste allumée, rien n'est analysé. */
  analysing: boolean
  facing: Facing
  /** Calcul demandé ; pris au chargement du moteur (un changement vaut pour la prochaine ouverture). */
  delegate: Delegate
  /** Points dessinés sur le squelette. */
  joints: readonly number[]
  /** Chaque image analysée, avec la dernière lumière mesurée (une fois par seconde). */
  onFrame: (frame: PoseFrame, light: number | null) => void
  /**
   * La caméra s'est coupée pendant qu'elle était demandée (appli en arrière-plan, caméra prise par un appel) :
   * caméra et moteur déjà arrêtés, état « stopped ».
   */
  onHidden: () => void
  deps?: PoseCameraDeps
}

export interface PoseCamera {
  videoRef: RefObject<HTMLVideoElement | null>
  overlayRef: RefObject<HTMLCanvasElement | null>
  state: PoseCameraState
  /** Mis à jour 4 fois par seconde. */
  stats: PoseCameraStats
  /** Après un problème : recharge le moteur s'il a été fermé, et rouvre la caméra. */
  retry: () => void
}

const IDLE: PoseCameraState = { kind: 'idle' }
const RUNNING: PoseCameraState = { kind: 'running' }
const LOADING_ENGINE: PoseCameraState = { kind: 'loading', step: 'engine' }
const LOADING_CAMERA: PoseCameraState = { kind: 'loading', step: 'camera' }

export const NO_POSE_STATS: PoseCameraStats = {
  fps: 0,
  msP50: null,
  light: null,
  frames: 0,
  detected: 0,
  delegate: null,
}

/** Statistiques publiées au plus toutes les 250 ms (temps des images) : 4 fois par seconde. */
export const STATS_EVERY_MS = 250
/** Lumière mesurée au plus une fois par seconde. */
export const LIGHT_EVERY_MS = 1000
/** Médiane des durées d'analyse sur les 31 dernières images. */
const DURATIONS_KEPT = 31

/** Médiane de durées (null sans durée). */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? null)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

function sameStats(a: PoseCameraStats, b: PoseCameraStats): boolean {
  return (
    a.fps === b.fps &&
    a.msP50 === b.msP50 &&
    a.light === b.light &&
    a.frames === b.frames &&
    a.detected === b.detected &&
    a.delegate === b.delegate
  )
}

function sameState(a: PoseCameraState, b: PoseCameraState): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'loading' && b.kind === 'loading') return a.step === b.step
  // Un nouveau problème est un nouvel objet, même s'il est le même qu'avant « Réessayer ».
  return a.kind !== 'problem'
}

interface ControllerLinks {
  readonly videoRef: RefObject<HTMLVideoElement | null>
  readonly overlayRef: RefObject<HTMLCanvasElement | null>
  readonly latest: RefObject<PoseCameraOptions>
  readonly setState: (state: PoseCameraState) => void
  readonly setStats: (stats: PoseCameraStats) => void
}

interface PoseCameraController {
  /** La caméra est demandée (ou plus), de ce côté. */
  want(cameraOn: boolean, facing: Facing): void
  analyse(on: boolean): void
  retry(): void
  dispose(): void
}

/**
 * Le moteur, la caméra et la boucle d'une ouverture de la feuille. Chaque attente (moteur, caméra, lecture de la
 * vidéo) porte un jeton : quand elle se termine après un arrêt, ce qu'elle rend est aussitôt libéré.
 */
function createController({
  videoRef,
  overlayRef,
  latest,
  setState,
  setStats,
}: ControllerLinks): PoseCameraController {
  let disposed = false
  let halted: PoseCameraProblem | null = null
  let state: PoseCameraState = IDLE
  let wanted = { camera: latest.current.cameraOn, facing: latest.current.facing }
  let analysing = latest.current.analysing

  let engine: PoseEngine | null = null
  let engineLoading = false
  let engineToken = 0

  let stream: MediaStream | null = null
  let shownIn: HTMLVideoElement | null = null
  let cameraStarting = false
  let cameraToken = 0
  let loop: FrameLoop | null = null
  let unwatchTracks: () => void = () => undefined

  // Statistiques de la caméra en cours.
  let frames = 0
  let detected = 0
  let durations: number[] = []
  let times: number[] = []
  let light: number | null = null
  let lightAt = Number.NEGATIVE_INFINITY
  let statsAt = Number.NEGATIVE_INFINITY
  let stats = NO_POSE_STATS
  const lightCanvas = document.createElement('canvas')

  const report = () => {
    if (disposed) return
    let next: PoseCameraState
    if (halted) next = { kind: 'problem', problem: halted }
    else if (engineLoading) next = LOADING_ENGINE
    else if (!engine || !wanted.camera) next = IDLE
    else next = loop ? RUNNING : LOADING_CAMERA
    if (sameState(state, next)) return
    state = next
    setState(next)
  }

  const publishStats = () => {
    if (disposed) return
    const first = times[0]
    const last = times[times.length - 1]
    const next: PoseCameraStats = {
      fps:
        first !== undefined && last !== undefined && last > first
          ? ((times.length - 1) * 1000) / (last - first)
          : 0,
      msP50: median(durations),
      light,
      frames,
      detected,
      delegate: engine?.delegate ?? null,
    }
    if (sameStats(stats, next)) return
    stats = next
    setStats(next)
  }

  const resetStats = () => {
    frames = 0
    detected = 0
    durations = []
    times = []
    light = null
    lightAt = Number.NEGATIVE_INFINITY
    statsAt = Number.NEGATIVE_INFINITY
    publishStats()
  }

  const clearOverlay = () => {
    const overlay = overlayRef.current
    if (overlay) paintOverlay(overlay, null, latest.current.joints)
  }

  const closeEngine = () => {
    engineToken++
    engineLoading = false
    const closing = engine
    engine = null
    try {
      closing?.close()
    } catch {
      // Moteur déjà hors d'usage : rien à libérer.
    }
  }

  const stopCamera = () => {
    cameraToken++
    cameraStarting = false
    loop?.stop()
    loop = null
    unwatchTracks()
    stopStream(stream, shownIn ?? videoRef.current)
    stream = null
    shownIn = null
    times = []
    clearOverlay()
  }

  /** Plus rien ne tourne jusqu'à « Réessayer ». */
  const halt = (problem: PoseCameraProblem, { keepEngine = false } = {}) => {
    halted = problem
    stopCamera()
    if (!keepEngine) closeEngine()
    report()
    publishStats()
  }

  /** La caméra s'est coupée pendant qu'elle était demandée : tout s'arrête, puis on prévient. */
  const interrupt = ({ keepEngine }: { keepEngine: boolean }) => {
    if (disposed) return
    if (halted) {
      // Problème déjà affiché : on libère seulement le moteur.
      if (!keepEngine) closeEngine()
      publishStats()
      return
    }
    halt('stopped', { keepEngine })
    latest.current.onHidden()
  }

  const handleFrame = (frame: PoseFrame, ms: number) => {
    frames++
    if (frame.image) detected++
    durations.push(ms)
    if (durations.length > DURATIONS_KEPT) durations.shift()
    times.push(frame.t)
    while ((times[0] ?? frame.t) <= frame.t - 1000) times.shift()
    const video = shownIn
    if (video && frame.t - lightAt >= LIGHT_EVERY_MS) {
      lightAt = frame.t
      light = sampleLight(video, lightCanvas)
    }
    latest.current.onFrame(frame, light)
    const overlay = overlayRef.current
    if (overlay) paintOverlay(overlay, frame, latest.current.joints)
    if (frame.t - statsAt >= STATS_EVERY_MS) {
      statsAt = frame.t
      publishStats()
    }
  }

  const crash = (error: unknown) => {
    if (disposed) return
    console.warn('Compteur caméra : l’analyse de l’image a échoué', error)
    loop = null
    halt('crashed')
  }

  const startLoop = (video: HTMLVideoElement, current: PoseEngine) => {
    loop = startFrameLoop({
      video,
      engine: current,
      onFrame: handleFrame,
      onError: crash,
      scheduler: latest.current.deps?.scheduler ?? videoFrameScheduler,
    })
    if (!analysing) loop.pause()
  }

  /** Une piste qui se termine d'elle-même (caméra prise par un appel, coupée par l'iPhone). */
  const watchTracks = (opened: MediaStream) => {
    const tracks = opened.getVideoTracks().filter((track) => typeof track.addEventListener === 'function')
    const ended = () => {
      interrupt({ keepEngine: true })
    }
    for (const track of tracks) track.addEventListener('ended', ended)
    unwatchTracks = () => {
      for (const track of tracks) track.removeEventListener('ended', ended)
      unwatchTracks = () => undefined
    }
  }

  const startCamera = (current: PoseEngine) => {
    const token = ++cameraToken
    cameraStarting = true
    resetStats()
    report()
    const open = latest.current.deps?.openCamera ?? openCamera
    const stale = () => disposed || token !== cameraToken
    void (async () => {
      let opened: MediaStream
      try {
        opened = await open(wanted.facing)
      } catch (error) {
        if (stale()) return
        cameraStarting = false
        halt(cameraProblem(error), { keepEngine: true })
        return
      }
      if (stale()) {
        stopStream(opened)
        return
      }
      stream = opened
      const video = videoRef.current
      if (!video) {
        halt('error', { keepEngine: true })
        return
      }
      shownIn = video
      video.srcObject = opened
      watchTracks(opened)
      await video.play().catch(() => undefined)
      // Arrêtée pendant ce temps : celui qui l'a arrêtée a déjà coupé le flux.
      if (stale()) return
      cameraStarting = false
      startLoop(video, current)
      report()
    })()
  }

  const loadEngine = () => {
    const token = ++engineToken
    engineLoading = true
    report()
    const open = latest.current.deps?.openEngine ?? openPoseEngine
    void (async () => {
      let loaded: PoseEngine
      try {
        loaded = await open({ delegate: latest.current.delegate })
      } catch (error) {
        if (disposed || token !== engineToken) return
        engineLoading = false
        halt(error instanceof PoseEngineError ? error.problem : 'load')
        return
      }
      if (disposed || token !== engineToken) {
        loaded.close()
        return
      }
      engineLoading = false
      engine = loaded
      publishStats()
      advance()
    })()
  }

  /** Rapproche ce qui tourne de ce qui est demandé : moteur d'abord, caméra ensuite. */
  const advance = () => {
    if (disposed || halted) return
    if (!engine) {
      if (!engineLoading) loadEngine()
      return
    }
    if (wanted.camera && !stream && !cameraStarting) startCamera(engine)
    report()
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (wanted.camera) interrupt({ keepEngine: false })
      else {
        // Pas de caméra : le moteur est seulement libéré, puis rechargé au retour.
        closeEngine()
        report()
        publishStats()
      }
      return
    }
    advance()
  }
  document.addEventListener('visibilitychange', onVisibility)

  advance()

  return {
    want(cameraOn, facing) {
      const turned = facing !== wanted.facing
      wanted = { camera: cameraOn, facing }
      if (disposed || halted) return
      if (!cameraOn) {
        stopCamera()
        report()
        publishStats()
        return
      }
      // Changer de caméra : seul le flux repart, le moteur reste.
      if (turned && (stream || cameraStarting)) stopCamera()
      advance()
    },
    analyse(on) {
      analysing = on
      if (!loop) return
      if (on) {
        loop.resume()
        return
      }
      loop.pause()
      times = []
      clearOverlay()
      publishStats()
    },
    retry() {
      if (disposed) return
      halted = null
      advance()
    },
    dispose() {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibility)
      stopCamera()
      closeEngine()
    },
  }
}

export function usePoseCamera(options: PoseCameraOptions): PoseCamera {
  const { open, cameraOn, analysing, facing } = options
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })
  const [state, setState] = useState<PoseCameraState>(IDLE)
  const [stats, setStats] = useState<PoseCameraStats>(NO_POSE_STATS)
  const controllerRef = useRef<PoseCameraController | null>(null)

  useEffect(() => {
    if (!open) return
    const controller = createController({ videoRef, overlayRef, latest, setState, setStats })
    controllerRef.current = controller
    return () => {
      controller.dispose()
      controllerRef.current = null
      setState(IDLE)
      setStats(NO_POSE_STATS)
    }
  }, [open])

  useEffect(() => {
    controllerRef.current?.want(cameraOn, facing)
  }, [open, cameraOn, facing])

  useEffect(() => {
    controllerRef.current?.analyse(analysing)
  }, [open, analysing])

  const retry = useCallback(() => {
    controllerRef.current?.retry()
  }, [])

  return { videoRef, overlayRef, state, stats, retry }
}
