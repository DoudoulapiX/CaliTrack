/** Caméra, vidéo, moteur de squelette et compteur factices, pour tester le compteur caméra sans navigateur. */
import { act } from '@testing-library/react'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import { vi, type Mock } from 'vitest'
import type { RepCounter, RepCounterOptions } from '@/content/reps/rep-counter'
import type { CounterResult, CounterSnapshot, PoseFrame } from '@/content/reps/types'
import type { Delegate, PoseEngine } from '@/features/workout/counter/pose-engine'
import {
  NO_POSE_STATS,
  type PoseCamera,
  type PoseCameraOptions,
  type PoseCameraState,
  type PoseCameraStats,
} from '@/features/workout/counter/usePoseCamera'
import { stubProperty } from './stub'

/* ------------------------------------------------------------------ */
/* Caméra et vidéo                                                      */
/* ------------------------------------------------------------------ */

export interface FakeTrack {
  readonly kind: 'video'
  readyState: 'live' | 'ended'
  readonly stop: Mock<() => void>
}

export interface FakeMediaDevices {
  readonly getUserMedia: Mock<(constraints?: MediaStreamConstraints) => Promise<MediaStream>>
  /** Chaque piste donnée, dans l'ordre. */
  readonly tracks: readonly FakeTrack[]
  /** Au moins une caméra a été ouverte, et toutes sont arrêtées. */
  stopped(): boolean
  /** Retire la fausse caméra (à appeler après le test). */
  restore(): void
}

/**
 * Pose `navigator.mediaDevices` avec une caméra factice. `deny` : accès refusé (NotAllowedError) ; `none` :
 * pas de caméra (NotFoundError). Les `track.stop()` sont notés.
 */
export function fakeMediaDevices({ deny = false, none = false } = {}): FakeMediaDevices {
  const tracks: FakeTrack[] = []
  const getUserMedia = vi.fn((_constraints?: MediaStreamConstraints): Promise<MediaStream> => {
    if (deny) return Promise.reject(new DOMException('Accès refusé', 'NotAllowedError'))
    if (none) return Promise.reject(new DOMException('Pas de caméra', 'NotFoundError'))
    const track: FakeTrack = {
      kind: 'video',
      readyState: 'live',
      stop: vi.fn(() => {
        track.readyState = 'ended'
      }),
    }
    tracks.push(track)
    const stream = { id: `camera-${tracks.length}`, getTracks: () => [track], getVideoTracks: () => [track] }
    return Promise.resolve(stream as unknown as MediaStream)
  })
  stubProperty(navigator, 'mediaDevices', { getUserMedia })
  return {
    getUserMedia,
    tracks,
    stopped: () => tracks.length > 0 && tracks.every((track) => track.readyState === 'ended'),
    restore: () => {
      Reflect.deleteProperty(navigator, 'mediaDevices')
    },
  }
}

/**
 * Une vidéo qui joue tout de suite, avec une image prête de la taille voulue (jsdom ne lit pas de vidéo).
 * Les espions sont retirés après chaque test (restoreMocks).
 */
export function stubVideo({ width = 640, height = 480 } = {}): void {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(HTMLMediaElement.HAVE_ENOUGH_DATA)
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(width)
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(height)
}

/** Pas de dessin dans jsdom : `getContext` rend null, sans le message « Not implemented ». */
export function stubCanvas2d(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
}

export interface ManualScheduler {
  request(video: HTMLVideoElement, callback: () => void): () => void
  /** Fait passer une image : rappelle tout ce qui attendait ; rend le nombre de rappels. */
  step(): number
  /** Rappels en attente. */
  readonly pending: number
}

/** Une cadence d'images que le test fait avancer lui-même (à la place de requestVideoFrameCallback). */
export function manualScheduler(): ManualScheduler {
  let queue: (() => void)[] = []
  return {
    request(_video, callback) {
      const entry = () => {
        callback()
      }
      queue.push(entry)
      return () => {
        queue = queue.filter((other) => other !== entry)
      }
    },
    step() {
      const due = queue
      queue = []
      for (const callback of due) callback()
      return due.length
    },
    get pending() {
      return queue.length
    },
  }
}

/* ------------------------------------------------------------------ */
/* Moteur de squelette                                                  */
/* ------------------------------------------------------------------ */

/** Une image où personne n'est vu. */
export function emptyFrame(t: number, width = 640, height = 480): PoseFrame {
  return { t, width, height, image: null, world: null }
}

export interface FakePoseEngine {
  readonly engine: PoseEngine & {
    readonly detect: Mock<PoseEngine['detect']>
    readonly close: Mock<() => void>
  }
  /** À passer en `deps.openEngine`. */
  readonly openEngine: Mock<(options?: { delegate?: Delegate }) => Promise<PoseEngine>>
}

/** Un moteur qui rend ces images l'une après l'autre (la dernière reste), au temps demandé. */
export function fakePoseEngine(
  frames: readonly PoseFrame[] = [],
  delegate: Delegate = 'CPU',
): FakePoseEngine {
  let index = 0
  const engine = {
    delegate,
    detect: vi.fn((_source: HTMLVideoElement | HTMLCanvasElement, t: number): PoseFrame => {
      const frame = frames[Math.min(index, frames.length - 1)]
      index++
      return frame ? { ...frame, t } : emptyFrame(t)
    }),
    close: vi.fn(),
  }
  const openEngine = vi.fn((_options?: { delegate?: Delegate }) => Promise.resolve<PoseEngine>(engine))
  return { engine, openEngine }
}

/* ------------------------------------------------------------------ */
/* Compteur                                                             */
/* ------------------------------------------------------------------ */

