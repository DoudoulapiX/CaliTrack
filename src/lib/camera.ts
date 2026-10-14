/*
 * La caméra du téléphone : l'ouvrir, l'arrêter, et dire pourquoi elle n'a pas démarré. Servi au scan des
 * codes-barres et au compteur de répétitions.
 */

export type CameraProblem = 'denied' | 'unavailable' | 'error'

/** Pourquoi la caméra n'a pas démarré : accès refusé, pas de caméra, ou autre souci. */
export function cameraProblem(error: unknown): CameraProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') {
    return 'unavailable'
  }
  return 'error'
}

/** Caméra de face (« user », l'écran vers soi) ou de dos (« environment »). */
export type Facing = 'user' | 'environment'

/**
 * Ouvre la caméra demandée, en petite taille (640 × 480 suffit au squelette, 30 images par seconde au plus).
 * Sans `navigator.mediaDevices` (hors HTTPS, navigateur sans caméra) : échoue comme s'il n'y avait pas de caméra.
 */
export async function openCamera(facing: Facing): Promise<MediaStream> {
  const devices = navigator.mediaDevices as MediaDevices | undefined
  if (typeof devices?.getUserMedia !== 'function') throw new DOMException('Pas de caméra', 'NotFoundError')
  return devices.getUserMedia({
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
    audio: false,
  })
}

/** Arrête la caméra (chaque piste du flux) et vide la vidéo qui l'affichait. */
export function stopStream(stream: MediaStream | null, video?: HTMLVideoElement | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
  if (video) video.srcObject = null
}
