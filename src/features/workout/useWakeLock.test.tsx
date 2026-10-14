import { act, renderHook, waitFor } from '@testing-library/react'
import { stubProperty } from '@/test/stub'
import { useWakeLock } from './useWakeLock'

/** Un verrou d'écran factice : le téléphone peut le relâcher, l'appli aussi. */
class FakeSentinel extends EventTarget {
  released = false
  readonly type = 'screen'
  readonly release = vi.fn(() => {
    this.drop()
    return Promise.resolve()
  })
  /** Relâché (par l'appli ou par le téléphone qui passe l'appli en arrière-plan). */
  drop(): void {
    if (this.released) return
    this.released = true
    this.dispatchEvent(new Event('release'))
  }
}

function fakeWakeLock(answer: 'grant' | 'refuse' = 'grant') {
  const locks: FakeSentinel[] = []
  const request = vi.fn(() => {
    if (answer === 'refuse') return Promise.reject(new DOMException('non', 'NotAllowedError'))
    const lock = new FakeSentinel()
    locks.push(lock)
    return Promise.resolve(lock)
  })
  stubProperty(navigator, 'wakeLock', { request })
  return { request, locks }
}

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  visibility = 'visible'
  vi.spyOn(Document.prototype, 'visibilityState', 'get').mockImplementation(() => visibility)
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock')
})

describe('useWakeLock', () => {
  it('ne demande rien quand il est coupé', () => {
    const { request } = fakeWakeLock()
    const { result } = renderHook(() => useWakeLock(false))
    expect(result.current).toBe('off')
    expect(request).not.toHaveBeenCalled()
  })

  it('tient l’écran allumé une fois le verrou accordé', async () => {
    const { request } = fakeWakeLock()
    const { result } = renderHook(() => useWakeLock(true))
    expect(result.current).toBe('pending')
    await waitFor(() => {
      expect(result.current).toBe('held')
    })
    expect(request).toHaveBeenCalledWith('screen')
  })

  it('est impossible sans l’API du navigateur', () => {
    const { result } = renderHook(() => useWakeLock(true))
    expect(result.current).toBe('unavailable')
  })

  it('est impossible quand le téléphone refuse', async () => {
    fakeWakeLock('refuse')
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => {
      expect(result.current).toBe('unavailable')
    })
  })

  it('redemande le verrou au retour de l’arrière-plan', async () => {
    const { request, locks } = fakeWakeLock()
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => {
      expect(result.current).toBe('held')
    })

    // L'appli passe en arrière-plan : le téléphone relâche le verrou.
    visibility = 'hidden'
    act(() => {
      locks[0]!.drop()
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current).toBe('pending')
    expect(request).toHaveBeenCalledTimes(1)

    visibility = 'visible'
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => {
      expect(result.current).toBe('held')
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('relâche le verrou en partant', async () => {
    const { locks } = fakeWakeLock()
    const { result, unmount, rerender } = renderHook(({ on }) => useWakeLock(on), {
      initialProps: { on: true },
    })
    await waitFor(() => {
      expect(result.current).toBe('held')
    })
    rerender({ on: false })
    expect(result.current).toBe('off')
    expect(locks[0]?.release).toHaveBeenCalledTimes(1)

    rerender({ on: true })
    await waitFor(() => {
      expect(locks).toHaveLength(2)
    })
    await waitFor(() => {
      expect(result.current).toBe('held')
    })
    unmount()
    expect(locks[1]?.release).toHaveBeenCalledTimes(1)
  })
})
