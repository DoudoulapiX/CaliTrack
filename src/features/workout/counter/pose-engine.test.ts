import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PoseLandmarkerOptions, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { encodeFixture } from '@/content/reps/fixture'
import { stubCanvas2d } from '@/test/pose'
import {
  loadPoseEngine,
  openPoseEngine,
  POSE_OPTIONS,
  PoseEngineError,
  toPoseFrame,
  type PoseEngineProblem,
} from './pose-engine'

const vision = vi.hoisted(() => ({
  isSimdSupported: vi.fn<() => Promise<boolean>>(),
  createFromOptions: vi.fn<(fileset: unknown, options: unknown) => Promise<unknown>>(),
}))

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { isSimdSupported: vision.isSimdSupported },
  PoseLandmarker: { createFromOptions: vision.createFromOptions },
}))

const root = process.cwd()
const PACKAGE = join(root, 'node_modules/@mediapipe/tasks-vision')

type Quiet = { print: (text: string) => void; printErr: (text: string) => void }

const NOBODY = { landmarks: [], worldLandmarks: [] }
const SOMEONE = {
  landmarks: [Array.from({ length: 33 }, (_, i) => ({ x: i / 100, y: 1 - i / 100, z: 0, visibility: 0.9 }))],
  worldLandmarks: [Array.from({ length: 33 }, (_, i) => ({ x: i, y: -i, z: i / 2, visibility: 0.9 }))],
}

/** Un faux PoseLandmarker ; il note le `Module` posé au moment de sa création. */
function fakeLandmarker(result: Pick<PoseLandmarkerResult, 'landmarks' | 'worldLandmarks'> = NOBODY) {
  return {
    detectForVideo: vi.fn((_source: unknown, _t: number) => result),
    close: vi.fn(),
  }
}

const modules: (Quiet | undefined)[] = []

function creates(...outcomes: (ReturnType<typeof fakeLandmarker> | Error)[]) {
  for (const outcome of outcomes) {
    vision.createFromOptions.mockImplementationOnce(() => {
      const holder = globalThis as { Module?: Quiet }
      modules.push(holder.Module)
      // Le chargeur d'Emscripten lit Module une fois, puis l'efface.
      delete holder.Module
      return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome)
    })
  }
}

function optionsOfCall(index: number): PoseLandmarkerOptions {
  return vision.createFromOptions.mock.calls[index]?.[1] as PoseLandmarkerOptions
}

async function problemOf(promise: Promise<unknown>): Promise<PoseEngineProblem | null> {
  try {
    await promise
    return null
  } catch (error) {
    expect(error).toBeInstanceOf(PoseEngineError)
    return (error as PoseEngineError).problem
  }
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

beforeEach(() => {
  stubCanvas2d()
  modules.length = 0
  vision.isSimdSupported.mockReset().mockResolvedValue(true)
  vision.createFromOptions.mockReset()
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__calitrackPoseReplay')
})

describe('MediaPipe et son modèle', () => {
  it('restent en 0.10.35, la dernière version qui n’envoie rien à Google', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as { version: string }
    expect(pkg.version).toBe('0.10.35')
    const bundle = readFileSync(join(PACKAGE, 'vision_bundle.mjs'), 'utf8')
    expect(bundle).not.toContain('odml.pa.googleapis.com')
    // Seule mention de Google : un nom de type protobuf, jamais appelé.
    expect([...new Set(bundle.match(/[\w.-]*googleapis\.com/g))]).toEqual(['type.googleapis.com'])
  })

  it('a le bon modèle « lite »', () => {
    const model = readFileSync(join(root, 'src/assets/pose/pose_landmarker_lite.task'))
    expect(model.length).toBe(5_777_746)
    expect(createHash('sha256').update(model).digest('hex')).toBe(
      '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a',
    )
  })
})

