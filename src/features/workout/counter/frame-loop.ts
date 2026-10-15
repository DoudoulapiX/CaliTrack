import type { PoseFrame } from '@/content/reps/types'
import type { PoseEngine } from './pose-engine'

/*
 * La boucle d'analyse du compteur : à chaque nouvelle image de la caméra, au plus `maxFps` fois par seconde et
 * jamais plus de la moitié du temps (une analyse toutes les deux fois sa durée moyenne, à peine plus), le moteur
 * analyse l'image affichée. Une seule analyse à la fois : elle est synchrone.
 *
 * Chaque analyse a son heure, un pas après l'heure de la précédente (pas après l'image qui l'a lancée) : avec une
 * caméra à 30 images par seconde et 60 ms d'analyse (le budget d'un iPhone), le pas de 121 ms donne 8,3 analyses
 * par seconde en moyenne (une image sur trois ou quatre), et non 7,5 (une sur quatre), sous les 8 qu'il faut au
 * compteur pour être sûr de lui (COUNTER_PARAMS.minFps).
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
 * quelques millisecondes près ; sans elle, une image arrivée un peu tôt attendrait la suivante. Jamais quand le pas
 * vient de la durée des analyses : la moitié du temps reste un plafond.
 */
export const FRAME_SLACK_MS = 8
/**
 * Repos ajouté à chaque pas qui vient de la durée des analyses : calées sur leur heure (l'attente d'une image ne
 * s'ajoute pas au pas), elles prendraient tout juste la moitié du temps, un peu plus à la fin de l'une d'elles.
 */
const BUSY_MARGIN_MS = 1
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
  /** Heure de la prochaine analyse, et l'avance tolérée sur elle. */
  let due = Number.NEGATIVE_INFINITY
  let early = 0
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
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || start < due - early) {
      schedule()
      return
    }
    const t = Math.max(lastT + 1, Math.round(start))
    lastT = t
    try {
      const frame = engine.detect(video, t)
      const ms = Math.max(0, now() - start)
      meanMs = meanMs === null ? ms : meanMs + EMA_WEIGHT * (ms - meanMs)
      // Le pas suit la durée moyenne, cette analyse comprise. Un pas après l'heure prévue ; repart de maintenant
      // après une pause ou une analyse très lente.
      const cap = 1000 / maxFps
      const step = Math.max(cap, 2 * meanMs + BUSY_MARGIN_MS)
      early = step > cap ? 0 : FRAME_SLACK_MS
      due = due + step > start ? due + step : start + step
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
