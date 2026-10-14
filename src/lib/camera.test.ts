import { cameraProblem, openCamera, stopStream } from './camera'
import { stubProperty } from '@/test/stub'

afterEach(() => {
  Reflect.deleteProperty(navigator, 'mediaDevices')
})

describe('problèmes de caméra', () => {
  it('reconnaît un accès refusé', () => {
    expect(cameraProblem(new DOMException('refusé', 'NotAllowedError'))).toBe('denied')
    expect(cameraProblem(new DOMException('hors HTTPS', 'SecurityError'))).toBe('denied')
  })

  it('reconnaît l’absence de caméra utilisable', () => {
    expect(cameraProblem(new DOMException('aucune', 'NotFoundError'))).toBe('unavailable')
    expect(cameraProblem(new DOMException('contraintes', 'OverconstrainedError'))).toBe('unavailable')
    expect(cameraProblem(new DOMException('occupée', 'NotReadableError'))).toBe('unavailable')
  })

  it('classe le reste comme une erreur', () => {
    expect(cameraProblem(new DOMException('arrêt', 'AbortError'))).toBe('error')
    expect(cameraProblem(new Error('autre'))).toBe('error')
    expect(cameraProblem('texte')).toBe('error')
  })
})

describe('openCamera', () => {
  it('demande la caméra voulue, en petite taille et sans micro', async () => {
    const stream = {} as MediaStream
    const getUserMedia = vi.fn(() => Promise.resolve(stream))
    stubProperty(navigator, 'mediaDevices', { getUserMedia })
    expect(await openCamera('user')).toBe(stream)
    await openCamera('environment')
    const constraints = (facing: string) => ({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    })
    expect(getUserMedia.mock.calls).toEqual([[constraints('user')], [constraints('environment')]])
  })

  it('échoue comme sans caméra hors HTTPS, et transmet un refus', async () => {
    const missing = await openCamera('user').catch((error: unknown) => error)
    expect(missing).toBeInstanceOf(DOMException)
    expect(cameraProblem(missing)).toBe('unavailable')

    const refused = new DOMException('non', 'NotAllowedError')
    stubProperty(navigator, 'mediaDevices', { getUserMedia: () => Promise.reject(refused) })
    await expect(openCamera('user')).rejects.toBe(refused)
  })
})

describe('stopStream', () => {
  it('arrête chaque piste et vide la vidéo', () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }]
    const stream = { getTracks: () => tracks } as unknown as MediaStream
    const video = document.createElement('video')
    video.srcObject = stream
    stopStream(stream, video)
    expect(tracks.map((track) => track.stop.mock.calls.length)).toEqual([1, 1])
    expect(video.srcObject).toBeNull()
  })

  it('ne fait rien sans flux ni vidéo', () => {
    expect(() => {
      stopStream(null)
      stopStream(null, null)
    }).not.toThrow()
  })
})