describe('loadPoseEngine', () => {
  it('crée le moteur avec les fichiers de l’appli, sur le processeur, en mode vidéo', async () => {
    const landmarker = fakeLandmarker()
    creates(landmarker)
    const engine = await loadPoseEngine()
    expect(engine.delegate).toBe('CPU')
    const [fileset] = vision.createFromOptions.mock.calls[0] ?? []
    expect(fileset).toEqual({
      wasmLoaderPath: expect.stringMatching(/vision_wasm_internal\.js$/) as unknown,
      wasmBinaryPath: expect.stringMatching(/vision_wasm_internal\.wasm$/) as unknown,
    })
    const options = optionsOfCall(0)
    expect(options).toMatchObject({
      baseOptions: { delegate: 'CPU' },
      runningMode: 'VIDEO',
      outputSegmentationMasks: false,
      ...POSE_OPTIONS,
    })
    expect(options.baseOptions?.modelAssetPath).toMatch(/pose_landmarker_lite\.task$/)
    expect(options.canvas).toBeInstanceOf(HTMLCanvasElement)
    expect(POSE_OPTIONS).toEqual({
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })
  })

  it('fait taire la ligne INFO du WebAssembly avant chaque création, et garde le reste en avertissement', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    creates(new Error('pas de WebGL'), fakeLandmarker())
    await loadPoseEngine({ delegate: 'GPU' })
    expect(modules).toHaveLength(2)
    expect(modules.every(Boolean)).toBe(true)
    const quiet = modules[1]!
    quiet.print('sortie')
    quiet.printErr('INFO: Created TensorFlow Lite XNNPACK delegate for CPU.')
    expect(warn).not.toHaveBeenCalled()
    quiet.printErr('E0000 graphe cassé')
    expect(warn).toHaveBeenCalledWith('E0000 graphe cassé')
  })

  it('fait une première analyse à blanc', async () => {
    const landmarker = fakeLandmarker()
    creates(landmarker)
    await loadPoseEngine()
    expect(landmarker.detectForVideo).toHaveBeenCalledTimes(1)
    const [source, t] = landmarker.detectForVideo.mock.calls[0] ?? []
    expect(source).toBeInstanceOf(HTMLCanvasElement)
    expect([(source as HTMLCanvasElement).width, (source as HTMLCanvasElement).height]).toEqual([64, 64])
    expect(t).toBe(0)
  })

  it('refuse un téléphone sans WebAssembly SIMD', async () => {
    vision.isSimdSupported.mockResolvedValue(false)
    expect(await problemOf(loadPoseEngine())).toBe('unsupported')
    expect(vision.createFromOptions).not.toHaveBeenCalled()
  })

  it('signale un moteur qui ne se charge pas', async () => {
    const failure = new Error('fichier introuvable')
    creates(failure)
    const error = await loadPoseEngine().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PoseEngineError)
    expect(error).toMatchObject({ problem: 'load', cause: failure })
    vision.isSimdSupported.mockRejectedValue(new Error('hors ligne'))
    expect(await problemOf(loadPoseEngine())).toBe('load')
  })

  it('repasse au processeur quand la puce graphique échoue', async () => {
    const gpu = fakeLandmarker()
    gpu.detectForVideo.mockImplementation(() => {
      throw new Error('contexte WebGL perdu')
    })
    creates(gpu, fakeLandmarker())
    const engine = await loadPoseEngine({ delegate: 'GPU' })
    expect(engine.delegate).toBe('CPU')
    expect(gpu.close).toHaveBeenCalledTimes(1)
    expect([optionsOfCall(0).baseOptions?.delegate, optionsOfCall(1).baseOptions?.delegate]).toEqual([
      'GPU',
      'CPU',
    ])

    creates(fakeLandmarker())
    expect((await loadPoseEngine({ delegate: 'GPU' })).delegate).toBe('GPU')
  })

  it('rend des temps strictement croissants et la taille de l’image', async () => {
    const landmarker = fakeLandmarker(SOMEONE)
    creates(landmarker)
    const engine = await loadPoseEngine()
    const video = document.createElement('video')
    vi.spyOn(video, 'videoWidth', 'get').mockReturnValue(480)
    vi.spyOn(video, 'videoHeight', 'get').mockReturnValue(640)
    expect(engine.detect(video, 100.4)).toMatchObject({ t: 100, width: 480, height: 640 })
    expect(engine.detect(video, 100).t).toBe(101)
    expect(engine.detect(canvasOf(320, 240), 50)).toMatchObject({ t: 102, width: 320, height: 240 })
    expect(landmarker.detectForVideo.mock.calls.map(([, t]) => t)).toEqual([0, 100, 101, 102])
  })

  it('se ferme une seule fois, puis refuse d’analyser', async () => {
    const landmarker = fakeLandmarker()
    creates(landmarker)
    const engine = await loadPoseEngine()
    engine.close()
    engine.close()
    expect(landmarker.close).toHaveBeenCalledTimes(1)
    expect(() => engine.detect(canvasOf(10, 10), 10)).toThrow()
  })
})

describe('toPoseFrame', () => {
  it('garde la première personne : points sur l’image et dans l’espace', () => {
    const frame = toPoseFrame(SOMEONE, 42, 480, 640)
    expect(frame).toMatchObject({ t: 42, width: 480, height: 640 })
    expect(frame.image).toHaveLength(33)
    expect(frame.image?.[10]).toEqual([0.1, 0.9, 0.9])
    expect(frame.world?.[10]).toEqual([10, -10, 5])
  })

  it('rend null quand personne n’est vu, et une visibilité absente à 0', () => {
    expect(toPoseFrame(NOBODY, 1, 640, 480)).toEqual({
      t: 1,
      width: 640,
      height: 480,
      image: null,
      world: null,
    })
    const noVisibility = {
      landmarks: [[{ x: 0.5, y: 0.5, z: 0, visibility: undefined as unknown as number }]],
      worldLandmarks: [],
    }
    expect(toPoseFrame(noVisibility, 1, 640, 480)).toMatchObject({ image: [[0.5, 0.5, 0]], world: null })
  })
})

describe('openPoseEngine', () => {
  it('charge MediaPipe dans l’appli', async () => {
    creates(fakeLandmarker())
    expect((await openPoseEngine()).delegate).toBe('CPU')
    expect(vision.createFromOptions).toHaveBeenCalledTimes(1)
  })

  it('rejoue le squelette posé par les tests de bout en bout, sans MediaPipe', async () => {
    const frame = { t: 0, width: 480, height: 640, image: null, world: null }
    ;(globalThis as { __calitrackPoseReplay?: unknown }).__calitrackPoseReplay = encodeFixture(
      {
        name: 'vide',
        movement: null,
        exerciseId: null,
        kind: 'negative',
        expected: { reps: 0 },
        split: 'check',
        source: 'test',
        licence: 'MIT',
        estimator: 'test',
        fps: 15,
        width: 480,
        height: 640,
      },
      [frame],
    )
    const engine = await openPoseEngine()
    expect(engine.detect(canvasOf(10, 10), 5)).toEqual({ ...frame, t: 5 })
    expect(vision.isSimdSupported).not.toHaveBeenCalled()
    expect(vision.createFromOptions).not.toHaveBeenCalled()
  })

  it('refuse un squelette rejoué mal formé', async () => {
    ;(globalThis as { __calitrackPoseReplay?: unknown }).__calitrackPoseReplay = { format: 1 }
    expect(await problemOf(openPoseEngine())).toBe('load')
  })
})
