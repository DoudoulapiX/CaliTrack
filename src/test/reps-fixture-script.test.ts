import { decodeFixture, encodeFixture, repFixtureSchema, type FixtureMeta } from '@/content/reps/fixture'
import type { RepCounter, RepCounterOptions } from '@/content/reps/rep-counter'
import type { CounterSnapshot, PoseFrame } from '@/content/reps/types'
import {
  AFTER_LAST_FRAME_MS,
  DEFAULT_LICENCE,
  estimatorName,
  ffmpegArgs,
  fixtureVariant,
  frameTime,
  framesFromDetections,
  parseJob,
  replayAll,
  replayFixture,
  summaryLines,
  traceFixture,
  UsageError,
  USAGE,
  videoFixture,
  type Detection,
  type TraceJob,
  type VideoJob,
} from '../../scripts/reps-fixture.ts'
import { counterResult, counterSnapshot, emptyFrame } from './pose'

/*
 * npm run reps:add (scripts/reps-fixture.ts) : la commande, l'extraction des images et le fichier écrit. Le
 * passage dans MediaPipe (Chromium) se vérifie en lançant la commande sur une vraie vidéo.
 */

const VIDEO = '/videos/tractions-1.MOV'

function seenFrame(t: number, width = 640, height = 360): PoseFrame {
  return {
    t,
    width,
    height,
    image: Array.from({ length: 33 }, (_, joint) => [joint / 100, 0.5, 0.9] as const),
    world: Array.from({ length: 33 }, () => [0.1, -0.2, 0.3] as const),
  }
}

/** Un fichier exporté par l'appli (« Exporter les points de la série »). */
function exported(patch: Partial<FixtureMeta> = {}) {
  return encodeFixture(
    {
      name: 'calitrack-points-pullup-2026-10-21-1130',
      movement: 'pullup',
      exerciseId: 'pullup',
      kind: 'set',
      expected: { reps: 7 },
      split: 'check',
      source: 'Compteur caméra de CaliTrack, Tractions, 2026-10-21 11:30',
      licence: 'À préciser avant d’ajouter le fichier au dépôt',
      estimator: 'mediapipe-0.10.35-lite-cpu',
      fps: 15,
      width: 640,
      height: 480,
      ...patch,
    },
    [seenFrame(0, 640, 480), emptyFrame(67), seenFrame(133, 640, 480)],
  )
}

function usageError(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    if (error instanceof UsageError) return error.message
    throw error
  }
  throw new Error('Pas d’erreur')
}

