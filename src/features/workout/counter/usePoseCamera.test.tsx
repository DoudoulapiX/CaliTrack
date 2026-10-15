import { act, render } from '@testing-library/react'
import { useEffect } from 'react'
import { FIXTURE_JOINTS } from '@/content/reps/fixture'
import type { ImagePoint, PoseFrame } from '@/content/reps/types'
import {
  emptyFrame,
  fakeMediaDevices,
  fakePoseEngine,
  manualScheduler,
  stubCanvas2d,
  stubVideo,
  type FakeMediaDevices,
} from '@/test/pose'
import type { Facing } from '@/lib/camera'
import { PoseEngineError, type Delegate, type PoseEngine } from './pose-engine'
import {
  NO_POSE_STATS,
  usePoseCamera,
  type PoseCamera,
  type PoseCameraOptions,
  type PoseCameraStats,
} from './usePoseCamera'

/** Une image où quelqu'un est vu (tous les points au milieu, bien visibles). */
function seenFrame(t = 0): PoseFrame {
  return {
    t,
    width: 640,
    height: 480,
    image: Array.from({ length: 33 }, (): ImagePoint => [0.5, 0.5, 0.9]),
    world: Array.from({ length: 33 }, () => [0, 0, 0] as const),
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Laisse se terminer tout ce qui attend (moteur, caméra, lecture de la vidéo). */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0)
    })
  })
}

/** Un flux de caméra dont la piste peut se terminer d'elle-même (appel, autre appli). */
function endingStream() {
  const track = Object.assign(new EventTarget(), { kind: 'video', stop: vi.fn() })
  const stream = { id: 'caméra-interrompue', getTracks: () => [track], getVideoTracks: () => [track] }
  return { track, stream: stream as unknown as MediaStream }
}

// L'horloge des images (performance.now) n'avance que quand le test fait passer une image.
let now = 10_000
let visibility: DocumentVisibilityState = 'visible'
const devices: FakeMediaDevices[] = []

beforeEach(() => {
  now = 10_000
  visibility = 'visible'
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(Document.prototype, 'visibilityState', 'get').mockImplementation(() => visibility)
  stubVideo()
})

afterEach(() => {
  for (const media of devices.splice(0)) media.restore()
})

