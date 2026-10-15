import { project, SYNTH_CAMERAS, synthPose, synthSet, type SynthSetOptions } from '@/test/pose-synth'
import { loadRepFixture } from '@/test/reps-fixtures'
import { idleLimit } from './cadence'
import { decimate, decodeFixture } from './fixture'
import { createRepCounter, type RepCounterOptions } from './rep-counter'
import type {
  CountedMovement,
  CountedVariant,
  CounterParams,
  CounterResult,
  CounterSnapshot,
  CounterStatus,
  ImagePoint,
  PoseFrame,
  RepEvent,
} from './types'

const variant = (movement: CountedMovement, overrides: CountedVariant['overrides'] = {}): CountedVariant => ({
  movement,
  overrides,
})
const SQUAT = variant('squat')

interface Played {
  readonly result: CounterResult
  readonly snapshots: readonly CounterSnapshot[]
  /** Chaque évènement une fois (dans l'ordre). */
  readonly events: readonly RepEvent[]
  /** Changements d'état, avec le temps de l'image (ou du tic) qui les a faits. */
  readonly statuses: readonly (readonly [CounterStatus, number])[]
  /** Temps de l'image ou du tic qui a terminé la série tout seul (null : terminée à la main). */
  readonly endedAt: number | null
}

/** Rejoue des images, laisse passer 25 s sans image (tic toutes les 67 ms), puis termine à la main. */
function play(
  frames: readonly PoseFrame[],
  options: Partial<RepCounterOptions> & { light?: number } = {},
): Played {
  const counter = createRepCounter({ variant: SQUAT, ...options })
  const snapshots: CounterSnapshot[] = []
  const events: RepEvent[] = []
  const statuses: [CounterStatus, number][] = [[counter.snapshot.status, Number.NEGATIVE_INFINITY]]
  let lastId = 0
  let endedAt: number | null = null
  const record = (snapshot: CounterSnapshot, t: number) => {
    if (snapshot.status !== statuses.at(-1)![0]) statuses.push([snapshot.status, t])
    if (snapshot.event && snapshot.event.id !== lastId) {
      lastId = snapshot.event.id
      const { id: _, ...event } = snapshot.event
      events.push(event)
    }
    if (counter.result && endedAt === null) endedAt = t
  }
  for (const frame of frames) {
    if (counter.result) break
    const snapshot = counter.push(frame, options.light ?? null)
    snapshots.push(snapshot)
    record(snapshot, frame.t)
  }
  const last = frames.at(-1)?.t ?? 0
  for (let t = last + 67; t <= last + 25_000 && !counter.result; t += 67) record(counter.tick(t), t)
  const result = counter.result ?? counter.finish(last + 25_000, 'manual')
  return { result, snapshots, events, statuses, endedAt }
}

/** Les temps des répétitions comptées, d'après les évènements. */
const repEvents = (played: Played) => played.events.filter((event) => event.kind === 'rep')

/** La même position, immobile, de `from` à `to` (15 images par seconde). */
function hold(make: (t: number) => PoseFrame, from: number, to: number): PoseFrame[] {
  const frames: PoseFrame[] = []
  for (let t = from; t < to; t += 67) frames.push(make(t))
  return frames
}

const standing = (t: number, camera = {}) =>
  project(synthPose('squat', 175), t, { camera: { ...SYNTH_CAMERAS.squat, ...camera } })
const nobody = (t: number): PoseFrame => ({ t, width: 480, height: 640, image: null, world: null })
/** Reste en position 14 s après la dernière répétition : assez pour que la pause termine la série. */
const STAY = { tailMs: 14_000 }

