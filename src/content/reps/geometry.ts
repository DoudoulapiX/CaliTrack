import type { ImagePoint } from './types.ts'

/*
 * Calculs de base du compteur : angles, distances, points en pixels. Les coordonnées normalisées (0 à 1) n'ont
 * pas la même échelle en largeur et en hauteur : toutes les mesures sur l'image se font en pixels.
 */

/** Un point sur l'image, en pixels (y vers le bas). */
export type Pixel = readonly [x: number, y: number]

/** Degrés par radian. */
export const DEG = 180 / Math.PI

/** Angle en b (degrés, 0 à 180) entre b→a et b→c, en 2D ou en 3D ; NaN quand un segment est nul. */
export function jointAngle(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  let dot = 0
  let normA = 0
  let normC = 0
  for (let i = 0; i < b.length; i++) {
    const u = (a[i] ?? 0) - (b[i] ?? 0)
    const v = (c[i] ?? 0) - (b[i] ?? 0)
    dot += u * v
    normA += u * u
    normC += v * v
  }
  const norm = Math.sqrt(normA * normC)
  if (norm === 0) return Number.NaN
  return Math.acos(Math.max(-1, Math.min(1, dot / norm))) * DEG
}

export function distance(a: Pixel, b: Pixel): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function midpoint(a: Pixel, b: Pixel): Pixel {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** Un point normalisé, en pixels d'une image de cette taille. */
export function toPixel(point: ImagePoint, width: number, height: number): Pixel {
  return [point[0] * width, point[1] * height]
}

/** Le point est dans l'image, à plus de `margin` (fraction de la largeur ou de la hauteur) du bord. */
export function isInside(point: ImagePoint, margin: number): boolean {
  return point[0] >= margin && point[0] <= 1 - margin && point[1] >= margin && point[1] <= 1 - margin
}

/**
 * Inclinaison du segment haut → bas par rapport à la verticale de l'image, en degrés : 0 quand `bottom` est
 * juste sous `top`, 90 à l'horizontale, 180 quand il est juste au-dessus.
 */
export function tiltFromVertical(top: Pixel, bottom: Pixel): number {
  return Math.abs(Math.atan2(bottom[0] - top[0], bottom[1] - top[1])) * DEG
}

/** Médiane haute (pour un nombre pair de valeurs, la plus grande des deux du milieu) ; NaN sans valeur. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

/** Poids d'une nouvelle valeur dans un lissage exponentiel de constante `tauMs`, quel que soit l'écart `dtMs`. */
export function smoothingWeight(dtMs: number, tauMs: number): number {
  return 1 - Math.exp(-dtMs / tauMs)
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