function setVisibility(next: DocumentVisibilityState) {
  visibility = next
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function Harness({
  options,
  withVideo,
  report,
}: {
  options: PoseCameraOptions
  withVideo: boolean
  report: (camera: PoseCamera) => void
}) {
  const camera = usePoseCamera(options)
  const { videoRef, overlayRef } = camera
  useEffect(() => {
    report(camera)
  })
  return (
    <div>
      {withVideo && <video ref={videoRef} />}
      <canvas ref={overlayRef} />
    </div>
  )
}

interface SetupOptions {
  readonly options?: Partial<PoseCameraOptions>
  readonly frames?: readonly PoseFrame[]
  readonly media?: FakeMediaDevices | null
  readonly withVideo?: boolean
  /** Laisser le canvas dessiner (le test pose son propre contexte). */
  readonly canvas?: boolean
  /** Calcul du moteur factice (celui qu'il a vraiment pris). */
  readonly delegate?: Delegate
  readonly openEngine?: (options?: { delegate?: Delegate }) => Promise<PoseEngine>
  readonly openCamera?: (facing: Facing) => Promise<MediaStream>
}

/** La caméra du compteur dans une page, avec une caméra, un moteur et une cadence d'images factices. */
function setup({
  options = {},
  frames = [],
  media,
  withVideo = true,
  canvas = false,
  delegate = 'CPU',
  openEngine: engineOpener,
  openCamera,
}: SetupOptions = {}) {
  const camera = media === undefined ? fakeMediaDevices() : media
  if (camera) devices.push(camera)
  if (!canvas) stubCanvas2d()
  const fake = fakePoseEngine(frames, delegate)
  const { engine } = fake
  const openEngine = engineOpener ? vi.fn(engineOpener) : fake.openEngine
  const scheduler = manualScheduler()
  const onFrame = vi.fn<(frame: PoseFrame, light: number | null) => void>()
  const onHidden = vi.fn()
  let current: PoseCameraOptions = {
    open: true,
    cameraOn: false,
    analysing: true,
    facing: 'user',
    delegate: 'CPU',
    joints: FIXTURE_JOINTS,
    onFrame,
    onHidden,
    deps: { openEngine, scheduler, ...(openCamera ? { openCamera } : {}) },
    ...options,
  }
  let latest: PoseCamera | null = null
  const published: PoseCameraStats[] = []
  const report = (next: PoseCamera) => {
    latest = next
    if (published[published.length - 1] !== next.stats) published.push(next.stats)
  }
  const view = render(<Harness options={current} withVideo={withVideo} report={report} />)
  return {
    media: camera,
    engine,
    openEngine,
    scheduler,
    onFrame,
    onHidden,
    published,
    camera: () => {
      if (!latest) throw new Error('Pas encore affiché')
      return latest
    },
    update: (patch: Partial<PoseCameraOptions>) => {
      current = { ...current, ...patch }
      view.rerender(<Harness options={current} withVideo={withVideo} report={report} />)
    },
    unmount: view.unmount,
    video: () => view.container.querySelector('video'),
    overlay: () => view.container.querySelector('canvas')!,
    /** Des images de la caméra passent, 67 ms l'une après l'autre (15 par seconde). */
    step: (count = 1, ms = 67) => {
      for (let i = 0; i < count; i++) {
        now += ms
        act(() => {
          scheduler.step()
        })
      }
    },
  }
}

/** Caméra ouverte et analyse en route. */
async function running(options: SetupOptions = {}) {
  const harness = setup({ ...options, options: { cameraOn: true, ...options.options } })
  await settle()
  expect(harness.camera().state).toEqual({ kind: 'running' })
  return harness
}

const streamId = (video: HTMLVideoElement | null) => (video?.srcObject as { id?: string } | null)?.id

describe('caméra du compteur : démarrage', () => {
  it('charge le moteur dès l’ouverture de la feuille, sans ouvrir la caméra', async () => {
    const { openEngine, media, camera } = setup()
    expect(openEngine).toHaveBeenCalledExactlyOnceWith({ delegate: 'CPU' })
    expect(camera().state).toEqual({ kind: 'loading', step: 'engine' })
    await settle()
    expect(camera().state).toEqual({ kind: 'idle' })
    expect(camera().stats).toEqual({ ...NO_POSE_STATS, delegate: 'CPU' })
    expect(media?.getUserMedia).not.toHaveBeenCalled()
  })

  it('ne charge rien tant que la feuille n’est pas ouverte', async () => {
    const { openEngine, camera, update, media } = setup({ options: { open: false, cameraOn: true } })
    await settle()
    expect(openEngine).not.toHaveBeenCalled()
    expect(camera().state).toEqual({ kind: 'idle' })
    update({ open: true })
    expect(openEngine).toHaveBeenCalledTimes(1)
    await settle()
    expect(media?.getUserMedia).toHaveBeenCalledTimes(1)
    expect(camera().state).toEqual({ kind: 'running' })
  })

  it('n’ouvre la caméra qu’une fois demandée, petite et de face, puis analyse', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const { media, camera, update, video, scheduler } = setup()
    await settle()
    expect(media?.getUserMedia).not.toHaveBeenCalled()
    update({ cameraOn: true })
    expect(camera().state).toEqual({ kind: 'loading', step: 'camera' })
    await settle()
    expect(media?.getUserMedia).toHaveBeenCalledExactlyOnceWith({
      video: {
        facingMode: { ideal: 'user' },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    })
    expect(camera().state).toEqual({ kind: 'running' })
    expect(streamId(video())).toBe('camera-1')
    expect(play).toHaveBeenCalled()
    expect(scheduler.pending).toBe(1)
  })

  it('attend le moteur avant la caméra quand elle est demandée tout de suite', async () => {
    const loading = deferred<PoseEngine>()
    const { engine } = fakePoseEngine()
    const { openEngine, media, camera } = setup({
      options: { cameraOn: true, facing: 'environment', delegate: 'GPU' },
      openEngine: () => loading.promise,
    })
    expect(openEngine).toHaveBeenCalledExactlyOnceWith({ delegate: 'GPU' })
    await settle()
    expect(camera().state).toEqual({ kind: 'loading', step: 'engine' })
    expect(media?.getUserMedia).not.toHaveBeenCalled()
    loading.resolve(engine)
    await settle()
    expect(media?.getUserMedia).toHaveBeenCalledTimes(1)
    expect(media?.getUserMedia.mock.calls[0]?.[0]).toMatchObject({
      video: { facingMode: { ideal: 'environment' } },
    })
    expect(camera().state).toEqual({ kind: 'running' })
  })

  it('prend le calcul demandé au chargement seulement, et montre celui du moteur', async () => {
    // Puce graphique demandée, moteur revenu au processeur.
    const { openEngine, camera, update } = await running({ options: { delegate: 'GPU' }, delegate: 'CPU' })
    expect(openEngine).toHaveBeenCalledExactlyOnceWith({ delegate: 'GPU' })
    expect(camera().stats.delegate).toBe('CPU')
    update({ delegate: 'CPU' })
    await settle()
    expect(openEngine).toHaveBeenCalledTimes(1)
  })
})

describe('caméra du compteur : images analysées', () => {
  it('envoie chaque image analysée, avec le temps de l’image', async () => {
    const frames = [seenFrame(), emptyFrame(0), seenFrame()]
    const { onFrame, step, engine, video } = await running({ frames })
    step(3)
    expect(onFrame).toHaveBeenCalledTimes(3)
    expect(onFrame.mock.calls.map(([frame]) => frame.t)).toEqual([10_067, 10_134, 10_201])
    expect(onFrame.mock.calls.map(([frame]) => frame.image !== null)).toEqual([true, false, true])
    expect(engine.detect.mock.calls[0]?.[0]).toBe(video())
  })

  it('publie ses chiffres 4 fois par seconde : images, silhouettes, cadence', async () => {
    const frames = Array.from({ length: 16 }, (_, index) => (index % 4 === 3 ? emptyFrame(0) : seenFrame()))
    const { step, camera, published } = await running({ frames })
    published.length = 0
    step(16)
    // Une publication dès que 250 ms ont passé depuis la précédente : toutes les 4 images (268 ms).
    expect(published.map((stats) => stats.frames)).toEqual([1, 5, 9, 13])
    const stats = camera().stats
    expect(stats.frames).toBe(13)
    expect(stats.detected).toBe(10)
    expect(stats.fps).toBeCloseTo(1000 / 67, 1)
    expect(stats.msP50).toBe(0)
    expect(stats.delegate).toBe('CPU')
  })

  it('donne la durée médiane des dernières analyses', async () => {
    const { step, camera, engine } = await running()
    const durations = [20, 40, 30, 25]
    let call = 0
    const detect = engine.detect.getMockImplementation()!
    engine.detect.mockImplementation((source, t) => {
      now += durations[call++ % durations.length]!
      return detect(source, t)
    })
    // Une image tous les 260 ms : chaque image publie ses chiffres.
    step(1, 260)
    expect(camera().stats.msP50).toBe(20)
    // 20, 40, 30, 25 : médiane entre 25 et 30 ; ensuite, les 31 dernières seulement.
    step(3, 260)
    expect(camera().stats.frames).toBe(4)
    expect(camera().stats.msP50).toBe(27.5)
    step(40, 260)
    expect(camera().stats.msP50).toBe(30)
  })

  it('mesure la lumière une fois par seconde et la passe avec chaque image', async () => {
    const lumas = [100, 50]
    const drawImage = vi.fn()
    const ctx = {
      drawImage,
      getImageData: (_x: number, _y: number, width: number, height: number) => {
        const value = lumas[Math.min(drawImage.mock.calls.length - 1, lumas.length - 1)]!
        return { data: new Uint8ClampedArray(width * height * 4).fill(value) }
      },
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    )
    const { onFrame, step, camera } = await running({ canvas: true })
    step(16)
    const lights = onFrame.mock.calls.map(([, light]) => light)
    expect(lights.slice(0, 15).every((light) => Math.abs((light ?? 0) - 100) < 1e-9)).toBe(true)
    expect(lights[15]).toBeCloseTo(50)
    expect(drawImage).toHaveBeenCalledTimes(2)
    expect(camera().stats.light).toBeCloseTo(100)
    step(4)
    expect(camera().stats.light).toBeCloseTo(50)
  })

  it('dessine le squelette de chaque image sur le calque, et l’efface en pause', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400)
    const calls: string[] = []
    const record =
      (name: string) =>
      (..._args: unknown[]) => {
        calls.push(name)
      }
    const ctx = {
      canvas: { width: 300, height: 400 },
      clearRect: record('clearRect'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      arc: record('arc'),
      stroke: record('stroke'),
      fill: record('fill'),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      // Le calque dessine ; la mesure de la lumière, elle, ne lit rien.
      return kind === '2d' && this.width !== 32 ? (ctx as unknown as CanvasRenderingContext2D) : null
    } as HTMLCanvasElement['getContext'])
    const { step, update, overlay } = await running({ frames: [seenFrame()], canvas: true })
    step()
    expect(calls.filter((name) => name === 'arc')).toHaveLength(FIXTURE_JOINTS.length)
    expect(overlay().width).toBe(Math.round(300 * (window.devicePixelRatio || 1)))
    calls.length = 0
    update({ analysing: false })
    expect(calls).toEqual(['clearRect'])
  })

  it('n’analyse rien quand analysing est faux, la caméra restant allumée', async () => {
    const { step, engine, scheduler, update, media, camera } = await running({
      options: { analysing: false },
      frames: [seenFrame()],
    })
    step(10)
    expect(engine.detect.mock.calls).toHaveLength(0)
    expect(scheduler.pending).toBe(0)
    expect(media?.tracks[0]?.readyState).toBe('live')
    expect(camera().state).toEqual({ kind: 'running' })

    update({ analysing: true })
    step(16)
    expect(engine.detect.mock.calls).toHaveLength(16)
    expect(camera().stats.fps).toBeGreaterThan(14)

    update({ analysing: false })
    step(5)
    expect(engine.detect.mock.calls).toHaveLength(16)
    expect(camera().stats.fps).toBe(0)
    expect(camera().stats.frames).toBe(16)
  })
})