describe('createRepCounter : une série', () => {
  it('arme, compte, puis termine tout seul après la pause', () => {
    const played = play(synthSet({ movement: 'squat', reps: 5, ...STAY }))
    expect(played.result).toEqual({
      reps: 5,
      doubtful: 0,
      partials: 0,
      rejected: 0,
      confident: true,
      reasons: [],
      endedBy: 'idle',
      repTimes: repEvents(played).map((event) => event.t),
    })
    expect(played.statuses.map(([status]) => status)).toEqual(['searching', 'arming', 'counting', 'ended'])
    expect(played.statuses[1]![1]).toBe(0)
    expect(played.statuses[2]![1]).toBe(1000)
    expect(repEvents(played).map((event) => event.reps)).toEqual([1, 2, 3, 4, 5])
    // Chaque répétition est comptée en remontant (une répétition de 2 s toutes les 2,5 s, à partir de 1,5 s).
    played.result.repTimes.forEach((t, i) => {
      expect(t).toBeGreaterThan(1500 + 2500 * i + 1000)
      expect(t).toBeLessThanOrEqual(3500 + 2500 * i)
    })
    expect(played.snapshots.at(-1)).toMatchObject({ status: 'ended', reps: 5, hint: null })
  })

  it('attend la pause adaptée à la cadence avant de terminer', () => {
    const lastRep = (played: Played) => played.result.repTimes.at(-1)!
    for (const options of [{ repMs: 1200, pauseMs: 200 }, { repMs: 3000, pauseMs: 1500 }, { reps: 2 }]) {
      const played = play(synthSet({ movement: 'squat', reps: 5, ...STAY, ...options }))
      const limit = idleLimit(played.result.repTimes)
      expect(played.result.endedBy).toBe('idle')
      expect(played.endedAt! - lastRep(played)).toBeGreaterThan(limit)
      expect(played.endedAt! - lastRep(played)).toBeLessThanOrEqual(limit + 67)
    }
    expect(idleLimit([0, 1400, 2800])).toBe(6000)
    expect(idleLimit([0, 4500, 9000])).toBe(12_000)
  })

  it.each([
    ['squats', variant('squat'), { movement: 'squat' }],
    ['pompes', variant('pushup'), { movement: 'pushup' }],
    [
      'pompes sur les genoux',
      variant('pushup', { bodyLine: 'knee' }),
      { movement: 'pushup', kneeling: true },
    ],
    ['dips', variant('dip'), { movement: 'dip' }],
    ['tractions', variant('pullup'), { movement: 'pullup' }],
    ['curls', variant('curl'), { movement: 'curl' }],
    ['curls alternés', variant('curl'), { movement: 'curl', alternate: true }],
    ['curls à la barre', variant('curl', { bothArms: true }), { movement: 'curl' }],
  ] as const)('%s : même compte à 30, 15, 10 et 8 images par seconde', (_, counted, options) => {
    const frames = synthSet({ ...options, reps: 6, fps: 30, ...STAY })
    for (const fps of [30, 15, 10, 8]) {
      const played = play(decimate(frames, fps), { variant: counted })
      expect({ fps, reps: played.result.reps, endedBy: played.result.endedBy }).toEqual({
        fps,
        reps: 6,
        endedBy: 'idle',
      })
    }
  })
})

