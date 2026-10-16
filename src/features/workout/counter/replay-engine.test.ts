import { encodeFixture, type FixtureMeta } from '@/content/reps/fixture'
import type { ImagePoint, PoseFrame } from '@/content/reps/types'
import { createReplayEngine } from './replay-engine'

const META: FixtureMeta = {
  name: 'rejeu',
  movement: 'squat',
  exerciseId: 'squat',
  kind: 'set',
  expected: { reps: 0 },
  split: 'check',
  source: 'test',
  licence: 'MIT',
  estimator: 'test',
  fps: 10,
  width: 480,
  height: 640,
}

/** Une image dont le nez est à la hauteur `y` (pour reconnaître l'image rendue). */
function frameWithNose(t: number, y: number): PoseFrame {
  const image = Array.from({ length: 33 }, (): ImagePoint => [0.5, y, 0.9])
  return { t, width: 480, height: 640, image, world: null }
}

const canvas = document.createElement('canvas')

/** La hauteur du nez de l'image rendue, ou null si personne. */
function noseOf(frame: PoseFrame): number | null {
  return frame.image?.[0]?.[1] ?? null
}

describe('createReplayEngine', () => {
  // Fichier qui commence à 1000 ms : seul compte le temps écoulé depuis sa première image.
  const fixture = encodeFixture(META, [
    frameWithNose(1000, 0.1),
    frameWithNose(1100, 0.2),
    { t: 1200, width: 480, height: 640, image: null, world: null },
    frameWithNose(1300, 0.4),
  ])

  it('rend l’image du fichier au temps écoulé depuis la première analyse, puis garde la dernière', () => {
    const engine = createReplayEngine(fixture)
    expect(engine.delegate).toBe('CPU')
    expect(noseOf(engine.detect(canvas, 5000))).toBe(0.1)
    expect(noseOf(engine.detect(canvas, 5099))).toBe(0.1)
    expect(noseOf(engine.detect(canvas, 5100))).toBe(0.2)
    expect(noseOf(engine.detect(canvas, 5250))).toBeNull()
    expect(noseOf(engine.detect(canvas, 5300))).toBe(0.4)
    expect(noseOf(engine.detect(canvas, 9000))).toBe(0.4)
  })

  it('rend des temps strictement croissants et la taille du fichier', () => {
    const engine = createReplayEngine(fixture)
    expect(engine.detect(canvas, 20)).toMatchObject({ t: 20, width: 480, height: 640 })
    expect(engine.detect(canvas, 20).t).toBe(21)
    expect(engine.detect(canvas, 10.6).t).toBe(22)
  })

  it('rend personne pour un fichier vide, et refuse d’analyser une fois fermé', () => {
    const engine = createReplayEngine(encodeFixture(META, []))
    expect(engine.detect(canvas, 1)).toEqual({ t: 1, width: 480, height: 640, image: null, world: null })
    engine.close()
    engine.close()
    expect(() => engine.detect(canvas, 2)).toThrow()
  })
})