describe('caméra du compteur : changements et problèmes', () => {
  it('changer de caméra ne redémarre que le flux', async () => {
    const { update, media, openEngine, engine, camera, step, video } = await running()
    update({ facing: 'environment' })
    expect(media?.tracks[0]?.stop).toHaveBeenCalled()
    expect(camera().state).toEqual({ kind: 'loading', step: 'camera' })
    await settle()
    expect(media?.getUserMedia).toHaveBeenCalledTimes(2)
    expect(media?.getUserMedia.mock.calls[1]?.[0]).toMatchObject({
      video: { facingMode: { ideal: 'environment' } },
    })
    expect(camera().state).toEqual({ kind: 'running' })
    expect(streamId(video())).toBe('camera-2')
    expect(openEngine).toHaveBeenCalledTimes(1)
    expect(engine.close.mock.calls).toHaveLength(0)
    step(2)
    expect(engine.detect.mock.calls).toHaveLength(2)
  })

  it('caméra refusée : problème, moteur gardé ; « Réessayer » rouvre la caméra seulement', async () => {
    const media = fakeMediaDevices({ deny: true })
    const { camera, engine, openEngine } = setup({ media, options: { cameraOn: true } })
    await settle()
    const denied = camera().state
    expect(denied).toEqual({ kind: 'problem', problem: 'denied' })
    expect(engine.close.mock.calls).toHaveLength(0)
    act(() => {
      camera().retry()
    })
    expect(camera().state).toEqual({ kind: 'loading', step: 'camera' })
    await settle()
    expect(media.getUserMedia).toHaveBeenCalledTimes(2)
    // Le même problème revient, en nouvel état (l'écran sait que l'essai a eu lieu).
    expect(camera().state).toEqual({ kind: 'problem', problem: 'denied' })
    expect(camera().state).not.toBe(denied)
    expect(openEngine).toHaveBeenCalledTimes(1)
  })

  it('pas de caméra, ou pas d’accès à la caméra : indisponible', async () => {
    const none = setup({ media: fakeMediaDevices({ none: true }), options: { cameraOn: true } })
    await settle()
    expect(none.camera().state).toEqual({ kind: 'problem', problem: 'unavailable' })
    none.unmount()
    for (const media of devices.splice(0)) media.restore()

    const absent = setup({ media: null, options: { cameraOn: true } })
    await settle()
    expect(absent.camera().state).toEqual({ kind: 'problem', problem: 'unavailable' })
  })

  it('autre échec de la caméra : erreur', async () => {
    const { camera } = setup({
      options: { cameraOn: true },
      openCamera: () => Promise.reject(new TypeError('Panne')),
    })
    await settle()
    expect(camera().state).toEqual({ kind: 'problem', problem: 'error' })
  })

  it('caméra prise par une autre appli ou un appel : erreur, qu’on peut réessayer', async () => {
    const { camera } = setup({
      options: { cameraOn: true },
      openCamera: () => Promise.reject(new DOMException('Caméra occupée', 'NotReadableError')),
    })
    await settle()
    expect(camera().state).toEqual({ kind: 'problem', problem: 'error' })
  })

  it('caméra ouverte sans vidéo où l’afficher : erreur, et la caméra est coupée', async () => {
    const { camera, media } = setup({ withVideo: false, options: { cameraOn: true } })
    await settle()
    expect(camera().state).toEqual({ kind: 'problem', problem: 'error' })
    expect(media?.stopped()).toBe(true)
  })

  it('moteur trop ancien ou pas chargé : problème, sans jamais ouvrir la caméra', async () => {
    const { engine } = fakePoseEngine()
    const answers: (() => Promise<PoseEngine>)[] = [
      () => Promise.reject(new PoseEngineError('unsupported')),
      () => Promise.reject(new Error('Réseau coupé')),
    ]
    const { camera, media, openEngine } = setup({
      options: { cameraOn: true },
      openEngine: () => (answers.shift() ?? (() => Promise.resolve(engine)))(),
    })
    await settle()
    expect(camera().state).toEqual({ kind: 'problem', problem: 'unsupported' })
    act(() => {
      camera().retry()
    })
    expect(camera().state).toEqual({ kind: 'loading', step: 'engine' })
    await settle()
    expect(camera().state).toEqual({ kind: 'problem', problem: 'load' })
    expect(media?.getUserMedia).not.toHaveBeenCalled()
    act(() => {
      camera().retry()
    })
    await settle()
    expect(openEngine).toHaveBeenCalledTimes(3)
    expect(camera().state).toEqual({ kind: 'running' })
  })

  it('analyse en échec : moteur fermé, caméra coupée, état « crashed » ; « Réessayer » recrée le moteur', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { engine, step, camera, media, openEngine, onHidden, scheduler } = await running()
    const lost = new Error('Contexte WebGL perdu')
    engine.detect.mockImplementationOnce(() => {
      throw lost
    })
    step()
    expect(camera().state).toEqual({ kind: 'problem', problem: 'crashed' })
    expect(engine.close.mock.calls).toHaveLength(1)
    expect(media?.stopped()).toBe(true)
    expect(scheduler.pending).toBe(0)
    expect(onHidden).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Compteur caméra'), lost)

    act(() => {
      camera().retry()
    })
    await settle()
    expect(openEngine).toHaveBeenCalledTimes(2)
    expect(media?.getUserMedia).toHaveBeenCalledTimes(2)
    expect(camera().state).toEqual({ kind: 'running' })
  })

  it('« Réessayer » sans problème ne relance rien', async () => {
    const { camera, media, openEngine } = await running()
    act(() => {
      camera().retry()
    })
    await settle()
    expect(media?.getUserMedia).toHaveBeenCalledTimes(1)
    expect(openEngine).toHaveBeenCalledTimes(1)
    expect(camera().state).toEqual({ kind: 'running' })
  })
})