describe('createRepCounter : départ', () => {
  it('arme quand la personne tient la position une seconde', () => {
    const played = play(hold(standing, 0, 3000))
    expect(played.snapshots[0]!.status).toBe('arming')
    expect(played.snapshots.find((snapshot, i) => i > 0 && snapshot.status === 'counting')).toBeDefined()
    expect(played.statuses.slice(1, 3)).toEqual([
      ['arming', 0],
      ['counting', 1005],
    ])
  })

  it('n’arme pas tant que la personne se déplace, et lui demande de ne plus bouger', () => {
    // Elle traverse l'image (0,85 buste par seconde) pendant 2 s, puis s'arrête.
    const shift = (t: number) => Math.min(t, 2000) * 0.12 - 120
    const played = play(hold((t) => standing(t, { origin: [240 + shift(t), 600] }), 0, 5000))
    const states = played.statuses.map(([status]) => status)
    expect(states.slice(0, 5)).toEqual(['searching', 'arming', 'searching', 'arming', 'counting'])
    const [, interrupted] = played.statuses[2]!
    const [, armed] = played.statuses[3]!
    const [, counting] = played.statuses[4]!
    expect(interrupted).toBeLessThan(1000)
    expect(armed).toBeGreaterThan(2000)
    expect(counting - armed).toBeGreaterThanOrEqual(1000)
    const at = (t: number) => played.snapshots[Math.ceil(t / 67)]!
    expect(at(1900).hint).toEqual({ kind: 'holdStill' })
    expect(at(4900).hint).toBeNull()
  })

  it('garde les répétitions faites pendant l’armement', () => {
    const played = play(
      synthSet({ movement: 'squat', reps: [{ durationMs: 1000 }, {}, {}], leadMs: 0, ...STAY }),
    )
    expect(played.result.reps).toBe(3)
    expect(repEvents(played)[0]).toEqual({ kind: 'rep', t: 1000, reps: 1 })
  })

  it('repart de zéro si une autre personne arrive pendant l’armement', () => {
    const played = play(synthSet({ movement: 'squat', reps: 3, switchAt: 600, ...STAY }))
    expect(played.statuses.slice(1, 3)).toEqual([
      ['arming', 0],
      ['searching', 600],
    ])
    // Elle a bougé d'un coup : il faut d'abord qu'elle se tienne immobile.
    const [[rearmed, armedAt], [counting, countingAt]] = played.statuses.slice(3, 5) as [
      [CounterStatus, number],
      [CounterStatus, number],
    ]
    expect([rearmed, counting]).toEqual(['arming', 'counting'])
    expect(armedAt).toBeGreaterThan(600)
    expect(countingAt - armedAt).toBe(1000)
    expect(played.result).toMatchObject({ reps: 3, endedBy: 'idle' })
  })
})

describe('createRepCounter : fin de série', () => {
  it('ne termine jamais seule avant la première répétition', () => {
    const played = play([...hold(standing, 0, 30_000), ...hold(nobody, 30_000, 60_000)])
    expect(played.endedAt).toBeNull()
    expect(played.result).toMatchObject({ reps: 0, endedBy: 'manual', confident: false })
    expect(played.snapshots.at(-1)!.status).toBe('counting')
  })

  it('termine quand la personne disparaît', () => {
    const frames = synthSet({ movement: 'squat', reps: 3, after: 'gone', ...STAY })
    const played = play(frames)
    expect(played.result).toMatchObject({ reps: 3, endedBy: 'gone', confident: true })
    // Partie après la troisième répétition (1,5 s + 3 × 2,5 s) : 2,5 s après la dernière image où elle est vue.
    const lastSeen = frames.filter((frame) => frame.image !== null).at(-1)!.t
    expect(lastSeen).toBeLessThan(9000)
    expect(played.endedAt).toBeGreaterThan(lastSeen + 2500)
    expect(played.endedAt).toBeLessThanOrEqual(lastSeen + 2500 + 67)
  })

  it('termine quand la personne disparaît, même sans nouvelle image', () => {
    const frames = synthSet({ movement: 'squat', reps: 3, tailMs: 0 })
    const counter = createRepCounter({ variant: SQUAT })
    for (const frame of frames) counter.push(frame)
    const last = frames.at(-1)!.t
    expect(counter.tick(last + 2400).status).toBe('counting')
    expect(counter.tick(last + 2600).status).toBe('ended')
    expect(counter.result).toMatchObject({ reps: 3, endedBy: 'gone' })
  })

  it('termine quand la personne quitte la position', () => {
    // Allongée par terre après deux squats : le buste n'est plus droit.
    const lying = (t: number) => project(synthPose('pushup', 170), t, { camera: SYNTH_CAMERAS.pushup })
    const frames = [...synthSet({ movement: 'squat', reps: 2, tailMs: 500 }), ...hold(lying, 7067, 15_000)]
    const played = play(frames)
    expect(played.result).toMatchObject({ reps: 2, endedBy: 'left' })
    expect(played.endedAt).toBeGreaterThan(7067 + 2500)
    expect(played.endedAt).toBeLessThanOrEqual(7067 + 2500 + 67)
  })

  it('termine une seule fois, à la main ou interrompue', () => {
    const counter = createRepCounter({ variant: SQUAT })
    const result = counter.finish(1000, 'interrupted')
    expect(result).toEqual({
      reps: 0,
      doubtful: 0,
      partials: 0,
      rejected: 0,
      confident: false,
      reasons: ['fewReps', 'interrupted'],
      endedBy: 'interrupted',
      repTimes: [],
    })
    expect(counter.finish(2000, 'manual')).toBe(result)
    expect(counter.result).toBe(result)
    expect(counter.snapshot.status).toBe('ended')
    expect(counter.push(standing(3000)).status).toBe('ended')
    expect(counter.tick(4000).status).toBe('ended')
    expect(createRepCounter({ variant: SQUAT }).finish(0, 'manual').reasons).toEqual(['fewReps'])
  })

  it('terminée à la main en pleine série : compte sûr si tout s’est bien passé', () => {
    const frames = synthSet({ movement: 'squat', reps: 4, tailMs: 500 })
    const counter = createRepCounter({ variant: SQUAT })
    for (const frame of frames) counter.push(frame)
    // Un temps plus ancien que la dernière image n'y change rien.
    expect(counter.finish(0, 'manual')).toMatchObject({ reps: 4, confident: true, endedBy: 'manual' })
  })
})

