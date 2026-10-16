import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { cameraProblem, openCamera } from '@/lib/camera'
import type { PoseCameraOptions } from '@/features/workout/counter/usePoseCamera'
import {
  counterResult,
  counterSnapshot,
  emptyFrame,
  fakeCounter,
  fakeMediaDevices,
  fakePoseCamera,
  fakePoseEngine,
  manualScheduler,
  stubCanvas2d,
  stubVideo,
} from './pose'

describe('fakeMediaDevices', () => {
  it('donne une caméra dont on voit l’arrêt', async () => {
    const camera = fakeMediaDevices()
    try {
      expect(camera.stopped()).toBe(false)
      const first = await openCamera('user')
      const second = await openCamera('environment')
      expect(camera.getUserMedia).toHaveBeenCalledTimes(2)
      expect(camera.tracks).toHaveLength(2)
      first.getTracks()[0]?.stop()
      expect(camera.stopped()).toBe(false)
      second.getTracks()[0]?.stop()
      expect(camera.stopped()).toBe(true)
      expect(camera.tracks.map((track) => track.stop.mock.calls.length)).toEqual([1, 1])
    } finally {
      camera.restore()
    }
    expect('mediaDevices' in navigator).toBe(false)
  })

  it('refuse l’accès, ou n’a pas de caméra', async () => {
    const denied = fakeMediaDevices({ deny: true })
    expect(cameraProblem(await openCamera('user').catch((error: unknown) => error))).toBe('denied')
    denied.restore()
    const none = fakeMediaDevices({ none: true })
    expect(cameraProblem(await openCamera('user').catch((error: unknown) => error))).toBe('unavailable')
    expect(none.tracks).toEqual([])
    none.restore()
  })
})

describe('stubVideo et stubCanvas2d', () => {
  it('donnent une vidéo prête et un canvas sans dessin', async () => {
    stubVideo({ width: 480, height: 640 })
    stubCanvas2d()
    const video = document.createElement('video')
    await expect(video.play()).resolves.toBeUndefined()
    expect(video.readyState).toBe(HTMLMediaElement.HAVE_ENOUGH_DATA)
    expect([video.videoWidth, video.videoHeight]).toEqual([480, 640])
    expect(document.createElement('canvas').getContext('2d')).toBeNull()
  })
})

describe('manualScheduler', () => {
  it('rappelle à chaque image ce qui attendait, sauf ce qui a été annulé', () => {
    const scheduler = manualScheduler()
    const video = document.createElement('video')
    const seen: string[] = []
    scheduler.request(video, () => seen.push('a'))
    const cancel = scheduler.request(video, () => seen.push('b'))
    expect(scheduler.pending).toBe(2)
    cancel()
    expect(scheduler.step()).toBe(1)
    expect(seen).toEqual(['a'])
    expect(scheduler.step()).toBe(0)
    scheduler.request(video, () => seen.push('c'))
    scheduler.step()
    expect(seen).toEqual(['a', 'c'])
  })
})

describe('fakePoseEngine', () => {
  it('rend ses images l’une après l’autre, au temps demandé, puis garde la dernière', async () => {
    const frames = [emptyFrame(0, 480, 640), { ...emptyFrame(1, 480, 640), image: [] }]
    const { engine, openEngine } = fakePoseEngine(frames, 'GPU')
    expect(await openEngine({ delegate: 'GPU' })).toBe(engine)
    const canvas = document.createElement('canvas')
    expect(engine.detect(canvas, 100)).toEqual({ ...frames[0], t: 100 })
    expect(engine.detect(canvas, 200)).toEqual({ ...frames[1], t: 200 })
    expect(engine.detect(canvas, 300)).toEqual({ ...frames[1], t: 300 })
    expect(engine.delegate).toBe('GPU')
    expect(fakePoseEngine().engine.detect(canvas, 5)).toEqual(emptyFrame(5))
  })
})

