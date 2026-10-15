import { measureFrame, readBody, sideSignal } from '@/content/reps/features'
import { decodeFixture, repFixtureSchema } from '@/content/reps/fixture'
import { COUNTER_PARAMS, specFor } from '@/content/reps/specs'
import type { CountedMovement, CountedVariant, PoseFrame } from '@/content/reps/types'
import {
  BODY,
  project,
  reach,
  SYNTH_CAMERAS,
  SYNTH_FIXTURES,
  SYNTH_RANGE,
  synthPose,
  synthSet,
} from './pose-synth'

const variant = (movement: CountedMovement, overrides = {}): CountedVariant => ({ movement, overrides })

/** Une image de la position à cet angle, cadrée comme dans les séries fabriquées. */
function poseFrame(movement: CountedMovement, angle: number, kneeling = false): PoseFrame {
  return project(synthPose(movement, angle, { kneeling }), 0, { camera: SYNTH_CAMERAS[movement] })
}

/** L'angle mesuré comme le fait le compteur (dans l'espace pour squats et curls, sur l'image sinon). */
function measuredAngle(movement: CountedMovement, frame: PoseFrame, side: 0 | 1 = 0): number | null {
  const space = movement === 'squat' || movement === 'curl' ? '3d' : '2d'
  const signal = movement === 'squat' ? 'kneeAngle' : 'elbowAngle'
  return sideSignal({ signal, space }, readBody(frame, COUNTER_PARAMS)!, side)
}

describe('squelettes fabriqués', () => {
  const cases: [CountedMovement, number][] = (['squat', 'pushup', 'dip', 'pullup', 'curl'] as const).flatMap(
    (movement) => {
      const { top, bottom } = SYNTH_RANGE[movement]
      return [top, (top + bottom) / 2, bottom].map((angle): [CountedMovement, number] => [movement, angle])
    },
  )

  it.each(cases)('%s à %d° : l’angle mesuré est celui demandé, à 1° près', (movement, angle) => {
    const frame = poseFrame(movement, angle)
    for (const side of [0, 1] as const) {
      expect(Math.abs((measuredAngle(movement, frame, side) ?? Number.NaN) - angle)).toBeLessThanOrEqual(1)
    }
  })

  it('le reste après passage par un fichier de points (millièmes)', () => {
    const fixture = SYNTH_FIXTURES['synth-squat-3']!()
    const original = synthSet({ movement: 'squat', reps: 3 })
    const decoded = decodeFixture(fixture)
    expect(decoded).toHaveLength(original.length)
    for (const index of [0, 30, 45, 60]) {
      const a = measuredAngle('squat', original[index]!)!
      const b = measuredAngle('squat', decoded[index]!)!
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1)
    }
  })

  it('pompes sur les genoux : angle du coude juste aussi', () => {
    expect(measuredAngle('pushup', poseFrame('pushup', 90, true))).toBeCloseTo(90, 0)
  })

  it('tractions : hauteur des mains au-dessus des épaules, en longueurs de bras', () => {
    const arm = BODY.upperArm + BODY.forearm
    const spread = BODY.grip - BODY.shoulderHalf
    for (const angle of [175, 110, 50]) {
      const d = reach(BODY.upperArm, BODY.forearm, angle)
      const expected = Math.sqrt(d * d - spread * spread) / arm
      const body = readBody(poseFrame('pullup', angle), COUNTER_PARAMS)!
      expect(sideSignal({ signal: 'hangRatio', space: '2d' }, body, 0)).toBeCloseTo(expected, 2)
    }
    // Suspendu bras tendus : au-dessus de 0,8 ; en haut : sous 0,45.
    expect(
      sideSignal(specFor(variant('pullup')), readBody(poseFrame('pullup', 175), COUNTER_PARAMS)!, 0),
    ).toBeGreaterThan(0.8)
    expect(
      sideSignal(specFor(variant('pullup')), readBody(poseFrame('pullup', 50), COUNTER_PARAMS)!, 1),
    ).toBeLessThan(0.45)
  })

  it.each([
    ['squat', {}],
    ['pushup', {}],
    ['pushup', { bodyLine: 'knee' }],
    ['dip', {}],
    ['pullup', {}],
    ['curl', {}],
    ['curl', { bothArms: true }],
  ] as const)('%s %o : en position, bien cadré, de haut en bas', (movement, overrides) => {
    const spec = specFor(variant(movement, overrides))
    const { top, bottom } = SYNTH_RANGE[movement]
    const kneeling = 'bodyLine' in overrides
    for (const angle of [top, (top + bottom) / 2, bottom]) {
      const features = measureFrame(poseFrame(movement, angle, kneeling), spec, COUNTER_PARAMS)
      expect(features).toMatchObject({
        good: true,
        posture: true,
        view: true,
        missing: [],
        arms: [true, true],
      })
      const height = SYNTH_CAMERAS[movement].height
      expect(features.body!.torso / height).toBeGreaterThan(COUNTER_PARAMS.tooFar)
      expect(features.body!.torso / height).toBeLessThan(COUNTER_PARAMS.tooClose)
    }
  })

  it('de profil, le côté loin du téléphone est moins visible ; de dos, le visage est caché', () => {
    const side = poseFrame('dip', 170).image!
    expect(side[11]![2]).toBe(0.95)
    expect(side[12]![2]).toBe(0.75)
    const back = poseFrame('pullup', 175).image!
    expect(back[0]![2]).toBe(0.2)
    expect(back[11]![2]).toBe(0.95)
  })
})