describe('createRepCounter : suite de série, temps et images vides', () => {
  it('part des répétitions déjà comptées', () => {
    const counter = createRepCounter({ variant: SQUAT, offset: 7 })
    expect(counter.snapshot.reps).toBe(7)
    const played = play(synthSet({ movement: 'squat', reps: 3 }), { offset: 7 })
    expect(repEvents(played).map((event) => event.reps)).toEqual([8, 9, 10])
    expect(played.result).toMatchObject({ reps: 10, confident: true })
    expect(played.result.repTimes).toHaveLength(3)
  })

  it('laisse passer le temps sans image', () => {
    const counter = createRepCounter({ variant: SQUAT })
    expect(counter.tick(5000)).toMatchObject({ status: 'searching', reps: 0, hint: { kind: 'noPerson' } })
    expect(counter.result).toBeNull()
  })

  it('ignore une image qui ne vient pas après la précédente', () => {
    const counter = createRepCounter({ variant: SQUAT })
    const first = counter.push(standing(1000))
    expect(counter.push(standing(1000))).toBe(first)
    expect(counter.push(standing(900))).toBe(first)
    expect(counter.push(standing(1067))).not.toBe(first)
  })

  it('cherche sans rien compter quand personne n’est vu', () => {
    const played = play(hold(nobody, 0, 10_000))
    expect(played.statuses.map(([status]) => status)).toEqual(['searching'])
    expect(played.snapshots.every((snapshot) => snapshot.hint?.kind === 'noPerson')).toBe(true)
    expect(played.result).toMatchObject({ reps: 0, endedBy: 'manual' })
  })

  it('juge la cadence des images depuis le départ', () => {
    const frames = synthSet({ movement: 'squat', reps: 5, fps: 30 })
    const slow = play(decimate(frames, 5))
    expect(slow.result.reps).toBe(5)
    expect(slow.result.reasons).toEqual(['slow'])
    expect(slow.snapshots.some((snapshot) => snapshot.slow)).toBe(true)
    // Rien avant une seconde de comptage.
    expect(slow.snapshots.filter((snapshot) => snapshot.status !== 'counting').every((s) => !s.slow)).toBe(
      true,
    )
    const fine = play(decimate(frames, 15))
    expect(fine.snapshots.some((snapshot) => snapshot.slow)).toBe(false)
    expect(fine.result.reasons).toEqual([])
  })

  it('donne de quoi régler le compteur', () => {
    const played = play(synthSet({ movement: 'squat', reps: [{}, { durationMs: 400, depth: 1 }, {}] }))
    // Au plus bas de la première répétition (1,5 s + 1 s).
    const bottom = played.snapshots[Math.round(2500 / (1000 / 15))]!
    expect(bottom.debug).toMatchObject({
      flexed: 120,
      extended: 150,
      phase: 'bottom',
      // Squats : le genou le plus plié (le gauche quand ils le sont autant).
      side: 'left',
      quality: 1,
      lastReject: null,
    })
    expect(bottom.debug.signal).toBeLessThan(100)
    expect(bottom.debug.visibility).toBeGreaterThan(0.7)
    expect(bottom.debug.fps).toBeCloseTo(15, 0)
    expect(played.snapshots[0]!.debug).toMatchObject({ quality: 0, phase: 'top' })
    expect(played.snapshots.at(-2)!.debug.lastReject).toBe('fast')
    expect(played.result).toMatchObject({ reps: 2, rejected: 1 })
  })
})

