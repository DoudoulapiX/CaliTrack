import type { PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import loaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'
import wasmUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import modelUrl from '@/assets/pose/pose_landmarker_lite.task?url'
import { repFixtureSchema } from '@/content/reps/fixture'
import type { ImagePoint, PoseFrame, WorldPoint } from '@/content/reps/types'
import { createReplayEngine } from './replay-engine'

/*
 * Le moteur de squelette : MediaPipe Pose Landmarker (modèle « lite »), qui tourne sur le téléphone. Le
 * chargeur, le WebAssembly et le modèle sont servis par l'appli elle-même (et pré-cachés) : aucune image ni
 * aucune requête ne part ailleurs. La bibliothèque est chargée à la demande, dans son propre morceau.
 */

/** Calcul sur le processeur (par défaut) ou sur la puce graphique (essai). */
export type Delegate = 'CPU' | 'GPU'

export interface PoseEngine {
  readonly delegate: Delegate
  /** Analyse l'image affichée ; `t` (ms) est rendu strictement croissant ici. */
  detect(source: HTMLVideoElement | HTMLCanvasElement, t: number): PoseFrame
  /** Libère le moteur ; sans effet la seconde fois. */
  close(): void
}

/** 'unsupported' : téléphone trop ancien (pas de WebAssembly SIMD, iOS < 16.4) ; 'load' : pas chargé. */
export type PoseEngineProblem = 'unsupported' | 'load'

export class PoseEngineError extends Error {
  readonly problem: PoseEngineProblem

  constructor(problem: PoseEngineProblem, options?: ErrorOptions) {
    super(
      problem === 'unsupported'
        ? 'Ce téléphone ne peut pas faire tourner le moteur de squelette'
        : 'Le moteur de squelette n’a pas pu être chargé',
      options,
    )
    this.name = 'PoseEngineError'
    this.problem = problem
  }
}

/** Une seule personne suivie, seuils de confiance par défaut de MediaPipe. */
export const POSE_OPTIONS = {
  numPoses: 1,
  minPoseDetectionConfidence: 0.5,
  minPosePresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
} as const

/**
 * Le WebAssembly écrit « INFO: Created TensorFlow Lite XNNPACK delegate for CPU. » dans console.error : on le
 * fait taire, et le reste passe en console.warn. Le chargeur lit `Module` une fois puis l'efface : à poser avant
 * chaque création.
 */
function quietWasmConsole(): void {
  ;(globalThis as { Module?: unknown }).Module = {
    print: () => undefined,
    printErr: (text: string) => {
      if (!text.startsWith('INFO:')) console.warn(text)
    },
  }
}

/** Une image noire, pour la première analyse (la plus lente) avant que la caméra ne tourne. */
function blankCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  canvas.getContext('2d')?.fillRect(0, 0, size, size)
  return canvas
}

const visibilityOf = (value: number) => (Number.isFinite(value) ? value : 0)

/** Le résultat de MediaPipe en image analysée (la première personne trouvée, ou personne). */
export function toPoseFrame(
  result: Pick<PoseLandmarkerResult, 'landmarks' | 'worldLandmarks'>,
  t: number,
  width: number,
  height: number,
): PoseFrame {
  const image = result.landmarks[0]
  const world = result.worldLandmarks[0]
  return {
    t,
    width,
    height,
    image: image ? image.map((p): ImagePoint => [p.x, p.y, visibilityOf(p.visibility)]) : null,
    world: world ? world.map((p): WorldPoint => [p.x, p.y, p.z]) : null,
  }
}

/** Le moteur autour de MediaPipe : temps croissants, taille de l'image, fermeture une seule fois. */
function wrapLandmarker(landmarker: PoseLandmarker, delegate: Delegate): PoseEngine {
  let last = Number.NEGATIVE_INFINITY
  let closed = false
  return {
    delegate,
    detect(source, t) {
      if (closed) throw new Error('Moteur de squelette fermé')
      const at = Math.max(Math.round(t), last + 1)
      last = at
      const width = 'videoWidth' in source ? source.videoWidth : source.width
      const height = 'videoHeight' in source ? source.videoHeight : source.height
      return toPoseFrame(landmarker.detectForVideo(source, at), at, width, height)
    },
    close() {
      if (closed) return
      closed = true
      landmarker.close()
    },
  }
}

/** Charge MediaPipe et crée le moteur ; sur la puce graphique, repasse au processeur en cas d'échec. */
export async function loadPoseEngine({
  delegate = 'CPU',
}: { delegate?: Delegate } = {}): Promise<PoseEngine> {
  let vision: typeof import('@mediapipe/tasks-vision')
  let simd: boolean
  try {
    vision = await import('@mediapipe/tasks-vision')
    simd = await vision.FilesetResolver.isSimdSupported()
  } catch (error) {
    throw new PoseEngineError('load', { cause: error })
  }
  if (!simd) throw new PoseEngineError('unsupported')
  let landmarker: PoseLandmarker | null = null
  try {
    quietWasmConsole()
    landmarker = await vision.PoseLandmarker.createFromOptions(
      { wasmLoaderPath: loaderUrl, wasmBinaryPath: wasmUrl },
      {
        baseOptions: { modelAssetPath: modelUrl, delegate },
        runningMode: 'VIDEO',
        outputSegmentationMasks: false,
        // Toujours un vrai canvas : sans WebGL dans OffscreenCanvas (WebKit), la première image échoue.
        canvas: document.createElement('canvas'),
        ...POSE_OPTIONS,
      },
    )
    const engine = wrapLandmarker(landmarker, delegate)
    // Première analyse à blanc : elle absorbe la lenteur du premier passage.
    engine.detect(blankCanvas(64), 0)
    return engine
  } catch (error) {
    try {
      landmarker?.close()
    } catch {
      // Déjà hors d'usage : rien à libérer.
    }
    if (delegate === 'GPU') return loadPoseEngine({ delegate: 'CPU' })
    throw new PoseEngineError('load', { cause: error })
  }
}

/**
 * Le moteur de l'appli. Les tests de bout en bout peuvent poser `window.__calitrackPoseReplay` (un fichier de
 * points) : le squelette est alors rejoué, sans MediaPipe. L'appli elle-même ne le pose jamais.
 */
export async function openPoseEngine(options: { delegate?: Delegate } = {}): Promise<PoseEngine> {
  const replay = (globalThis as { __calitrackPoseReplay?: unknown }).__calitrackPoseReplay
  if (replay === undefined) return loadPoseEngine(options)
  const parsed = repFixtureSchema.safeParse(replay)
  if (!parsed.success) throw new PoseEngineError('load', { cause: parsed.error })
  return createReplayEngine(parsed.data)
}
