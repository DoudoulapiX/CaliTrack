import { COUNTER_PARAMS } from '@/content/reps/specs'
import type { PoseFrame } from '@/content/reps/types'
import { emptyFrame, fakePoseEngine, manualScheduler } from '@/test/pose'
import {
  FRAME_SLACK_MS,
  MAX_FPS,
  startFrameLoop,
  videoFrameScheduler,
  type FrameLoopOptions,
} from './frame-loop'

/** Une vidéo qui a toujours une image prête (ou pas, selon readyState). */
function videoStub(readyState: number = HTMLMediaElement.HAVE_ENOUGH_DATA): HTMLVideoElement {
  return { readyState } as HTMLVideoElement
}

/** Horloge du test, en millisecondes. */
function clock(start = 1000) {
  let time = start
  return {
    now: () => time,
    advance(ms: number) {
      time += ms
    },
  }
}

/** Une boucle sur une caméra factice : `frame()` fait passer une image de la caméra (30 par seconde). */
function setup(options: Partial<FrameLoopOptions> & { inferenceMs?: number; cameraFps?: number } = {}) {
  const { inferenceMs = 0, cameraFps = 30, ...rest } = options
  const time = clock()
  const scheduler = manualScheduler()
  const { engine } = fakePoseEngine()
  engine.detect.mockImplementation((_source, t) => {
    time.advance(inferenceMs)
    return emptyFrame(t)
  })
  const frames: { frame: PoseFrame; ms: number }[] = []
  const onFrame = vi.fn((frame: PoseFrame, ms: number) => {
    frames.push({ frame, ms })
  })
  const onError = vi.fn()
  const loop = startFrameLoop({
    video: videoStub(),
    engine,
    onFrame,
    onError,
    scheduler,
    now: time.now,
    ...rest,
  })
  /** Une image de la caméra arrive : le temps avance d'une image, puis la boucle est rappelée. */
  const frame = () => {
    time.advance(1000 / cameraFps)
    scheduler.step()
  }
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * cameraFps; i++) frame()
  }
  return { time, scheduler, engine, frames, onFrame, onError, loop, frame, run }
}

