import { createArmMerger, createRepTracker, type TrackerEvent, type TrackerInput } from './rep-tracker'
import { COUNTER_PARAMS, SPECS } from './specs'

const SPEC = SPECS.squat // en haut ≥ 150, en bas ≤ 120, demi-répétition ≤ 135, 600 ms au moins
const TOP = 175

/** Les deux pieds à leur place. */
const FEET: TrackerInput['anchors'] = [
  [180, 600],
  [220, 600],
]

/** Une image : les pieds restent en place, la partie qui bouge descend avec la mesure (buste 100 px). */
function input(t: number, value: number, patch: Partial<TrackerInput> = {}): TrackerInput {
  return {
    t,
    value,
    posture: true,
    hipX: 200,
    ankleX: 200,
    torso: 100,
    anchors: FEET,
    mover: [200, 300 + (TOP - value)],
    ...patch,
  }
}

/** Une répétition en cosinus de TOP jusqu'à `low` et retour, à `fps` images par seconde. */
function rep(from: number, durationMs: number, low: number, fps = 15): [number, number][] {
  const step = 1000 / fps
  const samples: [number, number][] = []
  for (let t = from; t <= from + durationMs; t += step) {
    const progress = (t - from) / durationMs
    samples.push([Math.round(t), TOP - ((TOP - low) * (1 - Math.cos(2 * Math.PI * progress))) / 2])
  }
  return samples
}

/** En haut, immobile, de `from` à `to`. */
function still(from: number, to: number, fps = 15): [number, number][] {
  const samples: [number, number][] = []
  for (let t = from; t < to; t += 1000 / fps) samples.push([Math.round(t), TOP])
  return samples
}

function run(
  samples: readonly [number, number][],
  patch: (t: number, value: number) => Partial<TrackerInput> = () => ({}),
  spec = SPEC,
): TrackerEvent[] {
  const tracker = createRepTracker(spec, COUNTER_PARAMS)
  const events: TrackerEvent[] = []
  for (const [t, value] of samples) {
    const event = tracker.step(input(t, value, patch(t, value)))
    if (event) events.push(event)
  }
  return events
}

