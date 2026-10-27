import {
  encodeFrame,
  FIXTURE_JOINTS,
  type FixtureFrame,
  type FixtureMeta,
  type RepFixture,
} from '@/content/reps/fixture'
import type { PoseFrame } from '@/content/reps/types'

/** Ce que le compteur garde de la série en cours : ses points, jamais d'image, pour « Exporter les points ». */
export interface PoseRecorder {
  /** Ajoute une image analysée (codée tout de suite, 13 points) ; oublie celles de plus de `maxMs`. */
  add(frame: PoseFrame): void
  /** Oublie tout (série suivante). */
  clear(): void
  /** Les images gardées, en fichier de points. */
  toFixture(meta: FixtureMeta): RepFixture
}

/** Trois minutes au plus : au-delà, les plus anciennes images sont oubliées. */
export const RECORDER_MAX_MS = 180_000

export function createRecorder(maxMs: number = RECORDER_MAX_MS): PoseRecorder {
  let frames: FixtureFrame[] = []
  return {
    add(frame) {
      frames.push(encodeFrame(frame, FIXTURE_JOINTS))
      const last = frames[frames.length - 1]?.[0] ?? 0
      const first = frames.findIndex(([t]) => last - t <= maxMs)
      if (first > 0) frames = frames.slice(first)
    },
    clear() {
      frames = []
    },
    toFixture(meta) {
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
        joints: [...FIXTURE_JOINTS],
        frames: [...frames],
      }
    },
  }
}
