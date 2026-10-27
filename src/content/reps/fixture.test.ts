import {
  decimate,
  decodeFixture,
  encodeFixture,
  encodeFrame,
  FIXTURE_JOINTS,
  POSE_POINTS,
  repFixtureSchema,
  type FixtureMeta,
  type RepFixture,
} from './fixture'
import type { ImagePoint, PoseFrame, WorldPoint } from './types'

const META: FixtureMeta = {
  name: 'essai-squat',
  movement: 'squat',
  exerciseId: 'squat',
  kind: 'set',
  expected: { reps: 3, confident: true },
  split: 'tune',
  source: 'Squelette fabriqué pour le test',
  licence: 'MIT',
  estimator: 'test',
  fps: 15,
  width: 480,
  height: 640,
}

/** Une image où chaque point a des valeurs différentes (et pas rondes). */
function frameAt(t: number, seen = true): PoseFrame {
  const image = Array.from({ length: POSE_POINTS }, (_, i): ImagePoint => [
    0.1 + i * 0.0213,
    0.9 - i * 0.0171,
    (i % 10) / 10 + 0.0004,
  ])
  const world = Array.from({ length: POSE_POINTS }, (_, i): WorldPoint => [
    -0.4 + i * 0.0251,
    0.3 - i * 0.0187,
    0.05 * i - 0.6,
  ])
  return { t, width: 480, height: 640, image: seen ? image : null, world: seen ? world : null }
}

/** Au millième près : l'arrondi s'écarte d'au plus un demi-millième. */
function expectThousandth(actual: number | undefined, expected: number): void {
  expect(Math.abs((actual ?? Number.NaN) - expected)).toBeLessThanOrEqual(0.0005 + 1e-9)
}

/** Des images à `fps` par seconde pendant `ms` millisecondes, temps arrondis à la milliseconde. */
function framesAt(fps: number, ms: number): PoseFrame[] {
  return Array.from({ length: Math.floor((ms * fps) / 1000) + 1 }, (_, i) =>
    frameAt(Math.round((i * 1000) / fps)),
  )
}

