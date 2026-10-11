import { render, screen, waitFor } from '@testing-library/react'
import { createBarcodeReader } from './scanner'
import { useBarcodeScanner } from './useBarcodeScanner'

vi.mock('./scanner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scanner')>()),
  createBarcodeReader: vi.fn(),
}))

/** Affiche l'état de la caméra, comme l'écran de scan. */
function Scanner({ active, onCode }: { active: boolean; onCode: (code: string) => void }) {
  const { videoRef, state } = useBarcodeScanner(active, onCode)
  return (
    <>
      <video ref={videoRef} />
      <p>{state}</p>
    </>
  )
}

/** jsdom n'a pas de `navigator.mediaDevices` : on le pose le temps d'un test. */
function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true })
}

/** Une caméra factice : `getUserMedia` donne un flux dont on peut vérifier l'arrêt. */
function fakeCamera(result: 'ok' | DOMException = 'ok') {
  const stopTrack = vi.fn()
  const getUserMedia = vi.fn(() =>
    result === 'ok'
      ? Promise.resolve({ getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream)
      : Promise.reject(result),
  )
  setMediaDevices({ getUserMedia })
  return { getUserMedia, stopTrack }
}

/** Le lecteur factice voit successivement ces codes, une image après l'autre. */
function fakeReader(...frames: string[][]) {
  const detect = vi.fn(() => Promise.resolve((frames.shift() ?? []).map((rawValue) => ({ rawValue }))))
  vi.mocked(createBarcodeReader).mockResolvedValue({ detect })
  return detect
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(
      HTMLMediaElement.HAVE_ENOUGH_DATA,
    )
  })
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices')
    vi.restoreAllMocks()
  })

  it('lit les images jusqu’au premier code valable, puis coupe la caméra', async () => {
    const { getUserMedia, stopTrack } = fakeCamera()
    const detect = fakeReader([], ['12345'], [' 3017620422003 '])
    const onCode = vi.fn()
    render(<Scanner active onCode={onCode} />)

    expect(await screen.findByText('scanning')).toBeInTheDocument()
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    await waitFor(() => {
      expect(onCode).toHaveBeenCalledWith('3017620422003')
    })
    expect(onCode).toHaveBeenCalledOnce()
    expect(detect).toHaveBeenCalledTimes(3)
    expect(stopTrack).toHaveBeenCalled()
  })

  it('n’ouvre pas la caméra tant que le scan n’est pas actif', () => {
    const { getUserMedia } = fakeCamera()
    render(<Scanner active={false} onCode={vi.fn()} />)
    expect(screen.getByText('starting')).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('coupe la caméra quand l’écran se ferme', async () => {
    const { stopTrack } = fakeCamera()
    fakeReader()
    const { unmount } = render(<Scanner active onCode={vi.fn()} />)
    expect(await screen.findByText('scanning')).toBeInTheDocument()
    unmount()
    expect(stopTrack).toHaveBeenCalled()
  })

  it('signale un accès refusé, une caméra absente ou un lecteur qui ne démarre pas', async () => {
    fakeCamera(new DOMException('refusé', 'NotAllowedError'))
    const { unmount } = render(<Scanner active onCode={vi.fn()} />)
    expect(await screen.findByText('denied')).toBeInTheDocument()
    unmount()

    setMediaDevices(undefined)
    const second = render(<Scanner active onCode={vi.fn()} />)
    expect(await screen.findByText('unavailable')).toBeInTheDocument()
    second.unmount()

    const { stopTrack } = fakeCamera()
    vi.mocked(createBarcodeReader).mockRejectedValue(new Error('wasm introuvable'))
    render(<Scanner active onCode={vi.fn()} />)
    expect(await screen.findByText('error')).toBeInTheDocument()
    expect(stopTrack).toHaveBeenCalled()
  })
})