describe('reps:add : la commande', () => {
  it('lit une série filmée, coupée, avec son compte', () => {
    const job = parseJob([
      '--video',
      VIDEO,
      '--movement',
      'pullup',
      '--exercise',
      'pullup',
      '--reps',
      '8',
      '--name',
      'charles-pullup-1',
      '--start',
      '2',
      '--end',
      '31,5',
    ])
    expect(job).toEqual({
      mode: 'video',
      video: VIDEO,
      start: 2,
      end: 31.5,
      name: 'charles-pullup-1',
      out: null,
      force: false,
      meta: {
        name: 'charles-pullup-1',
        movement: 'pullup',
        exerciseId: 'pullup',
        kind: 'set',
        expected: { reps: 8 },
        split: 'check',
        source: 'Vidéo tractions-1.MOV, de 2 s à 31,5 s',
        licence: DEFAULT_LICENCE,
      },
    })
    expect(DEFAULT_LICENCE).toBe('Charles, avec son accord')
  })

  it('déduit le mouvement d’un exercice compté', () => {
    const job = parseJob([
      '--video',
      VIDEO,
      '--exercise',
      'Dumbbell_Bicep_Curl',
      '--reps',
      '10',
      '--name',
      'curl-1',
    ])
    expect(job.mode === 'video' && job.meta.movement).toBe('curl')
  })

  it('décrit la coupe de la vidéo, ou prend la source, la licence et les notes données', () => {
    const base = ['--video', VIDEO, '--movement', 'squat', '--reps', '5', '--name', 'squat-1']
    const source = (args: string[]) => {
      const job = parseJob([...base, ...args])
      return job.mode === 'video' ? job.meta.source : null
    }
    expect(source([])).toBe('Vidéo tractions-1.MOV')
    expect(source(['--start', '2.5'])).toBe('Vidéo tractions-1.MOV, de 2,5 s à la fin')
    expect(source(['--end', '10'])).toBe('Vidéo tractions-1.MOV, du début à 10 s')
    const job = parseJob([
      ...base,
      '--source',
      'Salle du quartier',
      '--licence',
      'CC BY 4.0',
      '--notes',
      'Demi-répétitions exprès',
      '--split',
      'tune',
      '--out',
      'ailleurs',
      '--force',
    ])
    expect(job).toMatchObject({
      out: 'ailleurs',
      force: true,
      meta: {
        source: 'Salle du quartier',
        licence: 'CC BY 4.0',
        notes: 'Demi-répétitions exprès',
        split: 'tune',
      },
    })
  })

  it('lit un moment sans exercice compté (rien ne doit être compté)', () => {
    const job = parseJob(['--video', VIDEO, '--negative', '--name', 'marche-1'])
    expect(job).toMatchObject({
      mode: 'video',
      meta: { movement: null, exerciseId: null, kind: 'negative', expected: { reps: 0 } },
    })
    expect(parseJob(['--video', VIDEO, '--negative', '--reps', '0', '--name', 'marche-1'])).toEqual(job)
  })

  it('lit un fichier exporté par l’appli', () => {
    expect(parseJob(['--trace', '/tmp/points.json', '--name', 'charles-pullup-2'])).toEqual({
      mode: 'trace',
      trace: '/tmp/points.json',
      name: 'charles-pullup-2',
      reps: null,
      licence: DEFAULT_LICENCE,
      split: null,
      source: null,
      notes: null,
      out: null,
      force: false,
    })
    expect(parseJob(['--trace', 'p.json', '--name', 'a', '--reps', '8'])).toMatchObject({ reps: 8 })
  })

  it('montre le mode d’emploi', () => {
    expect(parseJob(['--help'])).toEqual({ mode: 'help' })
    expect(parseJob(['-h'])).toEqual({ mode: 'help' })
    expect(USAGE).toContain('--name charles-pullup-1')
    expect(USAGE).toContain(DEFAULT_LICENCE)
  })

  it('refuse une commande incomplète ou contradictoire, en disant pourquoi', () => {
    const set = ['--movement', 'squat', '--reps', '5']
    expect(usageError(() => parseJob(['--name', 'a']))).toBe('Il faut --video ou --trace (un seul des deux).')
    expect(usageError(() => parseJob(['--video', VIDEO, '--trace', 'p.json', '--name', 'a']))).toContain(
      'un seul des deux',
    )
    expect(usageError(() => parseJob(['--video', VIDEO, ...set]))).toContain('Il faut --name')
    expect(usageError(() => parseJob(['--video', VIDEO, ...set, '--name', 'Squat 1']))).toContain(
      'lettres minuscules',
    )
    expect(usageError(() => parseJob(['--video', VIDEO, ...set, '--name', 'a', '--vitesse', '2']))).toContain(
      'Commande mal comprise',
    )
    expect(usageError(() => parseJob(['--video', VIDEO, ...set, '--name', 'a', 'en-trop']))).toContain(
      'Commande mal comprise',
    )
    expect(
      usageError(() => parseJob(['--video', VIDEO, '--movement', 'lunge', '--reps', '5', '--name', 'a'])),
    ).toContain('--movement : squat, pushup, dip, pullup, curl')
    expect(
      usageError(() =>
        parseJob([
          '--video',
          VIDEO,
          '--movement',
          'squat',
          '--exercise',
          'pullup',
          '--reps',
          '5',
          '--name',
          'a',
        ]),
      ),
    ).toBe('--exercise pullup se compte comme pullup, pas squat.')
    expect(
      usageError(() => parseJob(['--video', VIDEO, '--exercise', 'pistol', '--reps', '5', '--name', 'a'])),
    ).toContain('Il faut --movement')
    expect(usageError(() => parseJob(['--video', VIDEO, '--movement', 'squat', '--name', 'a']))).toContain(
      'Il faut --reps',
    )
    expect(
      usageError(() => parseJob(['--video', VIDEO, '--movement', 'squat', '--reps', '8.5', '--name', 'a'])),
    ).toContain('--reps : un nombre entier')
    expect(
      usageError(() => parseJob(['--video', VIDEO, ...set, '--name', 'a', '--start', 'deux'])),
    ).toContain('--start : un nombre de secondes')
    expect(usageError(() => parseJob(['--video', VIDEO, ...set, '--name', 'a', '--end=-1']))).toContain(
      '--end : un nombre de secondes',
    )
    expect(
      usageError(() => parseJob(['--video', VIDEO, ...set, '--name', 'a', '--start', '5', '--end', '5'])),
    ).toBe('--end doit venir après --start.')
    expect(
      usageError(() => parseJob(['--video', VIDEO, ...set, '--name', 'a', '--split', 'test'])),
    ).toContain('--split : check ou tune')
    expect(
      usageError(() => parseJob(['--video', VIDEO, '--negative', '--movement', 'squat', '--name', 'a'])),
    ).toContain('ni --movement ni --exercise')
    expect(usageError(() => parseJob(['--video', VIDEO, '--negative', '--reps', '3', '--name', 'a']))).toBe(
      '--negative : le compte attendu est 0.',
    )
    expect(usageError(() => parseJob(['--trace', 'p.json', '--name', 'a', '--start', '2']))).toBe(
      '--start ne sert qu’avec --video.',
    )
  })
})