describe('séries fabriquées', () => {
  it('donnent des images à la cadence voulue, temps entiers', () => {
    const frames = synthSet({
      movement: 'squat',
      reps: 2,
      leadMs: 1000,
      repMs: 2000,
      pauseMs: 0,
      tailMs: 1000,
    })
    expect(frames[0]!.t).toBe(0)
    expect(frames[1]!.t).toBe(67)
    expect(frames.at(-1)!.t).toBe(6000)
    expect(frames.every((frame) => Number.isInteger(frame.t))).toBe(true)
    expect(synthSet({ movement: 'squat', reps: 1, fps: 30, startT: 500 })[1]!.t).toBe(533)
  })

  it('descendent jusqu’au bas, ou à la profondeur demandée', () => {
    const angles = (frames: PoseFrame[]) => frames.map((frame) => measuredAngle('squat', frame)!)
    const full = angles(synthSet({ movement: 'squat', reps: 1, leadMs: 0, tailMs: 0, pauseMs: 0, fps: 30 }))
    expect(Math.min(...full)).toBeCloseTo(85, 0)
    expect(Math.max(...full)).toBeCloseTo(175, 0)
    const half = angles(
      synthSet({ movement: 'squat', reps: [{ depth: 0.5 }], leadMs: 0, tailMs: 0, fps: 30 }),
    )
    expect(Math.min(...half)).toBeCloseTo(130, 0)
  })

  it('alternent les bras des curls', () => {
    const frames = synthSet({ movement: 'curl', reps: 2, alternate: true, leadMs: 0, pauseMs: 0, tailMs: 0 })
    const middle = (index: number) => [
      measuredAngle('curl', frames[index]!, 0),
      measuredAngle('curl', frames[index]!, 1),
    ]
    // Milieu de la première répétition (bras gauche), puis de la seconde (bras droit).
    expect(middle(15)[0]).toBeCloseTo(40, 0)
    expect(middle(15)[1]).toBeCloseTo(170, 0)
    expect(middle(45)[0]).toBeCloseTo(170, 0)
    expect(middle(45)[1]).toBeCloseTo(40, 0)
  })

  it('cachent la personne pendant les trous et après son départ', () => {
    const frames = synthSet({ movement: 'pullup', reps: 1, gaps: [[1000, 1200]], after: 'gone' })
    const hidden = frames.filter((frame) => frame.image === null).map((frame) => frame.t)
    expect(hidden.slice(0, 3)).toEqual([1000, 1067, 1133])
    expect(frames.at(-1)!.image).toBeNull()
    expect(frames.at(-1)!.world).toBeNull()
  })

  it('font quitter la position : debout sous la barre, mains plus bas que les épaules', () => {
    const frames = synthSet({ movement: 'pullup', reps: 1, after: 'leave' })
    const last = measureFrame(frames.at(-1)!, specFor(variant('pullup')), COUNTER_PARAMS)
    expect(last).toMatchObject({ good: true, posture: false })
  })

  it('peuvent bloquer la partie qui bouge : c’est alors l’appui qui se déplace', () => {
    const frames = synthSet({
      movement: 'pullup',
      reps: 1,
      pinned: 'mover',
      leadMs: 0,
      pauseMs: 0,
      tailMs: 0,
      fps: 4,
    })
    const shoulders = frames.map((frame) => frame.image![11]![1])
    const wrists = frames.map((frame) => frame.image![15]![1])
    expect(Math.max(...shoulders) - Math.min(...shoulders)).toBeLessThan(0.001)
    expect(Math.max(...wrists) - Math.min(...wrists)).toBeGreaterThan(0.1)
  })

  it('font marcher la personne sur le côté, sans changer sa position', () => {
    // Une répétition de 1,5 à 3,5 s, puis 0,5 m de marche de 4 à 5 s, debout jusqu'à 6 s.
    const frames = synthSet({ movement: 'squat', reps: 1, walk: { at: 4000, metres: 0.5, durationMs: 1000 } })
    const at = (t: number) => frames.find((frame) => frame.t >= t)!
    const ankleX = (t: number) => at(t).image![27]![0] * at(t).width
    // De face, la gauche de la personne est à droite de l'image.
    expect(ankleX(4000) - ankleX(0)).toBeCloseTo(0, 5)
    // À vitesse constante (image de 4,6 s : 0,3 m).
    expect(ankleX(4600) - ankleX(0)).toBeCloseTo(0.3 * SYNTH_CAMERAS.squat.pixelsPerMetre, 0)
    expect(ankleX(5000) - ankleX(0)).toBeCloseTo(0.5 * SYNTH_CAMERAS.squat.pixelsPerMetre, 0)
    expect(ankleX(6000) - ankleX(5000)).toBeCloseTo(0, 5)
    // Même position : les points dans l'espace (hanches en 0) ne changent pas.
    at(6000).world!.forEach((point, joint) => {
      point.forEach((value, axis) => expect(value).toBeCloseTo(at(0).world![joint]![axis]!, 9))
    })
  })

  it('peuvent passer à une autre personne, ailleurs dans l’image', () => {
    const frames = synthSet({ movement: 'squat', reps: 1, switchAt: 1000, leadMs: 2000 })
    const hipX = (frame: PoseFrame) => frame.image![23]![0] * frame.width
    expect(hipX(frames[15]!) - hipX(frames[14]!)).toBeCloseTo(100, 0)
  })

  it('tremblent un peu quand on le demande, toujours de la même façon', () => {
    const a = synthSet({ movement: 'curl', reps: 1, noise: 0.003 })
    const b = synthSet({ movement: 'curl', reps: 1, noise: 0.003 })
    const still = synthSet({ movement: 'curl', reps: 1 })
    expect(a).toEqual(b)
    expect(a[0]!.image![11]).not.toEqual(still[0]!.image![11])
    expect(Math.abs(a[0]!.image![11]![0] - still[0]!.image![11]![0])).toBeLessThanOrEqual(0.003)
  })
})

describe('fichiers synth-*.json (src/test/reps)', () => {
  it.each(Object.entries(SYNTH_FIXTURES))(
    '%s est à jour (sinon : npx vitest run src/test/pose-synth.test.ts -u)',
    async (name, make) => {
      const fixture = make()
      expect(repFixtureSchema.parse(fixture)).toEqual(fixture)
      expect(fixture.name).toBe(name)
      await expect(`${JSON.stringify(fixture)}\n`).toMatchFileSnapshot(`./reps/${name}.json`)
    },
  )
})