/** Une autre personne, un quart de largeur plus loin dans l'image, à la place de la bonne de `from` à `to`. */
function elsewhere(frames: readonly PoseFrame[], from: number, to: number): PoseFrame[] {
  return frames.map((frame) =>
    frame.t >= from && frame.t < to && frame.image
      ? { ...frame, image: frame.image.map(([x, y, v]): ImagePoint => [x + 0.25, y, v]) }
      : frame,
  )
}

/** Les images de `from` à `to` remplacées par des images sans personne. */
function nobodyBetween(frames: readonly PoseFrame[], from: number, to: number): PoseFrame[] {
  return frames.map((frame) => (frame.t >= from && frame.t < to ? nobody(frame.t) : frame))
}

describe('createRepCounter : répétitions perdues de vue', () => {
  // Cinq squats de 2 s toutes les 2,5 s à partir de 1,5 s : la troisième de 6,5 s à 8,5 s (en bas à 7,5 s).
  const frames = synthSet({ movement: 'squat', reps: 5, ...STAY })
  const sure = (played: Played) => [played.result.reps, played.result.confident, played.result.reasons]

  it('un trou d’images en pleine répétition : la répétition est perdue, le compte à vérifier', () => {
    // Caméra figée 1,5 s (aucune image), ou personne trouvée pendant 1,5 s.
    const stalled = play(frames.filter((frame) => frame.t < 6900 || frame.t >= 8400))
    expect(sure(stalled)).toEqual([4, false, ['lost']])
    expect(sure(play(nobodyBetween(frames, 6900, 8400)))).toEqual([4, false, ['lost']])
  })

  it('un trou d’images en haut, entre deux répétitions : une répétition a pu s’y faire, compte à vérifier', () => {
    // Pendant la pause après la deuxième répétition, un peu plus longtemps que gapResetMs.
    expect(sure(play(frames.filter((frame) => frame.t < 5800 || frame.t > 6600)))).toEqual([
      5,
      false,
      ['lost'],
    ])
  })

  it('un court trou d’images ne change rien', () => {
    expect(sure(play(nobodyBetween(frames, 7000, 7400)))).toEqual([5, true, []])
  })

  it('une autre personne deux images en pleine répétition : perdue, compte à vérifier', () => {
    expect(sure(play(elsewhere(frames, 7400, 7534)))).toEqual([4, false, ['lost']])
    // Juste au moment où la personne remonte en haut.
    expect(sure(play(elsewhere(frames, 8200, 8334)))).toEqual([4, false, ['lost']])
  })

  it('une autre personne deux images pendant que la personne attend en haut : rien de perdu', () => {
    expect(sure(play(elsewhere(frames, 6067, 6200)))).toEqual([5, true, []])
  })

  it('une vraie série (MM-Fit) : 1,5 s sans image ou deux images d’une autre personne, jamais 9 sûr pour 10', () => {
    const fixture = loadRepFixture('mmfit-squats-w08-2')
    const real = decodeFixture(fixture)
    const counted = play(real).result
    expect([counted.reps, counted.confident]).toEqual([10, true])
    // Au milieu de chaque répétition, entre deux répétitions comptées.
    const middles = counted.repTimes.slice(1).map((t, i) => (counted.repTimes[i]! + t) / 2)
    for (const middle of middles) {
      const stalled = play(real.filter((frame) => frame.t < middle - 750 || frame.t > middle + 750)).result
      const switched = play(elsewhere(real, middle, middle + 134)).result
      for (const result of [stalled, switched]) {
        expect(result.reps === fixture.expected.reps || !result.confident, String(middle)).toBe(true)
        if (result.reps !== fixture.expected.reps) expect(result.reasons).toContain('lost')
      }
    }
  })
})

