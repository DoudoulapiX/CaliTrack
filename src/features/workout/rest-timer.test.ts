import { act, renderHook } from '@testing-library/react'
import { cue } from './cues'
import { adjustRest, restRemainingSec, skipRest, startRest, useRest, type RestState } from './rest-timer'

vi.mock('./cues', () => ({ cue: vi.fn() }))

const STORAGE_KEY = 'calitrack.rest'
const CUES = { sound: true, voice: true }
const START = new Date('2026-10-10T18:00:00.000Z').getTime()

function rest() {
  return renderHook(() => useRest())
}

function stored(): Partial<RestState> | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as Partial<RestState>) : null
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  vi.mocked(cue).mockClear()
})

afterEach(() => {
  act(() => {
    skipRest()
  })
  vi.useRealTimers()
})

describe('minuteur de repos', () => {
  it('décompte les trois dernières secondes, puis annonce la suite', () => {
    const { result } = rest()
    act(() => {
      startRest({
        workoutId: 'w',
        seconds: 10,
        next: 'Dips · série 2 sur 3',
        announce: 'Dips, série 2 sur 3',
        cues: CUES,
      })
    })
    expect(result.current).toMatchObject({ workoutId: 'w', totalSec: 10, endsAt: START + 10_000 })
    expect(stored()).toMatchObject({ workoutId: 'w', endsAt: START + 10_000, next: 'Dips · série 2 sur 3' })
    expect(restRemainingSec(result.current!, Date.now())).toBe(10)

    act(() => {
      vi.advanceTimersByTime(6_999)
    })
    expect(cue).not.toHaveBeenCalled()
    expect(restRemainingSec(result.current!, Date.now())).toBe(4)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(cue).toHaveBeenLastCalledWith('tick', CUES)
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(cue).toHaveBeenCalledTimes(3)
    expect(result.current).not.toBeNull()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(cue).toHaveBeenLastCalledWith('go', CUES, 'C’est reparti : Dips, série 2 sur 3')
    expect(result.current).toBeNull()
    expect(stored()).toBeNull()
  })

  it('ajoute ou retire du temps, et s’arrête sans signal', () => {
    const { result } = rest()
    act(() => {
      startRest({ workoutId: 'w', seconds: 60, next: null, announce: null, cues: CUES })
    })
    act(() => {
      adjustRest(15)
    })
    expect(result.current).toMatchObject({ totalSec: 75, endsAt: START + 75_000 })
    act(() => {
      adjustRest(-30)
    })
    expect(result.current).toMatchObject({ totalSec: 45, endsAt: START + 45_000 })

    // Les signaux suivent la nouvelle fin.
    act(() => {
      vi.advanceTimersByTime(44_999)
    })
    expect(cue).toHaveBeenCalledTimes(3)
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(cue).toHaveBeenLastCalledWith('go', CUES, 'C’est reparti')

    // Retirer plus que ce qui reste : le repos s'arrête, sans bip.
    act(() => {
      startRest({ workoutId: 'w', seconds: 20, next: null, announce: null, cues: CUES })
    })
    vi.mocked(cue).mockClear()
    act(() => {
      adjustRest(-30)
    })
    expect(result.current).toBeNull()
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(cue).not.toHaveBeenCalled()

    // Passer : rien ne sonne non plus.
    act(() => {
      startRest({ workoutId: 'w', seconds: 20, next: null, announce: null, cues: CUES })
    })
    act(() => {
      skipRest()
    })
    expect(result.current).toBeNull()
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    expect(cue).not.toHaveBeenCalled()

    // Un repos de zéro seconde n'en est pas un.
    act(() => {
      startRest({ workoutId: 'w', seconds: 0, next: null, announce: null, cues: CUES })
    })
    expect(result.current).toBeNull()
    expect(restRemainingSec({ endsAt: START }, START + 5_000)).toBe(0)
  })

  it('ne joue pas les signaux en retard (appli restée en arrière-plan)', () => {
    const { result } = rest()
    act(() => {
      startRest({ workoutId: 'w', seconds: 10, next: null, announce: 'Tractions', cues: CUES })
    })
    // Le téléphone a dormi : l'horloge a avancé sans que les minuteurs ne partent.
    vi.setSystemTime(START + 30_000)
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(cue).not.toHaveBeenCalled()
    expect(result.current).toBeNull()
  })

  it('retrouve le repos en cours après une fermeture de l’appli', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        workoutId: 'w',
        endsAt: START + 5_000,
        totalSec: 90,
        next: 'Pompes',
        announce: null,
        cues: { sound: false, voice: false },
      }),
    )
    vi.resetModules()
    const fresh = await import('./rest-timer')
    const { result } = renderHook(() => fresh.useRest())
    expect(result.current).toEqual({
      workoutId: 'w',
      endsAt: START + 5_000,
      totalSec: 90,
      next: 'Pompes',
      announce: null,
      cues: { sound: false, voice: false },
    })
    act(() => {
      vi.advanceTimersByTime(5_000)
    })
    expect(result.current).toBeNull()
    expect(cue).toHaveBeenCalledWith('go', { sound: false, voice: false }, 'C’est reparti')
  })

  it('oublie un repos fini pendant la fermeture, ou illisible', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ workoutId: 'w', endsAt: START - 1_000, totalSec: 90, cues: {} }),
    )
    vi.resetModules()
    let fresh = await import('./rest-timer')
    expect(renderHook(() => fresh.useRest()).result.current).toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    localStorage.setItem(STORAGE_KEY, '{pas du json')
    vi.resetModules()
    fresh = await import('./rest-timer')
    expect(renderHook(() => fresh.useRest()).result.current).toBeNull()

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ workoutId: 'w' }))
    vi.resetModules()
    fresh = await import('./rest-timer')
    expect(renderHook(() => fresh.useRest()).result.current).toBeNull()
  })
})