describe('reps:add : images de la vidéo', () => {
  it('demande à ffmpeg 15 images par seconde, plus grand côté 640 px, sans le son', () => {
    expect(ffmpegArgs({ video: VIDEO, start: 2, end: 31.5 }, '/tmp/images')).toEqual([
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      '2',
      '-to',
      '31.5',
      '-i',
      VIDEO,
      '-an',
      '-vf',
      'fps=15,scale=w=640:h=640:force_original_aspect_ratio=decrease',
      '-q:v',
      '3',
      '/tmp/images/%05d.jpg',
    ])
    const whole = ffmpegArgs({ video: VIDEO, start: null, end: null }, '/tmp/images')
    expect(whole).not.toContain('-ss')
    expect(whole).not.toContain('-to')
  })

  it('date chaque image à i × 1000 / 15 ms', () => {
    expect([0, 1, 2, 15, 16].map((index) => frameTime(index))).toEqual([0, 67, 133, 1000, 1067])
    expect(frameTime(3, 10)).toBe(300)
  })

  it('fait des images analysées de ce que rend MediaPipe, personne vue ou non', () => {
    const detections: Detection[] = [
      { image: [[0.5, 0.25, 0.9]], world: [[0.1, -0.2, 0.3]], ms: 30 },
      { image: null, world: null, ms: 28 },
    ]
    expect(framesFromDetections(detections, 640, 360)).toEqual([
      { t: 0, width: 640, height: 360, image: [[0.5, 0.25, 0.9]], world: [[0.1, -0.2, 0.3]] },
      { t: 67, width: 640, height: 360, image: null, world: null },
    ])
  })

  it('écrit un fichier de points valide, au format des autres', () => {
    const job = parseJob([
      '--video',
      VIDEO,
      '--movement',
      'pullup',
      '--reps',
      '8',
      '--name',
      'charles-pullup-1',
    ]) as VideoJob
    const frames = [seenFrame(0), emptyFrame(67, 640, 360), seenFrame(133)]
    const fixture = videoFixture(job, frames, '0.10.35')
    expect(repFixtureSchema.safeParse(fixture).success).toBe(true)
    expect(fixture).toMatchObject({
      name: 'charles-pullup-1',
      estimator: 'mediapipe-0.10.35-lite-cpu',
      fps: 15,
      width: 640,
      height: 360,
      kind: 'set',
      expected: { reps: 8 },
    })
    expect(fixture.frames.map(([t]) => t)).toEqual([0, 67, 133])
    expect(decodeFixture(fixture)[0]?.image?.[11]).toEqual([0.11, 0.5, 0.9])
    expect(estimatorName('0.10.36')).toBe('mediapipe-0.10.36-lite-cpu')
  })
})

