import { project, SYNTH_CAMERAS, synthPose, synthSet, type SynthCamera } from '@/test/pose-synth'
import {
  armLength,
  armOk,
  bodyPoint,
  chooseBestSide,
  jointSide,
  measureFrame,
  missingPart,
  pairPoint,
  postureOk,
  readBody,
  sidePoints,
  sideSignal,
  viewOk,
  type Body,
} from './features'
import { COUNTER_PARAMS, specFor } from './specs'
import type { CountedMovement, ImagePoint, PoseFrame, VariantOverrides } from './types'

const spec = (movement: CountedMovement, overrides: VariantOverrides = {}) => specFor({ movement, overrides })

/** La position à cet angle, cadrée comme dans les séries fabriquées (ou autrement). */
function pose(
  movement: CountedMovement,
  angle: number | readonly [number, number],
  camera: Partial<SynthCamera> = {},
  kneeling = false,
): PoseFrame {
  return project(synthPose(movement, angle, { kneeling }), 0, {
    camera: { ...SYNTH_CAMERAS[movement], ...camera },
  })
}

/** La même image avec quelques points changés. */
function edit(
  frame: PoseFrame,
  change: Readonly<Record<number, (point: ImagePoint) => ImagePoint>>,
): PoseFrame {
  return {
    ...frame,
    image: frame.image!.map((point, joint) => change[joint]?.(point) ?? point),
  }
}

const hide = (point: ImagePoint): ImagePoint => [point[0], point[1], 0.1]
const body = (frame: PoseFrame): Body => readBody(frame, COUNTER_PARAMS)!

describe('readBody', () => {
  it('ne voit personne sans points', () => {
    expect(readBody({ t: 0, width: 480, height: 640, image: null, world: null }, COUNTER_PARAMS)).toBeNull()
  })

  it('n’utilise que les points visibles, loin du bord, mesurés en pixels', () => {
    const frame = edit(pose('squat', 175), {
      11: hide,
      27: ([, y, v]) => [0.01, y, v],
    })
    const seen = body(frame)
    expect(seen.usable(11)).toBe(false)
    expect(seen.visibility(11)).toBe(0.1)
    expect(seen.usable(27)).toBe(false)
    expect(seen.usable(12)).toBe(true)
    expect(seen.pixel(12)).toEqual([frame.image![12]![0] * 480, frame.image![12]![1] * 640])
    // Une seule épaule : c'est elle qui sert de milieu.
    expect(seen.shoulder).toEqual(seen.pixel(12))
    // Buste mesuré depuis cette épaule, au milieu des hanches.
    expect(seen.torso).toBeCloseTo(Math.hypot(0.19 * 285, 0.5 * 285), 0)
    expect(seen.visibility(40)).toBe(0)
  })

  it('n’a pas de buste sans hanches', () => {
    const seen = body(edit(pose('squat', 175), { 23: hide, 24: hide }))
    expect(seen.hip).toBeNull()
    expect(seen.torso).toBeNaN()
  })
})

describe('points des deux côtés', () => {
  const seen = body(edit(pose('squat', 175), { 16: hide }))

  it('pairPoint : le côté demandé, sinon le milieu ou le seul visible', () => {
    expect(pairPoint(seen, [15, 16], 0)).toEqual(seen.pixel(15))
    expect(pairPoint(seen, [15, 16], 1)).toBeNull()
    expect(pairPoint(seen, [15, 16], null)).toEqual(seen.pixel(15))
    const [x, y] = pairPoint(seen, [11, 12], null)!
    expect(x).toBeCloseTo((seen.pixel(11)[0] + seen.pixel(12)[0]) / 2)
    expect(y).toBeCloseTo(seen.pixel(11)[1])
    expect(pairPoint(body(edit(pose('squat', 175), { 27: hide, 28: hide })), [27, 28], null)).toBeNull()
  })

  it('bodyPoint : appui et partie qui bouge', () => {
    expect(bodyPoint(seen, 'ankles', null)).toEqual(pairPoint(seen, [27, 28], null))
    expect(bodyPoint(seen, 'elbow', 1)).toEqual(seen.pixel(14))
    expect(bodyPoint(seen, 'wrist', 1)).toBeNull()
    expect(bodyPoint(seen, 'hips', 0)).toEqual(seen.pixel(23))
  })

  it('sidePoints : appui de chaque côté, ou du seul côté suivi', () => {
    expect(sidePoints(seen, 'ankles', null)).toEqual([seen.pixel(27), seen.pixel(28)])
    expect(sidePoints(seen, 'wrists', null)).toEqual([seen.pixel(15), null])
    expect(sidePoints(seen, 'ankles', 0)).toEqual([seen.pixel(27), null])
    expect(sidePoints(seen, 'elbow', 1)).toEqual([null, seen.pixel(14)])
  })

  it('jointSide et missingPart', () => {
    expect([jointSide(0), jointSide(11), jointSide(12), jointSide(27)]).toEqual([null, 0, 1, 0])
    expect(missingPart([0, 15])).toBe('head')
    expect(missingPart([24, 16])).toBe('hands')
    expect(missingPart([28])).toBe('feet')
    expect(missingPart([23, 13])).toBe('body')
  })
})