export function counterSnapshot(patch: Partial<CounterSnapshot> = {}): CounterSnapshot {
  return {
    status: 'searching',
    reps: 0,
    partials: 0,
    hint: null,
    event: null,
    debug: {
      signal: null,
      flexed: 0,
      extended: 0,
      phase: 'unknown',
      side: null,
      visibility: 0,
      quality: 0,
      fps: 0,
      lastReject: null,
    },
    slow: false,
    ...patch,
  }
}

export function counterResult(patch: Partial<CounterResult> = {}): CounterResult {
  return {
    reps: 0,
    doubtful: 0,
    partials: 0,
    rejected: 0,
    confident: true,
    reasons: [],
    endedBy: 'idle',
    repTimes: [],
    ...patch,
  }
}

export interface FakeCounter {
  /** À mettre à la place de createRepCounter (vi.mock) : chaque appel repart d'un compteur neuf. */
  readonly createRepCounter: Mock<(options: RepCounterOptions) => RepCounter>
  /** Le dernier compteur créé. */
  readonly counter: RepCounter
  /** Les options de chaque compteur créé. */
  readonly created: readonly RepCounterOptions[]
  /** Les images reçues par le dernier compteur. */
  readonly pushed: readonly { readonly frame: PoseFrame; readonly light: number | null }[]
  /** Change ce que le compteur rendra à la prochaine image (reps, statut, consigne…). */
  emit(patch: Partial<CounterSnapshot>): void
  /** Termine la série de lui-même (fin automatique) avec ce résultat. */
  end(patch?: Partial<CounterResult>): void
  /** Résultat que rendra `finish()` (sinon : compte du moment, sûr sauf interruption). */
  onFinish(patch: Partial<CounterResult>): void
}

/** Un compteur piloté par le test : il rend ce qu'on lui dit, sans rien calculer. */
export function fakeCounter(): FakeCounter {
  let snapshot = counterSnapshot()
  let result: CounterResult | null = null
  let finishPatch: Partial<CounterResult> = {}
  const created: RepCounterOptions[] = []
  let pushed: { frame: PoseFrame; light: number | null }[] = []

  const counter: RepCounter = {
    push(frame, light = null) {
      pushed.push({ frame, light })
      return snapshot
    },
    tick() {
      return snapshot
    },
    finish(_t, why) {
      if (result) return result
      result = counterResult({
        reps: snapshot.reps,
        partials: snapshot.partials,
        endedBy: why,
        confident: why !== 'interrupted',
        reasons: why === 'interrupted' ? ['interrupted'] : [],
        ...finishPatch,
      })
      snapshot = { ...snapshot, status: 'ended' }
      return result
    },
    get result() {
      return result
    },
    get snapshot() {
      return snapshot
    },
  }

  const createRepCounter = vi.fn((options: RepCounterOptions) => {
    created.push(options)
    snapshot = counterSnapshot({ reps: options.offset ?? 0 })
    result = null
    finishPatch = {}
    pushed = []
    return counter
  })

  return {
    createRepCounter,
    counter,
    created,
    get pushed() {
      return pushed
    },
    emit(patch) {
      snapshot = { ...snapshot, ...patch }
    },
    end(patch = {}) {
      result = counterResult({ reps: snapshot.reps, partials: snapshot.partials, ...patch })
      snapshot = { ...snapshot, status: 'ended' }
    },
    onFinish(patch) {
      finishPatch = patch
    },
  }
}

/* ------------------------------------------------------------------ */
/* Caméra du compteur (usePoseCamera)                                    */
/* ------------------------------------------------------------------ */

export interface FakePoseCamera {
  /** À mettre à la place de usePoseCamera (vi.mock). */
  readonly usePoseCamera: (options: PoseCameraOptions) => PoseCamera
  /** Les options du dernier rendu (null avant le premier). */
  readonly options: PoseCameraOptions | null
  /** Nombre d'appuis sur « Réessayer ». */
  readonly retries: number
  setState(state: PoseCameraState): void
  setStats(patch: Partial<PoseCameraStats>): void
  /** Une image analysée, envoyée comme le ferait la caméra. */
  frame(frame: PoseFrame, light?: number | null): void
  /** L'appli passe en arrière-plan : caméra coupée, puis `onHidden`. */
  hide(): void
}

/** Une caméra de compteur pilotée par le test : état, statistiques et images à la demande. */
export function fakePoseCamera(): FakePoseCamera {
  let options: PoseCameraOptions | null = null
  let state: PoseCameraState = { kind: 'idle' }
  let stats: PoseCameraStats = NO_POSE_STATS
  let retries = 0
  let version = 0
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }
  const notify = () => {
    version++
    for (const listener of listeners) listener()
  }
  const retry = () => {
    retries++
  }
  const current = (): PoseCameraOptions => {
    if (!options) throw new Error('La caméra du compteur n’est pas affichée')
    return options
  }

  function useFakePoseCamera(next: PoseCameraOptions): PoseCamera {
    useSyncExternalStore(subscribe, () => version)
    const videoRef = useRef<HTMLVideoElement>(null)
    const overlayRef = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
      options = next
    })
    return { videoRef, overlayRef, state, stats, retry }
  }

  return {
    usePoseCamera: useFakePoseCamera,
    get options() {
      return options
    },
    get retries() {
      return retries
    },
    setState(next) {
      state = next
      act(notify)
    },
    setStats(patch) {
      stats = { ...stats, ...patch }
      act(notify)
    },
    frame(frame, light = null) {
      const { onFrame } = current()
      act(() => {
        onFrame(frame, light)
      })
    },
    hide() {
      const { onHidden } = current()
      state = { kind: 'problem', problem: 'stopped' }
      act(() => {
        notify()
        onHidden()
      })
    },
  }
}