describe('createRepTracker', () => {
  it('compte une répétition complète en remontant', () => {
    const tracker = createRepTracker(SPEC, COUNTER_PARAMS)
    expect(tracker.phase).toBe('unknown')
    expect(tracker.value).toBeNull()
    const phases = new Set<string>()
    let event: TrackerEvent | null = null
    for (const [t, value] of [...still(0, 500), ...rep(500, 2000, 85)]) {
      event = tracker.step(input(t, value)) ?? event
      phases.add(tracker.phase)
    }
    expect([...phases]).toEqual(['top', 'down', 'bottom'])
    expect(tracker.phase).toBe('top')
    expect(event).toMatchObject({ kind: 'rep' })
    // Comptée en remontant, avant la fin de la répétition.
    expect(event!.t).toBeGreaterThan(2000)
    expect(event!.t).toBeLessThan(2500)
    expect((event as { durationMs: number }).durationMs).toBeGreaterThan(1000)
  })

  it('attend d’avoir vu le haut : une série prise en bas ne compte pas la première remontée', () => {
    const samples = [
      ...rep(-1000, 2000, 85).filter(([t]) => t >= 0),
      ...still(1000, 1500),
      ...rep(1500, 2000, 85),
    ]
    expect(run(samples).map((event) => event.kind)).toEqual(['rep'])
  })

  it('montre une demi-répétition sans la compter, ignore un petit mouvement', () => {
    expect(run([...still(0, 500), ...rep(500, 2000, 130)]).map((event) => event.kind)).toEqual(['partial'])
    expect(run([...still(0, 500), ...rep(500, 2000, 140)])).toEqual([])
  })

  it('refuse une répétition trop rapide ou trop lente', () => {
    expect(run([...still(0, 500), ...rep(500, 450, 60, 30), ...still(1000, 2000, 30)])).toMatchObject([
      { kind: 'rejected', why: 'fast' },
    ])
    expect(run([...still(0, 500), ...rep(500, 20_000, 85)])).toMatchObject([
      { kind: 'rejected', why: 'slow' },
    ])
  })

  it('refuse une image isolée aberrante', () => {
    const glitch: [number, number][] = [...still(0, 1000), [1000, 60], [1067, 60], ...still(1133, 2000)]
    const events = run(glitch)
    expect(events.every((event) => event.kind !== 'rep')).toBe(true)
  })

  it('refuse la position perdue, le déplacement, l’appui qui bouge, une course trop courte', () => {
    const samples = [...still(0, 500), ...rep(500, 2000, 85)]
    expect(run(samples, (t) => ({ posture: t < 900 }))).toMatchObject([{ kind: 'rejected', why: 'posture' }])
    expect(run(samples, (t) => ({ hipX: 200 + (t - 500) * 0.05 }))).toMatchObject([{ why: 'drift' }])
    expect(run(samples, (t) => ({ ankleX: 200 + (t - 500) * 0.04 }))).toMatchObject([{ why: 'drift' }])
    // Un seul pied qui bouge suffit (chaque côté est suivi à part).
    expect(run(samples, (t) => ({ anchors: [[180, 600 + (t - 500) * 0.04], FEET[1]] }))).toMatchObject([
      { why: 'anchor' },
    ])
    expect(run(samples, () => ({ mover: [200, 300] }))).toMatchObject([{ why: 'travel' }])
    expect(run(samples, () => ({ mover: null }))).toMatchObject([{ why: 'travel' }])
    // Point d'appui pas vu au départ : il sert dès qu'il apparaît.
    expect(run(samples, (t) => ({ anchors: t < 1000 ? [null, null] : FEET }))).toMatchObject([
      { kind: 'rep' },
    ])
    // Un pied qui disparaît un moment ne compte pas comme un pied qui bouge.
    expect(run(samples, (t) => ({ anchors: t > 1000 && t < 1500 ? [FEET[0], null] : FEET }))).toMatchObject([
      { kind: 'rep' },
    ])
  })

  it('pieds au sol : mesurés depuis la fin du mouvement précédent, pas seulement pendant la répétition', () => {
    // Deux répétitions ; entre les deux, en haut, la personne fait un pas (pied gauche 60 px plus loin).
    const samples = [...still(0, 500), ...rep(500, 2000, 85), ...still(2567, 4000), ...rep(4000, 2000, 85)]
    const step = (t: number): Partial<TrackerInput> => ({
      anchors: t < 3000 ? FEET : [[240, 600], FEET[1]],
    })
    expect(run(samples, step).map((event) => event.kind)).toEqual(['rep', 'rejected'])
    expect(run(samples, step)[1]).toMatchObject({ why: 'anchor' })
    // Coude des curls : il peut bouger entre deux répétitions.
    expect(run(samples, step, { ...SPEC, anchorFixed: false }).map((event) => event.kind)).toEqual([
      'rep',
      'rep',
    ])
    // Après un trou d'images, la place de référence repart du début de la répétition (le trou est signalé).
    const gap = samples.filter(([t]) => t < 2800 || t > 3700)
    expect(run(gap, step).map((event) => event.kind)).toEqual(['rep', 'lost', 'rep'])
  })

  it('ne compte pas à cheval sur un trou d’images, mais supporte un court trou', () => {
    const samples = [...still(0, 500), ...rep(500, 2000, 85)]
    const longGap = samples.filter(([t]) => t < 1200 || t > 2000)
    expect(run(longGap).filter((event) => event.kind === 'rep')).toEqual([])
    // 400 ms sans image pendant la descente : la durée part du milieu du trou, la répétition compte.
    const shortGap = samples.filter(([t]) => t < 800 || t > 1200)
    expect(run(shortGap)).toMatchObject([{ kind: 'rep' }])
  })

  it('signale un trou d’images assez long pour qu’une répétition s’y perde, où qu’il tombe', () => {
    const samples = [...still(0, 500), ...rep(500, 2000, 85), ...still(2567, 5000)]
    const after = (t: number) => samples.find(([time]) => time > t)![0]
    // Pendant la répétition : perdue, et dite perdue à la première image après le trou.
    const during = run(samples.filter(([t]) => t < 1200 || t > 2000))
    expect(during[0]).toEqual({ kind: 'lost', t: after(2000) })
    expect(during.some((event) => event.kind === 'rep')).toBe(false)
    // En haut, avant ou après : une répétition entière (600 ms au moins) a pu se faire sans être vue.
    expect(run(samples.filter(([t]) => t < 3000 || t > 3800))).toEqual([
      expect.objectContaining({ kind: 'rep' }),
      { kind: 'lost', t: after(3800) },
    ])
    // Un trou avant d'avoir vu le haut ne cache rien de compté.
    const unknown = rep(-1000, 2000, 85).filter(([t]) => t >= 0 && (t < 300 || t > 1200))
    expect(run(unknown)).toEqual([])
    // Trou de gapResetMs tout juste : rien ; une milliseconde de plus : signalé.
    const edge = (gap: number): [number, number][] => [
      ...still(0, 500),
      ...rep(500, 2000, 85),
      [2600, TOP],
      [2600 + gap, TOP],
    ]
    expect(run(edge(COUNTER_PARAMS.gapResetMs)).map((event) => event.kind)).toEqual(['rep'])
    expect(run(edge(COUNTER_PARAMS.gapResetMs + 1)).map((event) => event.kind)).toEqual(['rep', 'lost'])
  })

  it('repris en pleine série, dit perdu le mouvement de quelqu’un qui n’est pas en haut', () => {
    const resumed = (samples: readonly [number, number][]) => {
      const tracker = createRepTracker(SPEC, COUNTER_PARAMS, { resumed: true })
      return samples.map(([t, value]) => tracker.step(input(t, value))).filter((event) => event !== null)
    }
    // En plein mouvement : perdu, une seule fois ; la répétition suivante compte.
    const midway = [
      ...rep(0, 2000, 85).filter(([t]) => t >= 600),
      ...still(2067, 2500),
      ...rep(2500, 2000, 85),
    ]
    expect(resumed(midway).map((event) => event.kind)).toEqual(['lost', 'rep'])
    expect(resumed(midway)[0]).toEqual({ kind: 'lost', t: 600 })
    // En haut : rien de perdu.
    expect(resumed([...still(0, 500), ...rep(500, 2000, 85)]).map((event) => event.kind)).toEqual(['rep'])
    // Sans `resumed` (début de série), rien n'est signalé.
    expect(run(midway).map((event) => event.kind)).toEqual(['rep'])
  })

  it('barre : les deux bras doivent plier, sinon demi-répétition', () => {
    const samples = [...still(0, 500), ...rep(500, 2000, 85)]
    expect(run(samples, (_, value) => ({ pair: Math.max(value, 140) }))).toMatchObject([{ kind: 'partial' }])
    expect(run(samples, (_, value) => ({ pair: value + 10 }))).toMatchObject([{ kind: 'rep' }])
    expect(run(samples, () => ({ pair: null }))).toMatchObject([{ kind: 'rep' }])
  })

  it('lisse la mesure', () => {
    const tracker = createRepTracker(SPEC, COUNTER_PARAMS)
    tracker.step(input(0, 170))
    tracker.step(input(80, 100))
    expect(tracker.value).toBeCloseTo(170 - 70 * (1 - Math.exp(-1)))
  })
})

describe('createArmMerger', () => {
  it('fait une seule répétition de deux bras qui finissent ensemble', () => {
    const merger = createArmMerger(COUNTER_PARAMS.perArmMergeMs)
    expect(merger.add(0, 1000)).toBe(true)
    expect(merger.add(1, 1500)).toBe(false)
    expect(merger.add(1, 3000)).toBe(true)
    expect(merger.add(0, 3699)).toBe(false)
  })

  it('compte chaque bras quand ils alternent', () => {
    const merger = createArmMerger(700)
    expect([merger.add(0, 1000), merger.add(1, 2500), merger.add(0, 4000), merger.add(1, 5500)]).toEqual([
      true,
      true,
      true,
      true,
    ])
    merger.reset()
    expect(merger.add(1, 5600)).toBe(true)
  })
})