describe('fakeCounter', () => {
  it('rend ce que le test lui dit, compteur neuf à chaque création', () => {
    const fake = fakeCounter()
    const counter = fake.createRepCounter({ variant: { movement: 'squat', overrides: {} }, offset: 4 })
    expect(counter.push(emptyFrame(0), 120)).toEqual(counterSnapshot({ reps: 4 }))
    fake.emit({ status: 'counting', reps: 6 })
    expect(counter.push(emptyFrame(66)).reps).toBe(6)
    expect(counter.tick(100).status).toBe('counting')
    expect(fake.pushed.map((p) => p.light)).toEqual([120, null])
    expect(counter.result).toBeNull()

    fake.end({ confident: false, reasons: ['lost'], endedBy: 'gone' })
    expect(counter.snapshot.status).toBe('ended')
    expect(counter.result).toEqual(
      counterResult({ reps: 6, confident: false, reasons: ['lost'], endedBy: 'gone' }),
    )
    expect(counter.finish(200, 'manual')).toBe(counter.result)

    fake.createRepCounter({ variant: { movement: 'squat', overrides: {} } })
    expect(fake.created.map((o) => o.offset)).toEqual([4, undefined])
    expect([counter.result, counter.snapshot.reps, fake.pushed]).toEqual([null, 0, []])
  })

  it('termine à la demande : sûr, interrompu, ou comme le test l’a prévu', () => {
    const fake = fakeCounter()
    const variant = { movement: 'curl', overrides: {} } as const
    let counter = fake.createRepCounter({ variant })
    fake.emit({ reps: 9 })
    expect(counter.finish(1, 'manual')).toMatchObject({ reps: 9, confident: true, endedBy: 'manual' })
    counter = fake.createRepCounter({ variant })
    expect(counter.finish(1, 'interrupted')).toMatchObject({ confident: false, reasons: ['interrupted'] })
    counter = fake.createRepCounter({ variant })
    fake.onFinish({ confident: false, reasons: ['trial'], doubtful: 2 })
    expect(counter.finish(1, 'manual')).toMatchObject({ confident: false, reasons: ['trial'], doubtful: 2 })
  })
})

describe('fakePoseCamera', () => {
  function Screen({ camera, onFrame }: { camera: ReturnType<typeof fakePoseCamera>; onFrame: () => void }) {
    const options: PoseCameraOptions = {
      open: true,
      cameraOn: false,
      analysing: true,
      facing: 'user',
      delegate: 'CPU',
      joints: [],
      onFrame,
      onHidden: () => undefined,
    }
    const { state, stats, retry } = camera.usePoseCamera(options)
    return (
      <>
        <p>{state.kind === 'problem' ? state.problem : state.kind}</p>
        <p>{`${stats.frames} images`}</p>
        <button type="button" onClick={retry}>
          Réessayer
        </button>
      </>
    )
  }

  it('suit l’état, les images et l’arrière-plan voulus par le test', async () => {
    const camera = fakePoseCamera()
    expect(camera.options).toBeNull()
    expect(() => {
      camera.frame(emptyFrame(0))
    }).toThrow()
    const onFrame = vi.fn()
    render(<Screen camera={camera} onFrame={onFrame} />)
    expect(screen.getByText('idle')).toBeInTheDocument()
    expect(camera.options?.open).toBe(true)

    camera.setState({ kind: 'loading', step: 'engine' })
    expect(screen.getByText('loading')).toBeInTheDocument()
    camera.setStats({ frames: 12 })
    expect(screen.getByText('12 images')).toBeInTheDocument()
    camera.frame(emptyFrame(10), 90)
    expect(onFrame).toHaveBeenCalledWith(emptyFrame(10), 90)

    const onHidden = vi.spyOn(camera.options!, 'onHidden')
    camera.hide()
    expect(screen.getByText('stopped')).toBeInTheDocument()
    expect(onHidden).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(camera.retries).toBe(1)
  })
})