describe('boucle d’analyse des images', () => {
  it('analyse chaque image retenue avec un temps entier, strictement croissant', () => {
    const { frames, run, engine } = setup()
    run(1)
    const times = frames.map(({ frame }) => frame.t)
    expect(times.length).toBeGreaterThan(10)
    for (const [index, t] of times.entries()) {
      expect(Number.isInteger(t)).toBe(true)
      if (index > 0) expect(t).toBeGreaterThan(times[index - 1]!)
    }
    // Le moteur reçoit la vidéo et le même temps que l'image rendue.
    expect(engine.detect.mock.calls.map(([, t]) => t)).toEqual(times)
  })

  it('plafonne à 15 images par seconde, que la caméra en livre 30 ou 60', () => {
    expect(MAX_FPS).toBe(15)
    const thirty = setup()
    thirty.run(4)
    expect(thirty.frames).toHaveLength(4 * 15)
    const sixty = setup({ cameraFps: 60 })
    sixty.run(4)
    expect(sixty.frames).toHaveLength(4 * 15)
  })

  it('suit un plafond choisi', () => {
    const loop = setup({ maxFps: 10 })
    loop.run(3)
    expect(loop.frames).toHaveLength(30)
  })

  it('tolère quelques millisecondes d’avance sur le plafond, pas plus', () => {
    const { frames, time, scheduler } = setup()
    scheduler.step()
    expect(frames).toHaveLength(1)
    time.advance(1000 / 15 - FRAME_SLACK_MS - 1)
    scheduler.step()
    expect(frames).toHaveLength(1)
    time.advance(2)
    scheduler.step()
    expect(frames).toHaveLength(2)
  })

  it('analyse moins souvent quand l’analyse est lente : moins de 8,4 images par seconde à 60 ms', () => {
    const { frames, run, time } = setup({ inferenceMs: 60 })
    const start = time.now()
    run(10)
    const elapsed = (time.now() - start) / 1000
    expect(frames.length / elapsed).toBeLessThanOrEqual(8.4)
    expect(frames.length / elapsed).toBeGreaterThan(6)
    // Analyse au plus la moitié du temps.
    const busy = frames.reduce((sum, { ms }) => sum + ms, 0) / 1000
    expect(busy / elapsed).toBeLessThanOrEqual(0.5)
    for (const { ms } of frames) expect(ms).toBeCloseTo(60)
  })

  it.each([50, 55, 60])(
    'garde assez d’images pour que le compteur soit sûr de lui, caméra à 30 images par seconde et %i ms d’analyse',
    (inferenceMs) => {
      // Comme sur l'iPhone : les images arrivent toutes les 33,3 ms quoi qu'il arrive ; celles qui passent pendant une
      // analyse sont perdues.
      const period = 1000 / 30
      let time = 0
      const scheduler = manualScheduler()
      const { engine } = fakePoseEngine()
      const starts: number[] = []
      engine.detect.mockImplementation((_source, t) => {
        starts.push(time)
        time += inferenceMs
        return emptyFrame(t)
      })
      startFrameLoop({
        video: videoStub(),
        engine,
        onFrame: vi.fn(),
        onError: vi.fn(),
        scheduler,
        now: () => time,
      })
      for (let image = 1; image <= 20 * 30; image++) {
        if (image * period < time) continue
        time = image * period
        scheduler.step()
      }
      const first = starts[0]!
      const last = starts.at(-1)!
      // Mesuré comme le compteur : des intervalles sur le temps qu'ils couvrent.
      expect(((starts.length - 1) * 1000) / (last - first)).toBeGreaterThanOrEqual(COUNTER_PARAMS.minFps)
      // Et toujours pas plus de la moitié du temps, de la première analyse à la fin de la dernière.
      expect(starts.length * inferenceMs).toBeLessThanOrEqual((last + inferenceMs - first) / 2)
    },
  )

  it('n’analyse pas une vidéo sans image prête, mais continue d’attendre', () => {
    const time = clock()
    const scheduler = manualScheduler()
    const { engine } = fakePoseEngine()
    const video = { readyState: HTMLMediaElement.HAVE_METADATA } as { readyState: number }
    const onFrame = vi.fn()
    startFrameLoop({
      video: video as HTMLVideoElement,
      engine,
      onFrame,
      onError: vi.fn(),
      scheduler,
      now: time.now,
    })
    for (let i = 0; i < 5; i++) {
      time.advance(100)
      scheduler.step()
    }
    expect(engine.detect.mock.calls).toHaveLength(0)
    expect(scheduler.pending).toBe(1)
    video.readyState = HTMLMediaElement.HAVE_CURRENT_DATA
    time.advance(100)
    scheduler.step()
    expect(onFrame).toHaveBeenCalledTimes(1)
  })

  it('s’arrête en pause et reprend avec des temps toujours croissants', () => {
    const { frames, loop, scheduler, run, frame } = setup()
    run(1)
    const before = frames.length
    const lastT = frames[frames.length - 1]!.frame.t
    loop.pause()
    expect(scheduler.pending).toBe(0)
    run(2)
    expect(frames).toHaveLength(before)
    loop.resume()
    loop.resume()
    expect(scheduler.pending).toBe(1)
    frame()
    expect(frames).toHaveLength(before + 1)
    expect(frames[before]!.frame.t).toBeGreaterThan(lastT + 2000)
  })

  it('ne rattrape pas les analyses manquées pendant une pause', () => {
    const { frames, loop, run } = setup()
    run(1)
    loop.pause()
    run(2)
    loop.resume()
    const before = frames.length
    run(2)
    expect(frames).toHaveLength(before + 2 * 15)
  })

  it('ne repart plus une fois arrêtée', () => {
    const { frames, loop, scheduler, run } = setup()
    run(1)
    const before = frames.length
    loop.stop()
    expect(scheduler.pending).toBe(0)
    loop.resume()
    loop.pause()
    loop.resume()
    run(1)
    expect(frames).toHaveLength(before)
    expect(scheduler.pending).toBe(0)
  })

  it('s’arrête et prévient quand l’analyse échoue', () => {
    const { engine, onError, onFrame, scheduler, run } = setup()
    const lost = new Error('Contexte WebGL perdu')
    engine.detect.mockImplementation(() => {
      throw lost
    })
    run(1)
    expect(engine.detect.mock.calls).toHaveLength(1)
    expect(onError).toHaveBeenCalledExactlyOnceWith(lost)
    expect(onFrame).not.toHaveBeenCalled()
    expect(scheduler.pending).toBe(0)
  })

  it('s’arrête aussi quand ce qui suit l’analyse échoue', () => {
    const { onFrame, onError, scheduler, run } = setup()
    const bug = new Error('Compteur en panne')
    onFrame.mockImplementation(() => {
      throw bug
    })
    run(1)
    expect(onFrame).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledExactlyOnceWith(bug)
    expect(scheduler.pending).toBe(0)
  })

  it('peut être arrêtée ou mise en pause depuis une image', () => {
    const first = setup()
    first.onFrame.mockImplementation(() => {
      first.loop.stop()
    })
    first.run(1)
    expect(first.onFrame).toHaveBeenCalledTimes(1)
    expect(first.scheduler.pending).toBe(0)

    const second = setup()
    second.onFrame.mockImplementation(() => {
      second.loop.pause()
    })
    second.run(1)
    expect(second.onFrame).toHaveBeenCalledTimes(1)
    expect(second.scheduler.pending).toBe(0)
  })

  it('prend l’horloge de performance.now par défaut', () => {
    let time = 5000
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    const scheduler = manualScheduler()
    const { engine } = fakePoseEngine()
    const onFrame = vi.fn()
    startFrameLoop({ video: videoStub(), engine, onFrame, onError: vi.fn(), scheduler })
    scheduler.step()
    time += 66.6
    scheduler.step()
    expect(engine.detect.mock.calls.map(([, t]) => t)).toEqual([5000, 5067])
  })
})