describe('caméra du compteur : arrière-plan et fermeture', () => {
  it('arrière-plan : caméra coupée et moteur fermé, puis onHidden, puis « stopped » ; rien ne repart seul', async () => {
    const { onHidden, media, engine, camera, openEngine, scheduler } = await running()
    onHidden.mockImplementation(() => {
      expect(media?.stopped()).toBe(true)
      expect(engine.close.mock.calls).toHaveLength(1)
    })
    setVisibility('hidden')
    expect(onHidden).toHaveBeenCalledTimes(1)
    expect(camera().state).toEqual({ kind: 'problem', problem: 'stopped' })
    expect(scheduler.pending).toBe(0)

    setVisibility('visible')
    await settle()
    expect(camera().state).toEqual({ kind: 'problem', problem: 'stopped' })
    expect(media?.getUserMedia).toHaveBeenCalledTimes(1)
    expect(openEngine).toHaveBeenCalledTimes(1)

    act(() => {
      camera().retry()
    })
    await settle()
    expect(openEngine).toHaveBeenCalledTimes(2)
    expect(media?.getUserMedia).toHaveBeenCalledTimes(2)
    expect(camera().state).toEqual({ kind: 'running' })
  })

  it('arrière-plan pendant un problème : le problème reste, le moteur est libéré', async () => {
    const { camera, engine, onHidden } = setup({
      media: fakeMediaDevices({ deny: true }),
      options: { cameraOn: true },
    })
    await settle()
    setVisibility('hidden')
    expect(camera().state).toEqual({ kind: 'problem', problem: 'denied' })
    expect(engine.close.mock.calls).toHaveLength(1)
    expect(onHidden).not.toHaveBeenCalled()
  })

  it('arrière-plan sans caméra : le moteur est libéré puis rechargé au retour, sans rien dire', async () => {
    const { camera, engine, openEngine, onHidden } = setup()
    await settle()
    setVisibility('hidden')
    expect(engine.close.mock.calls).toHaveLength(1)
    expect(camera().state).toEqual({ kind: 'idle' })
    expect(camera().stats.delegate).toBeNull()
    expect(onHidden).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(camera().state).toEqual({ kind: 'loading', step: 'engine' })
    await settle()
    expect(openEngine).toHaveBeenCalledTimes(2)
    expect(camera().state).toEqual({ kind: 'idle' })
  })

  it('arrière-plan pendant le chargement du moteur : le moteur chargé ensuite est fermé', async () => {
    const loading = deferred<PoseEngine>()
    const { engine } = fakePoseEngine()
    const { camera, onHidden } = setup({ options: { cameraOn: true }, openEngine: () => loading.promise })
    setVisibility('hidden')
    expect(onHidden).toHaveBeenCalledTimes(1)
    expect(camera().state).toEqual({ kind: 'problem', problem: 'stopped' })
    loading.resolve(engine)
    await settle()
    expect(engine.close.mock.calls).toHaveLength(1)
    expect(camera().state).toEqual({ kind: 'problem', problem: 'stopped' })
  })

  it('piste terminée d’elle-même (appel) : caméra coupée, moteur gardé, onHidden', async () => {
    const opened: ReturnType<typeof endingStream>[] = []
    const { camera, engine, onHidden } = setup({
      options: { cameraOn: true },
      openCamera: () => {
        const next = endingStream()
        opened.push(next)
        return Promise.resolve(next.stream)
      },
    })
    await settle()
    expect(camera().state).toEqual({ kind: 'running' })
    const first = opened[0]!.track
    act(() => {
      first.dispatchEvent(new Event('ended'))
    })
    expect(onHidden).toHaveBeenCalledTimes(1)
    expect(camera().state).toEqual({ kind: 'problem', problem: 'stopped' })
    expect(first.stop).toHaveBeenCalled()
    expect(engine.close.mock.calls).toHaveLength(0)

    act(() => {
      camera().retry()
    })
    await settle()
    expect(opened).toHaveLength(2)
    expect(camera().state).toEqual({ kind: 'running' })
    // La fin de l'ancienne caméra, déjà remplacée, ne compte plus.
    act(() => {
      first.dispatchEvent(new Event('ended'))
    })
    expect(onHidden).toHaveBeenCalledTimes(1)
    expect(camera().state).toEqual({ kind: 'running' })
  })

  it('fermeture : caméra coupée, moteur fermé, plus rien d’attendu', async () => {
    const { unmount, media, engine, scheduler, video } = await running()
    const shown = video()!
    unmount()
    expect(media?.stopped()).toBe(true)
    expect(engine.close.mock.calls).toHaveLength(1)
    expect(scheduler.pending).toBe(0)
    expect(shown.srcObject).toBeNull()
  })

  it('feuille refermée (open faux) : tout s’arrête et l’état revient au repos', async () => {
    const { update, media, engine, camera, step } = await running({ frames: [seenFrame()] })
    step(2)
    update({ open: false })
    expect(media?.stopped()).toBe(true)
    expect(engine.close.mock.calls).toHaveLength(1)
    expect(camera().state).toEqual({ kind: 'idle' })
    expect(camera().stats).toEqual(NO_POSE_STATS)
  })

  it('fermée pendant le chargement du moteur : le moteur chargé ensuite est aussitôt fermé', async () => {
    const loading = deferred<PoseEngine>()
    const { engine } = fakePoseEngine()
    const { unmount, media } = setup({ options: { cameraOn: true }, openEngine: () => loading.promise })
    unmount()
    loading.resolve(engine)
    await settle()
    expect(engine.close.mock.calls).toHaveLength(1)
    expect(media?.getUserMedia).not.toHaveBeenCalled()
  })

  it('fermée pendant l’ouverture de la caméra : la caméra ouverte ensuite est aussitôt coupée', async () => {
    const opening = deferred<MediaStream>()
    const { track, stream } = endingStream()
    const { unmount, camera } = setup({ options: { cameraOn: true }, openCamera: () => opening.promise })
    await settle()
    expect(camera().state).toEqual({ kind: 'loading', step: 'camera' })
    unmount()
    opening.resolve(stream)
    await settle()
    expect(track.stop).toHaveBeenCalled()
  })

  it('caméra plus demandée : flux coupé, moteur gardé', async () => {
    const { update, media, engine, camera } = await running()
    update({ cameraOn: false })
    expect(media?.stopped()).toBe(true)
    expect(engine.close.mock.calls).toHaveLength(0)
    expect(camera().state).toEqual({ kind: 'idle' })
  })
})