describe('fichiers de points', () => {
  it('gardent les points utiles au millième près', () => {
    const original = frameAt(1234.4)
    const [decoded] = decodeFixture(encodeFixture(META, [original]))
    expect(decoded?.t).toBe(1234)
    expect([decoded?.width, decoded?.height]).toEqual([480, 640])
    expect(decoded?.image).toHaveLength(POSE_POINTS)
    expect(decoded?.world).toHaveLength(POSE_POINTS)
    for (const joint of FIXTURE_JOINTS) {
      original.image![joint]!.forEach((value, i) => {
        expectThousandth(decoded?.image?.[joint]?.[i], value)
      })
      original.world![joint]!.forEach((value, i) => {
        expectThousandth(decoded?.world?.[joint]?.[i], value)
      })
    }
  })

  it('écrit des entiers, et 0 quand personne n’est vu', () => {
    const [t, image, world] = encodeFrame(frameAt(10))
    expect(t).toBe(10)
    expect(image).toHaveLength(FIXTURE_JOINTS.length * 3)
    expect(world).toHaveLength(FIXTURE_JOINTS.length * 3)
    expect([...(image || []), ...(world || [])].every(Number.isInteger)).toBe(true)
    expect(encodeFrame(frameAt(20, false))).toEqual([20, 0, 0])
    expect(decodeFixture(encodeFixture(META, [frameAt(20, false)]))).toEqual([
      { t: 20, width: 480, height: 640, image: null, world: null },
    ])
  })

  it('rend invisibles les points absents du fichier', () => {
    const fixture = encodeFixture(META, [frameAt(0)], [11, 12])
    expect(fixture.joints).toEqual([11, 12])
    const [frame] = decodeFixture(fixture)
    expect(frame?.image?.[0]).toEqual([0, 0, 0])
    expect(frame?.world?.[25]).toEqual([0, 0, 0])
    expect(frame?.image?.[11]?.[2]).toBeCloseTo(0.1, 3)
    // Un point qui manque à l'image d'origine devient lui aussi invisible.
    const partial: PoseFrame = { ...frameAt(0), image: frameAt(0).image!.slice(0, 12) }
    const [x, y, v] = partial.image![11]!
    expect(encodeFrame(partial, [11, 12])[1]).toEqual([
      Math.round(x * 1000),
      Math.round(y * 1000),
      Math.round(v * 1000),
      0,
      0,
      0,
    ])
  })

  it('écrit un fichier valable, champs dans l’ordre, sans note vide', () => {
    const fixture = encodeFixture(META, framesAt(15, 1000))
    expect(repFixtureSchema.parse(fixture)).toEqual(fixture)
    expect(Object.keys(fixture)).toEqual([
      'format',
      'name',
      'movement',
      'exerciseId',
      'kind',
      'expected',
      'split',
      'source',
      'licence',
      'estimator',
      'fps',
      'width',
      'height',
      'joints',
      'frames',
    ])
    expect(fixture.frames).toHaveLength(16)
    const noted = encodeFixture({ ...META, notes: 'Début coupé' }, [])
    expect(noted.notes).toBe('Début coupé')
    expect(Object.keys(noted).indexOf('notes')).toBe(Object.keys(noted).indexOf('estimator') + 1)
  })

  it('refuse un fichier mal formé', () => {
    const good: RepFixture = encodeFixture(META, framesAt(15, 200))
    const negative: RepFixture = {
      ...good,
      movement: null,
      exerciseId: null,
      kind: 'negative',
      expected: { reps: 0 },
    }
    expect(repFixtureSchema.safeParse(good).success).toBe(true)
    expect(repFixtureSchema.safeParse(negative).success).toBe(true)
    const bad: unknown[] = [
      { ...good, format: 2 },
      { ...good, expected: { reps: 3, tolerance: 1 } },
      { ...good, expected: { reps: -1 } },
      { ...good, movement: 'row' },
      { ...good, joints: [11, 11] },
      { ...good, joints: [33] },
      { ...good, frames: [good.frames[1], good.frames[0]] },
      { ...good, frames: [[0, [1, 2], 0]] },
      { ...good, frames: [[0, 0, [1.5, 2, 3]]] },
      { ...good, credit: 'en trop' },
      { ...negative, expected: { reps: 2 } },
      { ...negative, movement: 'squat' },
      { ...good, movement: null },
      { ...good, width: 0 },
    ]
    for (const file of bad)
      expect(repFixtureSchema.safeParse(file).success, JSON.stringify(file).slice(0, 80)).toBe(false)
  })
})

describe('decimate', () => {
  it('passe de 30 à 15 puis 8 images par seconde en gardant la première', () => {
    const at30 = framesAt(30, 2000)
    const at15 = decimate(at30, 15)
    expect(at15[0]).toBe(at30[0])
    expect(at15.map((f) => f.t).slice(0, 5)).toEqual([0, 67, 133, 200, 267])
    expect(at15).toHaveLength(31)
    const at8 = decimate(at15, 8)
    expect(at8[0]).toBe(at30[0])
    expect(at8).toHaveLength(17)
    expect(at8.at(-1)?.t).toBe(2000)
    // Jamais plus vite que la source, et 8 par seconde en moyenne.
    const gaps = at8.slice(1).map((f, i) => f.t - at8[i]!.t)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(66)
    expect((at8.length - 1) / 2).toBe(8)
  })

  it('garde tout quand la source est déjà plus lente', () => {
    const at10 = framesAt(10, 1000)
    expect(decimate(at10, 15)).toEqual(at10)
    expect(decimate([], 8)).toEqual([])
  })

  it('se recale après un trou', () => {
    const frames = [0, 125, 1500, 1567, 1625, 1750].map((t) => frameAt(t))
    expect(decimate(frames, 8).map((f) => f.t)).toEqual([0, 125, 1500, 1625, 1750])
  })
})
