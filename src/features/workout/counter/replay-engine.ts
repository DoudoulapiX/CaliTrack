import { decodeFixture, type RepFixture } from '@/content/reps/fixture'
import type { PoseEngine } from './pose-engine'

/**
 * Un moteur qui rejoue un fichier de points en temps réel (tests de bout en bout, sans MediaPipe) : à chaque
 * analyse, l'image du fichier au temps écoulé depuis la première analyse ; la dernière reste ensuite.
 */
export function createReplayEngine(fixture: RepFixture): PoseEngine {
  const frames = decodeFixture(fixture)
  const origin = frames[0]?.t ?? 0
  let start: number | null = null
  let last = Number.NEGATIVE_INFINITY
  let index = 0
  let closed = false
  return {
    delegate: 'CPU',
    detect(_source, t) {
      if (closed) throw new Error('Moteur de squelette fermé')
      const at = Math.max(Math.round(t), last + 1)
      last = at
      start ??= at
      const elapsed = at - start
      while (index + 1 < frames.length && (frames[index + 1]?.t ?? Infinity) - origin <= elapsed) index++
      const frame = frames[index]
      return frame
        ? { ...frame, t: at }
        : { t: at, width: fixture.width, height: fixture.height, image: null, world: null }
    },
    close() {
      closed = true
    },
  }
}