describe('reps:add : fichier exporté par l’appli', () => {
  const job = (args: string[] = []) =>
    parseJob(['--trace', '/tmp/x.json', '--name', 'charles-pullup-2', ...args]) as TraceJob

  it('le renomme et remplace la licence à préciser, sans toucher aux points', () => {
    const raw = exported()
    const fixture = traceFixture(job(), JSON.parse(JSON.stringify(raw)))
    expect(fixture).toEqual({ ...raw, name: 'charles-pullup-2', licence: DEFAULT_LICENCE })
    expect(repFixtureSchema.safeParse(fixture).success).toBe(true)
  })

  it('prend le vrai compte, la coupe, la source et les notes données', () => {
    const fixture = traceFixture(
      job(['--reps', '8', '--split', 'tune', '--source', 'Salle', '--notes', 'Compté 7', '--licence', 'CC0']),
      exported(),
    )
    expect(fixture).toMatchObject({
      expected: { reps: 8 },
      split: 'tune',
      source: 'Salle',
      notes: 'Compté 7',
      licence: 'CC0',
    })
  })

  it('refuse un fichier qui n’est pas un fichier de points, ou un compte impossible', () => {
    expect(usageError(() => traceFixture(job(), { format: 2 }))).toContain(
      'x.json n’est pas un fichier de points du compteur',
    )
    const negative = exported({ movement: null, exerciseId: null, kind: 'negative', expected: { reps: 0 } })
    expect(usageError(() => traceFixture(job(['--reps', '3']), negative))).toBe(
      'Ce fichier ne compte rien : --reps doit être 0.',
    )
  })
})

