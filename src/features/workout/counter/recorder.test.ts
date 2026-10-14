import { decodeFixture, encodeFixture, repFixtureSchema, type FixtureMeta } from '@/content/reps/fixture'
import type { PoseFrame } from '@/content/reps/types'
import { emptyFrame } from '@/test/pose'
import { createRecorder, RECORDER_MAX_MS } from './recorder'

const META: FixtureMeta = {
  name: 'calitrack-points-squat',
  movement: 'squat',
  exerciseId: 'squat',
  kind: 'set',
  expected: { reps: 2 },
  split: 'check',
  source: 'Compteur caméra de CaliTrack',
  licence: 'Charles, avec son accord',
  estimator: 'mediapipe-0.10.35-lite-cpu',
  fps: 15,
  width: 640,
  height: 480,
}

/** Une image où quelqu'un est vu : tous les points au même endroit, bien visibles. */
function seenFrame(t: number): PoseFrame {
  return {
    t,
    width: 640,
    height: 480,
    image: Array.from({ length: 33 }, () => [0.5, 0.25, 0.9] as const),
    world: Array.from({ length: 33 }, () => [0.1, -0.2, 0.3] as const),
  }
}

describe('enregistreur des points de la série', () => {
  it('rend un fichier de points valide, avec les images vues et les images vides', () => {
    const recorder = createRecorder()
    recorder.add(seenFrame(0))
    recorder.add(emptyFrame(67))
    recorder.add(seenFrame(133))
    const fixture = recorder.toFixture(META)

    expect(repFixtureSchema.safeParse(fixture).success).toBe(true)
    expect(fixture.frames.map(([t]) => t)).toEqual([0, 67, 133])
    expect(fixture.frames[1]?.[1]).toBe(0)
    // Les mêmes nombres que le codage d'un fichier complet.
    expect(fixture).toEqual(encodeFixture(META, [seenFrame(0), emptyFrame(67), seenFrame(133)]))
    const [first] = decodeFixture(fixture)
    expect(first?.image?.[11]).toEqual([0.5, 0.25, 0.9])
  })

  it('garde les notes quand il y en a', () => {
    const recorder = createRecorder()
    recorder.add(seenFrame(0))
    expect(recorder.toFixture({ ...META, notes: 'Série comptée 7, faite 8' }).notes).toBe(
      'Série comptée 7, faite 8',
    )
    expect(recorder.toFixture(META)).not.toHaveProperty('notes')
  })

  it('oublie les images de plus de trois minutes', () => {
    const recorder = createRecorder()
    for (let t = 0; t <= RECORDER_MAX_MS + 2000; t += 1000) recorder.add(seenFrame(t))
    const times = recorder.toFixture(META).frames.map(([t]) => t)
    expect(times[0]).toBe(2000)
    expect(times[times.length - 1]).toBe(RECORDER_MAX_MS + 2000)
    expect(times).toHaveLength(RECORDER_MAX_MS / 1000 + 1)
  })

  it('suit une durée choisie', () => {
    const recorder = createRecorder(1000)
    for (const t of [0, 400, 800, 1200, 1600]) recorder.add(seenFrame(t))
    expect(recorder.toFixture(META).frames.map(([t]) => t)).toEqual([800, 1200, 1600])
  })

  it('repart de zéro à la série suivante', () => {
    const recorder = createRecorder()
    recorder.add(seenFrame(0))
    recorder.clear()
    expect(recorder.toFixture(META).frames).toEqual([])
    recorder.add(seenFrame(5000))
    expect(recorder.toFixture(META).frames.map(([t]) => t)).toEqual([5000])
  })

  it('rend une copie : le fichier ne change pas quand la série continue', () => {
    const recorder = createRecorder()
    recorder.add(seenFrame(0))
    const fixture = recorder.toFixture(META)
    recorder.add(seenFrame(67))
    expect(fixture.frames).toHaveLength(1)
  })
})
