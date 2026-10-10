/** Petits calculs de couleurs pour garder un texte lisible quelle que soit la couleur choisie. */

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const n = Number.parseInt(full.slice(0, 6), 16)
  if (Number.isNaN(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

/** Mélange de deux couleurs : t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  return rgbToHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t])
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Rapport de contraste WCAG entre deux couleurs (1 à 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export const INK_DARK = '#0b0b0f'
export const INK_LIGHT = '#ffffff'

/** Couleur du texte posé sur un fond plein de cette couleur. */
export function readableOn(background: string): string {
  return contrast(background, INK_LIGHT) >= contrast(background, INK_DARK) ? INK_LIGHT : INK_DARK
}

/**
 * Variante de la couleur d'accent utilisable comme texte : on l'assombrit (thème clair) ou on
 * l'éclaircit (thème sombre) jusqu'à un contraste suffisant sur tous les fonds donnés.
 */
export function readableAccent(
  accent: string,
  backgrounds: string[],
  dark: boolean,
  minContrast = 4.6,
): string {
  const target = dark ? '#ffffff' : '#000000'
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const candidate = mix(accent, target, t)
    if (backgrounds.every((bg) => contrast(candidate, bg) >= minContrast)) return candidate
  }
  return dark ? '#ffffff' : '#000000'
}
