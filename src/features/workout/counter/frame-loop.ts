import type { PoseFrame } from '@/content/reps/types'
import type { PoseEngine } from './pose-engine'

/*
 * La boucle d'analyse du compteur : à chaque nouvelle image de la caméra, au plus `maxFps` fois par seconde et
 * jamais plus de la moitié du temps (intervalle d'au moins deux fois la durée moyenne d'une analyse), le moteur
 * analyse l'image affichée. Une seule analyse à la fois : elle est synchrone.
 */

/** Demande d'être rappelé à la prochaine image de la vidéo ; rend de quoi annuler. */
export interface FrameScheduler {
  request(video: HTMLVideoElement, callback: () => void): () => void
}

/** Sans rappel par image ni requestAnimationFrame : une image toutes les 33 ms (30 par seconde). */
const TIMEOUT_MS = 33

/**
 * L'image suivante de la vidéo : requestVideoFrameCallback (Safari 15.4 et plus, Chromium), sinon
 * requestAnimationFrame quand l'image a changé, sinon une minuterie.
 */
export const videoFrameScheduler: FrameScheduler = {
  request(video, callback) {
    if (typeof video.requestVideoFrameCallback === 'function') {
      const handle = video.requestVideoFrameCallback(() => {
        callback()
      })
      return () => {
        video.cancelVideoFrameCallback(handle)
      }
    }
    if (typeof requestAnimationFrame === 'function') {
      const shown = video.currentTime
      let handle = 0
      const check = () => {
        // Même image qu'à la demande (vidéo en pause, image pas encore arrivée) : on attend la suivante.
        if (video.currentTime === shown) handle = requestAnimationFrame(check)
        else callback()
      }
      handle = requestAnimationFrame(check)
      return () => {
        cancelAnimationFrame(handle)
      }
    }
    const timer = setTimeout(callback, TIMEOUT_MS)
    return () => {
      clearTimeout(timer)
    }
  },
}

/** Images analysées par seconde, au plus. */
export const MAX_FPS = 15
/**
 * Tolérance sur le plafond d'images : une caméra à 30 images par seconde en livre une toutes les 33,3 ms, à
 * quelques millisecondes près ; sans elle, une image sur trois seulement passerait (10 par seconde au lieu de 15).
 */
export const FRAME_SLACK_MS = 8
/** Poids de la dernière analyse dans la durée moyenne (moyenne glissante). */
const EMA_WEIGHT = 0.2

export interface FrameLoopOptions {
  readonly video: HTMLVideoElement
  readonly engine: PoseEngine
  /** Chaque image analysée, avec la durée de l'analyse en millisecondes. */
  readonly onFrame: (frame: PoseFrame, ms: number) => void
  /** L'analyse (ou ce qui suit) a échoué : la boucle est déjà arrêtée. */
  readonly onError: (error: unknown) => void
  readonly maxFps?: number
  readonly scheduler?: FrameScheduler
  /** Horloge en millisecondes (performance.now par défaut). */
  readonly now?: () => number
}

export interface FrameLoop {
  /** Arrête pour de bon. */
  stop(): void
  /** Plus d'analyse (repos, résultat) ; la caméra reste allumée. */
  pause(): void
  resume(): void
}

/**
 * Lance la boucle. Le temps donné au moteur est celui de l'horloge, en millisecondes entières, strictement
 * croissant, pauses comprises (le mode VIDEO de MediaPipe l'exige).
 */
export function startFrameLoop({
  video,
  engine,
  onFrame,
  onError,
  maxFps = MAX_FPS,
  scheduler = videoFrameScheduler,
  now = () => performance.now(),
}: FrameLoopOptions): FrameLoop {
  let stopped = false
  let paused = false
  let cancel: (() => void) | null = null
  let lastRun = Number.NEGATIVE_INFINITY
  let lastT = Number.NEGATIVE_INFINITY
  let meanMs: number | null = null

  const schedule = () => {
    if (stopped || paused || cancel) return
    cancel = scheduler.request(video, run)
  }

  const halt = () => {
    stopped = true
    cancel?.()
    cancel = null
  }

  function run() {
    cancel = null
    if (stopped || paused) return
    const start = now()
    const interval = Math.max(1000 / maxFps - FRAME_SLACK_MS, 2 * (meanMs ?? 0))
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || start - lastRun < interval) {
      schedule()
      return
    }
    lastRun = start
    const t = Math.max(lastT + 1, Math.round(start))
    lastT = t
    try {
      const frame = engine.detect(video, t)
      const ms = Math.max(0, now() - start)
      meanMs = meanMs === null ? ms : meanMs + EMA_WEIGHT * (ms - meanMs)
      onFrame(frame, ms)
    } catch (error) {
      halt()
      onError(error)
      return
    }
    schedule()
  }

  schedule()
  return {
    stop: halt,
    pause() {
      paused = true
      cancel?.()
      cancel = null
    },
    resume() {
      if (!paused) return
      paused = false
      schedule()
    },
  }
}
