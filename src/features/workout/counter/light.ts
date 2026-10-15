/*
 * La lumière de l'image : une copie de 32 × 24 pixels de la vidéo, une fois par seconde, dont on garde un
 * seul nombre (la luminance moyenne). Aucune image n'est gardée.
 */

/** Taille de la copie lue. */
export const LIGHT_WIDTH = 32
export const LIGHT_HEIGHT = 24

/** Luminance moyenne (Rec. 601) de pixels RGBA, de 0 (noir) à 255 (blanc) ; 0 sans pixel. */
export function meanLuma(rgba: Uint8ClampedArray): number {
  const pixels = Math.floor(rgba.length / 4)
  if (pixels === 0) return 0
  let sum = 0
  for (let i = 0; i < pixels * 4; i += 4) {
    sum += 0.299 * (rgba[i] ?? 0) + 0.587 * (rgba[i + 1] ?? 0) + 0.114 * (rgba[i + 2] ?? 0)
  }
  return sum / pixels
}

/**
 * Lumière moyenne de l'image affichée par la vidéo, de 0 à 255, ou null quand elle ne se mesure pas (pas
 * encore d'image, canvas qui ne dessine pas). `canvas` : celui à réutiliser d'une mesure à l'autre.
 */
export function sampleLight(video: HTMLVideoElement, canvas?: HTMLCanvasElement): number | null {
  if (
    video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    video.videoWidth <= 0 ||
    video.videoHeight <= 0
  ) {
    return null
  }
  const target = canvas ?? document.createElement('canvas')
  if (target.width !== LIGHT_WIDTH) target.width = LIGHT_WIDTH
  if (target.height !== LIGHT_HEIGHT) target.height = LIGHT_HEIGHT
  const ctx = target.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  try {
    ctx.drawImage(video, 0, 0, LIGHT_WIDTH, LIGHT_HEIGHT)
    return meanLuma(ctx.getImageData(0, 0, LIGHT_WIDTH, LIGHT_HEIGHT).data)
  } catch {
    // Image pas lisible à cet instant : la prochaine mesure dira.
    return null
  }
}