describe('sideSignal', () => {
  it('mesure le genou dans l’espace quand l’image en a, sinon sur l’image', () => {
    const frame = pose('squat', 100)
    expect(sideSignal(spec('squat'), body(frame), 0)).toBeCloseTo(100, 0)
    // De face, l'angle du genou sur l'image est trompeur (le genou avance vers le téléphone).
    const flat = sideSignal(spec('squat'), body({ ...frame, world: null }), 0)!
    expect(flat).toBeGreaterThan(150)
  })

  it('rend null quand un point du côté manque', () => {
    const frame = edit(pose('curl', 90), { 13: hide })
    expect(sideSignal(spec('curl'), body(frame), 0)).toBeNull()
    expect(sideSignal(spec('curl'), body(frame), 1)).toBeCloseTo(90, 0)
  })

  it('tractions : hauteur des mains en longueurs de bras, mesurée bras tendus si on la connaît', () => {
    const hanging = body(pose('pullup', 175))
    const arm = armLength(hanging, 0)!
    expect(arm).toBeCloseTo(0.57 * 250, 0)
    const top = body(pose('pullup', 50))
    const ratio = sideSignal(spec('pullup'), top, 0)!
    expect(ratio).toBeLessThan(0.45)
    expect(sideSignal(spec('pullup'), top, 0, arm * 2)).toBeCloseTo(ratio / 2, 3)
    expect(armLength(body(edit(pose('pullup', 175), { 15: hide })), 0)).toBeNull()
  })

  it('appui : hauteur des épaules au-dessus des mains (réglage à comparer)', () => {
    const support = sideSignal({ signal: 'supportRatio', space: '2d' }, body(pose('dip', 175)), 0)!
    expect(support).toBeGreaterThan(0.95)
    expect(sideSignal({ signal: 'supportRatio', space: '2d' }, body(pose('dip', 80)), 0)).toBeLessThan(0.8)
  })
})

describe('chooseBestSide', () => {
  it('prend le côté le mieux vu, et le garde tant que l’autre n’est pas nettement mieux vu', () => {
    expect(chooseBestSide([true, true], [0.9, 0.8], null, null, 0.15)).toBe(0)
    expect(chooseBestSide([true, true], [0.8, 0.9], null, null, 0.15)).toBe(1)
    expect(chooseBestSide([true, true], [0.8, 0.94], null, 0, 0.15)).toBe(0)
    expect(chooseBestSide([true, true], [0.8, 0.96], null, 0, 0.15)).toBe(1)
    expect(chooseBestSide([false, true], [0.9, 0.5], null, 0, 0.15)).toBe(1)
    expect(chooseBestSide([true, false], [0.5, 0.9], null, null, 0.15)).toBe(0)
    expect(chooseBestSide([false, false], [0.9, 0.9], null, 0, 0.15)).toBeNull()
  })

  it('à égalité, prend l’épaule la plus proche du téléphone', () => {
    expect(chooseBestSide([true, true], [0.9, 0.9], [0.2, -0.1], null, 0.15)).toBe(1)
    expect(chooseBestSide([true, true], [0.9, 0.9], [-0.2, 0.1], null, 0.15)).toBe(0)
    expect(chooseBestSide([true, true], [0.9, 0.9], null, null, 0.15)).toBe(0)
  })
})

