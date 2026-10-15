import { useCallback, useRef, type RefObject } from 'react'
import type { PoseFrame } from '@/content/reps/types'
import { openCamera, type CameraProblem, type Facing } from '@/lib/camera'
import type { FrameScheduler } from './frame-loop'
import { openPoseEngine, type Delegate, type PoseEngineProblem } from './pose-engine'

/*
 * La caméra et le moteur de squelette du compteur : le moteur se charge quand la feuille s'ouvre, la caméra
 * démarre sur un toucher, chaque image analysée part vers `onFrame`.
 * Version d'attente : rien ne démarre encore (état « idle »). La vraie version garde ces signatures.
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
  delegate: Delegate
  /** Points dessinés sur le squelette. */
  joints: readonly number[]
  onFrame: (frame: PoseFrame, light: number | null) => void
  /** L'appli est passée en arrière-plan : caméra et moteur déjà arrêtés. */
  onHidden: () => void
  deps?: PoseCameraDeps
}

export interface PoseCamera {
  videoRef: RefObject<HTMLVideoElement | null>
  overlayRef: RefObject<HTMLCanvasElement | null>
  state: PoseCameraState
  /** Mis à jour 4 fois par seconde. */
  stats: PoseCameraStats
  retry: () => void
}

const IDLE: PoseCameraState = { kind: 'idle' }

export const NO_POSE_STATS: PoseCameraStats = {
  fps: 0,
  msP50: null,
  light: null,
  frames: 0,
  detected: 0,
  delegate: null,
}

export function usePoseCamera(options: PoseCameraOptions): PoseCamera {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  // Rien ne démarre encore, mais les vraies dépendances restent reliées au compteur : l'appli embarque déjà
  // MediaPipe, son WebAssembly et son modèle (pré-cache vérifié par scripts/postbuild.mjs).
  useRef<PoseCameraDeps>({ openEngine: openPoseEngine, openCamera, ...options.deps })
  const retry = useCallback(() => undefined, [])
  return { videoRef, overlayRef, state: IDLE, stats: NO_POSE_STATS, retry }
}