describe('createRepCounter : consignes', () => {
  it('commence par chercher quelqu’un, puis suit la première image sans attendre', () => {
    const counter = createRepCounter({ variant: SQUAT })
    expect(counter.snapshot).toMatchObject({ status: 'searching', reps: 0, hint: { kind: 'noPerson' } })
    expect(counter.push(standing(0)).hint).toBeNull()
  })

  it('attend 1,5 s avant de changer de consigne', () => {
    const played = play([
      ...hold(standing, 0, 2010),
      ...hold(nobody, 2010, 6000),
      ...hold(standing, 6000, 9000),
    ])
    const hintAt = (t: number) => played.snapshots[Math.floor(t / 67)]!.hint
    expect(hintAt(2010 + 1400)).toBeNull()
    expect(hintAt(2010 + 1600)).toEqual({ kind: 'noPerson' })
    expect(hintAt(6000 + 1400)).toEqual({ kind: 'noPerson' })
    expect(hintAt(6000 + 1600)).toBeNull()
  })

  it.each([
    ['tooClose', SQUAT, (t: number) => standing(t, { pixelsPerMetre: 700, origin: [240, 1250] })],
    ['tooFar', SQUAT, (t: number) => standing(t, { pixelsPerMetre: 60 })],
    ['out', SQUAT, (t: number) => standing(t, { origin: [240, 850] }), 'feet'],
    [
      'out',
      variant('pullup'),
      (t: number) =>
        project(synthPose('pullup', 175), t, { camera: { ...SYNTH_CAMERAS.pullup, origin: [240, -60] } }),
      'hands',
    ],
    [
      'phoneUpright',
      variant('curl'),
      (t: number) =>
        project(synthPose('curl', 170), t, {
          camera: { ...SYNTH_CAMERAS.curl, width: 640, height: 480, origin: [320, 480], roll: 90 },
        }),
    ],
    [
      'turnSide',
      variant('dip'),
      (t: number) => project(synthPose('dip', 170), t, { camera: { ...SYNTH_CAMERAS.dip, yaw: 0 } }),
    ],
    ['position', variant('pullup'), (t: number) => standing(t)],
    [
      'dark',
      SQUAT,
      (t: number) =>
        project(synthPose('squat', 175), t, { camera: SYNTH_CAMERAS.squat, visibility: 0.6, far: 0.6 }),
    ],
  ] as const)('%s', (kind, counted, make, part?: string) => {
    const played = play(hold(make, 0, 3000), { variant: counted })
    expect(played.snapshots.at(-1)!.hint).toEqual(part === undefined ? { kind } : { kind, part })
  })

  it('dit quand l’image est trop sombre', () => {
    const played = play(hold(standing, 0, 1000), { light: 30 })
    expect(played.snapshots.at(-1)!.hint).toEqual({ kind: 'dark' })
    expect(play(hold(standing, 0, 1000), { light: 120 }).snapshots.at(-1)!.hint).toBeNull()
  })
})