describe('postureOk', () => {
  it('squat : debout, buste à moins de 60° de la verticale, chevilles sous les hanches', () => {
    expect(postureOk(spec('squat'), body(pose('squat', 90)))).toBe(true)
    expect(postureOk(spec('squat'), body(pose('squat', 175, { roll: 65 })))).toBe(false)
    const lifted = edit(pose('squat', 175), { 27: ([x, , v]) => [x, 0.3, v], 28: ([x, , v]) => [x, 0.3, v] })
    expect(postureOk(spec('squat'), body(lifted))).toBe(false)
  })

  it('pompes : corps presque à l’horizontale, mains sous les épaules, corps gainé', () => {
    const plank = pose('pushup', 170)
    expect(postureOk(spec('pushup'), body(plank))).toBe(true)
    // Debout : buste vertical.
    expect(postureOk(spec('pushup'), body(pose('squat', 175)))).toBe(false)
    const handsUp = edit(plank, { 15: ([x, , v]) => [x, 0.2, v], 16: ([x, , v]) => [x, 0.2, v] })
    expect(postureOk(spec('pushup'), body(handsUp))).toBe(false)
    const piked = edit(plank, { 23: ([x, y, v]) => [x, y - 0.15, v], 24: ([x, y, v]) => [x, y - 0.15, v] })
    expect(postureOk(spec('pushup'), body(piked))).toBe(false)
  })

  it('pompes inclinées : buste moins penché accepté', () => {
    const incline = pose('pushup', 170, { roll: 30 })
    expect(postureOk(spec('pushup'), body(incline))).toBe(false)
    expect(postureOk(spec('pushup', { minTorsoTilt: 25 }), body(incline))).toBe(true)
  })

  it('pompes sur les genoux : la ligne du corps s’arrête aux genoux', () => {
    const kneeling = pose('pushup', 170, {}, true)
    expect(postureOk(spec('pushup', { bodyLine: 'knee' }), body(kneeling))).toBe(true)
  })

  it('dips : buste peu penché (50° pour les dips penchés), mains pas au-dessus des épaules', () => {
    expect(postureOk(spec('dip'), body(pose('dip', 90)))).toBe(true)
    const leaning = pose('dip', 170, { roll: -42 })
    expect(postureOk(spec('dip'), body(leaning))).toBe(false)
    expect(postureOk(spec('dip', { maxTorsoTilt: 50 }), body(leaning))).toBe(true)
    const handsUp = edit(pose('dip', 170), { 15: ([x, , v]) => [x, 0.2, v], 16: ([x, , v]) => [x, 0.2, v] })
    expect(postureOk(spec('dip'), body(handsUp))).toBe(false)
  })

  it('tractions : suspendu, les deux mains au-dessus des épaules', () => {
    expect(postureOk(spec('pullup'), body(pose('pullup', 60)))).toBe(true)
    expect(postureOk(spec('pullup'), body(edit(pose('pullup', 175), { 16: hide })))).toBe(false)
    expect(postureOk(spec('pullup'), body(pose('pullup', 175, { roll: 45 })))).toBe(false)
    const standing = synthSet({ movement: 'pullup', reps: 0, after: 'leave', leadMs: 0 }).at(-1)!
    expect(postureOk(spec('pullup'), body(standing))).toBe(false)
  })

  it('curls : buste droit, et le haut du bras près de la verticale', () => {
    expect(postureOk(spec('curl'), body(pose('curl', 60)))).toBe(true)
    expect(postureOk(spec('curl'), body(pose('curl', 60, { roll: 35 })))).toBe(false)
    const raised = edit(pose('curl', 90), { 13: ([x, y, v]) => [x + 0.2, y - 0.1, v] })
    expect(armOk(spec('curl'), body(raised), 0)).toBe(false)
    expect(armOk(spec('curl'), body(raised), 1)).toBe(true)
    expect(armOk(spec('curl'), body(edit(raised, { 13: hide })), 0)).toBe(false)
    expect(armOk(spec('squat'), body(raised), 0)).toBe(true)
  })

  it('refuse sans buste', () => {
    expect(postureOk(spec('curl'), body(edit(pose('curl', 90), { 23: hide, 24: hide })))).toBe(false)
  })
})

describe('viewOk', () => {
  it('pompes et dips : de profil seulement', () => {
    expect(viewOk(spec('dip'), body(pose('dip', 170)), COUNTER_PARAMS)).toBe(true)
    expect(viewOk(spec('dip'), body(pose('dip', 170, { yaw: 0 })), COUNTER_PARAMS)).toBe(false)
    expect(viewOk(spec('dip'), body(edit(pose('dip', 170, { yaw: 0 }), { 12: hide })), COUNTER_PARAMS)).toBe(
      true,
    )
    expect(viewOk(spec('squat'), body(pose('dip', 170, { yaw: 0 })), COUNTER_PARAMS)).toBe(true)
  })
})

