import { useEffect, useRef, useState } from 'react'
import { isValidBarcode } from '@/content/nutrition/off'
import { cameraProblem, createBarcodeReader, type CameraProblem } from './scanner'

export type ScannerState = 'starting' | 'scanning' | CameraProblem

/** Temps entre deux lectures de l'image de la caméra, en millisecondes. */
const SCAN_INTERVAL_MS = 200

/**
 * Filme avec la caméra arrière et lit les codes-barres tant que `active` est vrai. Au premier code
 * valable, la caméra s'arrête et `onCode` le reçoit.
 */
export function useBarcodeScanner(active: boolean, onCode: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<ScannerState>('starting')
  const onCodeRef = useRef(onCode)
  useEffect(() => {
    onCodeRef.current = onCode
  })

  useEffect(() => {
    if (!active) return
    // Lu par une fonction : l'arrêt peut survenir pendant une attente, ce que TypeScript ne voit pas.
    const run = { stopped: false }
    const stopped = () => run.stopped
    let stream: MediaStream | null = null
    let timer: number | undefined
    const stop = () => {
      run.stopped = true
      window.clearTimeout(timer)
      for (const track of stream?.getTracks() ?? []) track.stop()
      if (videoRef.current) videoRef.current.srcObject = null
    }
    const fail = (problem: CameraProblem) => {
      if (!stopped()) setState(problem)
    }

    const start = async () => {
      // `mediaDevices` manque hors HTTPS et sur les navigateurs sans caméra.
      const devices = navigator.mediaDevices as MediaDevices | undefined
      if (typeof devices?.getUserMedia !== 'function') {
        fail('unavailable')
        return
      }
      try {
        stream = await devices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
      } catch (error) {
        fail(cameraProblem(error))
        return
      }
      const video = videoRef.current
      if (stopped() || !video) {
        stop()
        return
      }
      video.srcObject = stream
      await video.play().catch(() => undefined)
      let reader: Awaited<ReturnType<typeof createBarcodeReader>>
      try {
        reader = await createBarcodeReader()
      } catch {
        // Sans lecteur, la caméra ne sert à rien : on la coupe.
        fail('error')
        stop()
        return
      }
      if (stopped()) return
      setState('scanning')
      const tick = async () => {
        if (stopped()) return
        try {
          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            const found = await reader.detect(video)
            const code = found.map((barcode) => barcode.rawValue.trim()).find(isValidBarcode)
            if (code !== undefined && !stopped()) {
              stop()
              onCodeRef.current(code)
              return
            }
          }
        } catch {
          // Image pas encore prête : on réessaie à la lecture suivante.
        }
        timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS)
      }
      void tick()
    }

    void start()
    return stop
  }, [active])

  return { videoRef, state: active ? state : 'starting' }
}