describe.each([
  ['pullup', { partial: 0.75, fast: { depth: 1.15, durationMs: 600 } }],
  ['dip', { partial: 0.6, fast: { durationMs: 450 } }],
] as const)('createRepCounter : %s fabriqués', (movement, { partial, fast }) => {
  const counted = variant(movement)
  const run = (options: Omit<SynthSetOptions, 'movement'>, fps = 15) =>
    play(decimate(synthSet({ movement, fps: 30, ...STAY, ...options }), fps), { variant: counted })

  it.each([8, 15, 30])('compte exactement 1, 3 et 6 répétitions à %d images par seconde, en essai', (fps) => {
    for (const reps of [1, 3, 6]) {
      const played = run({ reps }, fps)
      expect(played.result).toMatchObject({
        reps,
        endedBy: 'idle',
        confident: false,
        partials: 0,
        rejected: 0,
      })
      expect(played.result.reasons).toContain('trial')
    }
  })

  it('montre les demi-répétitions sans les compter', () => {
    const played = run({ reps: [{}, { depth: partial }, {}, { depth: partial }, {}] })
    expect(played.result).toMatchObject({ reps: 3, partials: 2 })
    expect(played.events.filter((event) => event.kind === 'partial')).toHaveLength(2)
  })

  it('refuse une répétition trop rapide', () => {
    const played = run({ reps: [{}, fast, {}, {}] })
    expect(played.result).toMatchObject({ reps: 3, rejected: 1 })
    expect(played.events.filter((event) => event.kind === 'rejected')).toEqual([
      expect.objectContaining({ why: 'fast' }),
    ])
  })

  it('refuse les répétitions où les mains bougent', () => {
    const played = run({ reps: 4, pinned: 'mover' })
    expect(played.result.reps).toBe(0)
    const rejected = played.events.filter((event) => event.kind === 'rejected')
    expect(rejected.map((event) => event.why)).toEqual(['anchor', 'anchor', 'anchor', 'anchor'])
  })

  it('termine la série quand la personne lâche la barre', () => {
    const played = run({ reps: 3, after: 'leave', tailMs: 6000 })
    expect(played.result).toMatchObject({ reps: 3, endedBy: 'left' })
    // Lâchée juste après la troisième répétition (1,5 s + 3 × 2,5 s), en moins d'une seconde : 2,5 s plus tard.
    expect(played.endedAt).toBeGreaterThan(9000 + 2500)
    expect(played.endedAt).toBeLessThanOrEqual(9000 + 800 + 2500 + 67)
  })

  it('perd la répétition en cours quand une autre personne prend la place', () => {
    // Au milieu de la deuxième répétition (4 s à 6 s).
    const played = run({ reps: 4, switchAt: 5000 })
    expect(played.result.reps).toBe(3)
    expect(played.result.endedBy).toBe('idle')
    expect(played.result.reasons).toContain('lost')
  })

  it('supporte des images sans personne pendant la série, et termine quand elle part', () => {
    const gaps = run({
      reps: 4,
      gaps: [
        [2000, 2400],
        [5100, 5300],
      ],
    })
    expect(gaps.result).toMatchObject({ reps: 4, endedBy: 'idle' })
    const gone = run({ reps: 4, after: 'gone' })
    expect(gone.result).toMatchObject({ reps: 4, endedBy: 'gone' })
  })

  it('reste bien cadré de bout en bout', () => {
    const played = run({ reps: 2 })
    const hints = played.snapshots.filter((snapshot) => snapshot.status !== 'ended').map((s) => s.hint)
    expect(hints.every((hint) => hint === null)).toBe(true)
    // Tractions : moyenne des deux bras ; dips : le côté le mieux vu (le plus près du téléphone).
    expect(played.snapshots[30]!.debug.side).toBe(movement === 'pullup' ? 'both' : 'left')
  })
})

