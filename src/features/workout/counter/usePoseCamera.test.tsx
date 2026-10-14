import { renderHook } from '@testing-library/react'
import { fakeMediaDevices, fakePoseEngine, manualScheduler } from '@/test/pose'
import { NO_POSE_STATS, usePoseCamera, type PoseCameraOptions } from './usePoseCamera'

describe('usePoseCamera (version d’attente)', () => {
  it('ne démarre ni le moteur ni la caméra, même feuille ouverte et caméra demandée', () => {
    const camera = fakeMediaDevices()
    const { openEngine } = fakePoseEngine()
    const openCamera = vi.fn(() => Promise.resolve({} as MediaStream))
    const onFrame = vi.fn()
    const options: PoseCameraOptions = {
      open: true,
      cameraOn: true,
      analysing: true,
      facing: 'user',
      delegate: 'CPU',
      joints: [11, 12],
      onFrame,
      onHidden: vi.fn(),
      deps: { openEngine, openCamera, scheduler: manualScheduler() },
    }
    try {
      const { result, rerender } = renderHook(() => usePoseCamera(options))
      expect(result.current.state).toEqual({ kind: 'idle' })
      expect(result.current.stats).toEqual(NO_POSE_STATS)
      expect(result.current.videoRef.current).toBeNull()
      expect(result.current.overlayRef.current).toBeNull()
      const { retry } = result.current
      retry()
      rerender()
      expect(result.current.retry).toBe(retry)
      expect(result.current.state).toEqual({ kind: 'idle' })
      expect(openEngine).not.toHaveBeenCalled()
      expect(openCamera).not.toHaveBeenCalled()
      expect(camera.getUserMedia).not.toHaveBeenCalled()
      expect(onFrame).not.toHaveBeenCalled()
    } finally {
      camera.restore()
    }
  })
})