describe('reps:add : le compteur rejoue le fichier', () => {
  it('compte avec la variante de l’exercice, sinon celle de base', () => {
    const fixture = exported({ movement: 'curl', exerciseId: 'Barbell_Curl' })
    expect(fixtureVariant(fixture, 'curl')).toEqual({ movement: 'curl', overrides: { bothArms: true } })
    expect(fixtureVariant(fixture, 'squat')).toEqual({ movement: 'squat', overrides: {} })
    expect(fixtureVariant(exported({ exerciseId: null }), 'pullup')).toEqual({
      movement: 'pullup',
      overrides: {},
    })
  })

  /** Un compteur qui note ce qu'il reçoit, et finit quand on le lui dit. */
  function recordingCounter(endAfter: { push?: number; tick?: number } = {}) {
    const pushed: number[] = []
    const ticks: number[] = []
    const finished: [number, string][] = []
    let ended = false
    const snapshot: CounterSnapshot = counterSnapshot()
    const counter: RepCounter = {
      push(frame) {
        pushed.push(frame.t)
        if (pushed.length === endAfter.push) ended = true
        return snapshot
      },
      tick(t) {
        ticks.push(t)
        if (ticks.length === endAfter.tick) ended = true
        return snapshot
      },
      finish(t, why) {
        finished.push([t, why])
        return counterResult({ endedBy: why })
      },
      get result() {
        return ended ? counterResult({ reps: 3, endedBy: 'idle' }) : null
      },
      get snapshot() {
        return snapshot
      },
    }
    const created: RepCounterOptions[] = []
    const create = (options: RepCounterOptions) => {
      created.push(options)
      return counter
    }
    return { create, created, pushed, ticks, finished }
  }

  it('pousse chaque image, laisse passer 25 s, puis termine la série', () => {
    const fixture = exported()
    const counter = recordingCounter()
    const result = replayFixture(fixture, { movement: 'pullup', overrides: {} }, counter.create)
    expect(counter.created).toEqual([{ variant: { movement: 'pullup', overrides: {} } }])
    expect(counter.pushed).toEqual([0, 67, 133])
    expect(counter.ticks[0]).toBe(200)
    expect(counter.ticks[counter.ticks.length - 1]).toBe(133 + AFTER_LAST_FRAME_MS)
    expect(counter.ticks).toHaveLength(375)
    expect(counter.finished).toEqual([[133 + AFTER_LAST_FRAME_MS, 'manual']])
    expect(result.endedBy).toBe('manual')
  })

  it('s’arrête dès que le compteur termine de lui-même', () => {
    const early = recordingCounter({ push: 2 })
    expect(replayFixture(exported(), { movement: 'pullup', overrides: {} }, early.create).reps).toBe(3)
    expect(early.pushed).toHaveLength(2)
    expect(early.ticks).toEqual([])

    const idle = recordingCounter({ tick: 10 })
    expect(replayFixture(exported(), { movement: 'pullup', overrides: {} }, idle.create).endedBy).toBe('idle')
    expect(idle.ticks).toHaveLength(10)
    expect(idle.finished).toEqual([])
  })

  it('avec le vrai compteur : rien de compté quand personne n’est vu', () => {
    const fixture = encodeFixture(
      { ...exported(), movement: null, exerciseId: null, kind: 'negative', expected: { reps: 0 } },
      [emptyFrame(0), emptyFrame(67)],
    )
    const replays = replayAll(fixture)
    expect(replays.map(({ movement }) => movement)).toEqual(['squat', 'pushup', 'dip', 'pullup', 'curl'])
    for (const { result } of replays) {
      expect(result.reps).toBe(0)
      expect(result.endedBy).toBe('manual')
    }
    expect(replayAll(exported())).toHaveLength(1)
  })

  it('résume le fichier écrit et ce que compte le compteur', () => {
    const fixture = exported()
    const lines = summaryLines('src/test/reps/charles-pullup-2.json', fixture, [
      { movement: 'pullup', result: counterResult({ reps: 7, confident: true }) },
    ])
    expect(lines).toEqual([
      'src/test/reps/charles-pullup-2.json écrit : 3 images (15 par seconde, 640 × 480), silhouette trouvée sur 2 (67 %).',
      'Attention : silhouette trouvée sur moins de 90 % des images. Vérifie le cadrage (corps entier) et la lumière.',
      'Compteur, tractions : 7 répétitions comptées sur 7 attendues, sûr, fin : idle.',
      'Le compteur trouve le compte attendu.',
    ])
    const seen = encodeFixture({ ...fixture, expected: { reps: 1 } }, [seenFrame(0, 640, 480)])
    expect(
      summaryLines('f.json', seen, [
        {
          movement: 'squat',
          result: counterResult({
            reps: 0,
            confident: false,
            reasons: ['fewReps', 'trial'],
            endedBy: 'manual',
          }),
        },
      ]),
    ).toEqual([
      'f.json écrit : 1 image (15 par seconde, 640 × 480), silhouette trouvée sur 1 (100 %).',
      'Compteur, squats : 0 répétition comptée sur 1 attendue, à vérifier (fewReps, trial), fin : manual.',
      'Écart avec le compte attendu : règle src/content/reps/specs.ts (jamais expected), puis npm run reps:eval.',
    ])
  })
})