describe('createRepCounter : dernière répétition refusée', () => {
  // Curls alternés de MM-Fit ; à la dernière répétition, les coudes partent sur le côté (bras balancé).
  const fixture = loadRepFixture('mmfit-curls-w05-21')
  const real = decodeFixture(fixture)
  const counted = play(real, { variant: variant('curl') }).result
  /** Coudes à hauteur d'épaule, sur le côté, à partir de `from`. */
  const swung = (from: number) =>
    real.map((frame) => {
      const image = frame.image
      if (frame.t <= from || !image) return frame
      const out = (elbow: number, shoulder: number, dx: number): ImagePoint => [
        image[shoulder]![0] + dx,
        image[shoulder]![1] + 0.01,
        image[elbow]![2],
      ]
      const moved = [...image]
      moved[13] = out(13, 11, 0.1)
      moved[14] = out(14, 12, -0.1)
      return { ...frame, image: moved }
    })

  it('une dernière répétition refusée (bras balancé) rend le compte à vérifier', () => {
    expect([counted.reps, counted.confident]).toEqual([10, true])
    const played = play(swung(counted.repTimes[8]!), { variant: variant('curl') })
    expect(played.events.at(-1)).toMatchObject({ kind: 'rejected', why: 'posture' })
    expect(played.result).toMatchObject({ reps: 9, rejected: 1, confident: false, reasons: ['rejected'] })
  })

  it('compte tous les refus : avant la dernière répétition gardée et après', () => {
    const played = play(
      synthSet({ movement: 'squat', reps: [{}, { durationMs: 450 }, {}, { durationMs: 20_000 }], ...STAY }),
    )
    expect(played.events.filter((event) => event.kind === 'rejected')).toEqual([
      expect.objectContaining({ why: 'fast' }),
      expect.objectContaining({ why: 'slow' }),
    ])
    expect(played.result).toMatchObject({ reps: 2, rejected: 2, confident: false })
  })

  it('une flexion éclair après la série n’en fait pas une répétition ratée', () => {
    const played = play(synthSet({ movement: 'squat', reps: [{}, {}, {}, { durationMs: 450 }], ...STAY }))
    expect(played.events.at(-1)).toMatchObject({ kind: 'rejected', why: 'fast' })
    expect(played.result).toMatchObject({ reps: 3, rejected: 0, confident: true })
  })
})

describe('createRepCounter : mouvement hors série', () => {
  // Trois squats, puis la personne fait quelques pas et se baisse pour ramasser quelque chose (MM-Fit w17,
  // série 1) : ses pieds ont bougé depuis la dernière répétition, ce n'est pas un squat de plus.
  const frames = synthSet({
    movement: 'squat',
    reps: [{}, {}, { pauseMs: 3000 }, {}],
    walk: { at: 9000, metres: 0.5, durationMs: 1500 },
    ...STAY,
  })

  it('ne compte pas un dernier mouvement fait après quelques pas, et reste sûr de son compte', () => {
    const played = play(frames)
    expect(played.result).toMatchObject({ reps: 3, confident: true, rejected: 0, endedBy: 'idle' })
    expect(played.events.filter((event) => event.kind === 'rejected')).toEqual([
      expect.objectContaining({ why: 'anchor' }),
    ])
  })

  it('le compterait si les pieds pouvaient bouger entre deux répétitions', () => {
    expect(play(frames, { spec: { anchorFixed: false } }).result.reps).toBe(4)
  })
})

describe('createRepCounter : réglages', () => {
  it('prend les seuils et réglages donnés', () => {
    const frames = synthSet({ movement: 'squat', reps: [{ depth: 0.62 }, { depth: 0.62 }, { depth: 0.62 }] })
    expect(play(frames).result).toMatchObject({ reps: 0, partials: 3 })
    // Squats peu profonds : les hanches descendent aussi moins.
    expect(play(frames, { spec: { flexed: 125 } }).events.map((event) => event.kind)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ])
    expect(play(frames, { spec: { flexed: 125, minTravel: 0.1 } }).result.reps).toBe(3)
    const params: Partial<CounterParams> = { armMs: 3000 }
    expect(play(frames, { params }).statuses[2]).toEqual(['counting', 3000])
    expect(play(frames, { params: { minVisibility: 0.99 } }).statuses).toEqual([
      ['searching', Number.NEGATIVE_INFINITY],
    ])
  })
})