describe('measureFrame', () => {
  it('sans personne : rien d’utilisable, tous les points manquent', () => {
    const features = measureFrame(
      { t: 5, width: 480, height: 640, image: null, world: null },
      spec('dip'),
      COUNTER_PARAMS,
    )
    expect(features).toMatchObject({
      t: 5,
      body: null,
      good: false,
      posture: false,
      signal: null,
      visibility: 0,
    })
    expect(features.missing).toEqual(spec('dip').need)
  })

  it('squat de face : genou le plus plié, image utilisable et en position', () => {
    const features = measureFrame(pose('squat', 100), spec('squat'), COUNTER_PARAMS)
    expect(features).toMatchObject({ good: true, posture: true, view: true, measured: true, missing: [] })
    expect(features.signal).toBeCloseTo(100, 0)
    expect(features.visibility).toBeCloseTo(0.95)
    expect(features.tilt).toBeLessThan(1)
  })

  it('tolère trois points manquants quand la mesure est faite, pas quatre', () => {
    const three = edit(pose('squat', 175), { 12: hide, 24: hide, 26: hide })
    expect(measureFrame(three, spec('squat'), COUNTER_PARAMS)).toMatchObject({
      measured: true,
      missing: [12, 24, 26],
    })
    const four = edit(three, { 28: hide })
    expect(measureFrame(four, spec('squat'), COUNTER_PARAMS)).toMatchObject({ measured: false, good: false })
  })

  it('de profil, un côté entier suffit (l’autre peut être caché)', () => {
    const farHidden = edit(pose('dip', 120), { 12: hide, 14: hide, 16: hide, 24: hide })
    const features = measureFrame(farHidden, spec('dip'), COUNTER_PARAMS)
    expect(features).toMatchObject({ measured: true, good: true, side: 0 })
    expect(features.signal).toBeCloseTo(120, 0)
  })

  it('garde le côté suivi d’une image à l’autre', () => {
    const frame = pose('dip', 120, { yaw: 90 }, false)
    const first = measureFrame(frame, spec('dip'), COUNTER_PARAMS)
    expect(first.side).toBe(0)
    const otherBetter = edit(frame, {
      11: ([x, y]) => [x, y, 0.8],
      13: ([x, y]) => [x, y, 0.8],
      15: ([x, y]) => [x, y, 0.8],
    })
    // L'autre côté (0,75) n'est pas mieux vu de 0,15 : on garde le côté gauche.
    expect(
      measureFrame(otherBetter, spec('dip'), COUNTER_PARAMS, { side: 0, armLengths: [null, null] }).side,
    ).toBe(0)
    expect(measureFrame(otherBetter, spec('dip'), COUNTER_PARAMS).side).toBe(0)
    const muchBetter = edit(otherBetter, {
      12: ([x, y]) => [x, y, 0.99],
      14: ([x, y]) => [x, y, 0.99],
      16: ([x, y]) => [x, y, 0.99],
    })
    expect(
      measureFrame(muchBetter, spec('dip'), COUNTER_PARAMS, { side: 0, armLengths: [null, null] }).side,
    ).toBe(1)
  })

  it('curls : chaque bras mesuré, la mesure suivie est le bras le plus plié', () => {
    const features = measureFrame(pose('curl', [60, 150]), spec('curl'), COUNTER_PARAMS)
    expect(features.values[0]).toBeCloseTo(60, 0)
    expect(features.values[1]).toBeCloseTo(150, 0)
    expect(features.signal).toBeCloseTo(60, 0)
    expect(features.side).toBeNull()
    expect(features.pair).toBeNull()
    const bar = measureFrame(pose('curl', [60, 150]), spec('curl', { bothArms: true }), COUNTER_PARAMS)
    expect(bar.pair).toBeCloseTo(150, 0)
    expect(bar.signal).toBeCloseTo(60, 0)
  })

  it('tractions : moyenne des deux bras, un seul quand l’autre est caché', () => {
    const both = measureFrame(pose('pullup', 90), spec('pullup'), COUNTER_PARAMS)
    expect(both.signal).toBeCloseTo(((both.values[0] ?? 0) + (both.values[1] ?? 0)) / 2)
    const one = measureFrame(edit(pose('pullup', 90), { 14: hide }), spec('pullup'), COUNTER_PARAMS)
    expect(one.signal).toBe(one.values[0])
    expect(one.side).toBe(0)
  })

  it('mauvais angle de vue : pas utilisable', () => {
    const features = measureFrame(pose('pushup', 170, { yaw: 20 }), spec('pushup'), COUNTER_PARAMS)
    expect(features).toMatchObject({ view: false, good: false })
  })
})