describe('cadence des images de la vidéo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('suit requestVideoFrameCallback quand la vidéo le connaît', () => {
    const requestVideoFrameCallback = vi.fn((_callback: VideoFrameRequestCallback) => 7)
    const cancelVideoFrameCallback = vi.fn()
    const video = { requestVideoFrameCallback, cancelVideoFrameCallback } as unknown as HTMLVideoElement
    const callback = vi.fn()
    const cancel = videoFrameScheduler.request(video, callback)
    expect(requestVideoFrameCallback).toHaveBeenCalledTimes(1)
    requestVideoFrameCallback.mock.calls[0]![0](0, {} as VideoFrameCallbackMetadata)
    expect(callback).toHaveBeenCalledTimes(1)
    cancel()
    expect(cancelVideoFrameCallback).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('sinon, requestAnimationFrame quand l’image a changé', () => {
    const queue = new Map<number, FrameRequestCallback>()
    let next = 0
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        next++
        queue.set(next, callback)
        return next
      }),
    )
    const cancelAnimationFrame = vi.fn((handle: number) => {
      queue.delete(handle)
    })
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    const paint = () => {
      const due = [...queue.values()]
      queue.clear()
      for (const callback of due) callback(0)
    }
    const video = { currentTime: 1.5 }
    const callback = vi.fn()
    videoFrameScheduler.request(video as HTMLVideoElement, callback)
    paint()
    paint()
    expect(callback).not.toHaveBeenCalled()
    video.currentTime = 1.533
    paint()
    expect(callback).toHaveBeenCalledTimes(1)
    expect(queue.size).toBe(0)

    const cancel = videoFrameScheduler.request(video as HTMLVideoElement, callback)
    paint()
    cancel()
    expect(cancelAnimationFrame).toHaveBeenCalledExactlyOnceWith(next)
    video.currentTime = 2
    paint()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('sinon, une image toutes les 33 ms', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', undefined)
    const callback = vi.fn()
    videoFrameScheduler.request({} as HTMLVideoElement, callback)
    vi.advanceTimersByTime(32)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)
    const cancel = videoFrameScheduler.request({} as HTMLVideoElement, callback)
    cancel()
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
