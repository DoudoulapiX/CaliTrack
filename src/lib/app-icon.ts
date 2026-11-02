// Icône de l'appli : un anneau de gym suspendu à sa sangle, rempli comme une barre de progression.
// Dessinée dans un carré de 512 ; `npm run data:icons` en tire le favicon et les PNG de public/.
// Importé par scripts/build-icons.ts sous Node : aucun import ici.

export const APP_ICON_BG = '#0b0b0f'

const round = (value: number) => Number(value.toFixed(1))

const SIZE = 512
const CENTER = SIZE / 2

/** Pièces du dessin, partagées avec l'écran de chargement (`AppIconMark`). */
export const APP_ICON = {
  size: SIZE,
  cream: '#f5f5f7',
  track: '#2e2e36',
  /** Dégradé du fond : plus clair en haut, comme éclairé. */
  glow: '#25252d',
  /** Dégradé de la partie remplie, du haut gauche au bas droit de l'anneau. */
  fill: { from: '#ffa24f', to: '#f04e18', x1: 120, y1: 180, x2: 392, y2: 452 },
  ring: { cx: 256, cy: 304, r: 128, width: 56 },
  /** Part de l'anneau remplie, et où elle commence (degrés depuis midi, sens horaire) : juste après la sangle. */
  progress: 0.72,
  progressStartDeg: 13,
  /** Sangle (du bord haut à la boucle), boucle, puis passant qui tient l'anneau. */
  strap: { width: 26, bottom: 140, radius: 6 },
  buckles: [
    { x: 232, y: 116, width: 48, height: 40, rx: 10 },
    { x: 238, y: 140, width: 36, height: 72, rx: 10 },
  ],
} as const

const { cream: CREAM, track: TRACK, ring: RING, fill: FILL } = APP_ICON

/** Longueur de l'anneau et de sa partie remplie, pour `stroke-dasharray`. */
export function appIconArc(): { circumference: number; filled: number; rotate: number } {
  const circumference = 2 * Math.PI * RING.r
  return {
    circumference: round(circumference),
    filled: round(circumference * APP_ICON.progress),
    rotate: APP_ICON.progressStartDeg - 90,
  }
}

/** Une icône à produire : PNG carré de `size` pixels, dessin réduit de `scale` autour du centre. */
export interface AppIconFile {
  file: string
  size: number
  scale: number
}

// iOS (apple-touch-icon) arrondit lui-même les coins. L'icône « maskable » d'Android peut être découpée en
// cercle : son dessin doit tenir dans la zone sûre, un disque de 40 % de la taille autour du centre.
export const APP_ICON_FILES: readonly AppIconFile[] = [
  { file: 'icons/apple-touch-icon.png', size: 180, scale: 1 },
  { file: 'icons/icon-192.png', size: 192, scale: 1 },
  { file: 'icons/icon-512.png', size: 512, scale: 1 },
  { file: 'icons/icon-maskable-512.png', size: 512, scale: 0.78 },
]

/** Arrondi du favicon (onglet de Safari), proche de celui des icônes d'iOS. */
export const FAVICON_RADIUS = 112

/** Centre et rayon extérieur de l'anneau une fois le dessin réduit de `scale` autour du centre. */
export function appIconRing(scale = 1): { cx: number; cy: number; outer: number } {
  return {
    cx: round(CENTER + (RING.cx - CENTER) * scale),
    cy: round(CENTER + (RING.cy - CENTER) * scale),
    outer: round((RING.r + RING.width / 2) * scale),
  }
}

/** Haut et bas de la sangle : elle part toujours du bord haut, quelle que soit la réduction. */
export function appIconStrap(scale = 1): { top: number; bottom: number } {
  return { top: -10, bottom: round(CENTER + (APP_ICON.strap.bottom - CENTER) * scale) }
}

/** SVG de l'icône, carré de 512, avec des coins arrondis de `radius` (0 : carré plein). */
export function appIconSvg({ scale = 1, radius = 0 }: { scale?: number; radius?: number } = {}): string {
  const { circumference, filled, rotate } = appIconArc()
  const strap = appIconStrap(scale)
  const strapWidth = round(APP_ICON.strap.width * scale)
  const strapX = round(CENTER - strapWidth / 2)
  const group = `translate(${CENTER} ${CENTER}) scale(${scale}) translate(-${CENTER} -${CENTER})`
  const buckles = APP_ICON.buckles
    .map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.rx}"/>`)
    .join('\n    ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="bg" cx="50%" cy="30%" r="80%">
      <stop offset="0" stop-color="${APP_ICON.glow}"/>
      <stop offset="1" stop-color="${APP_ICON_BG}"/>
    </radialGradient>
    <linearGradient id="fill" gradientUnits="userSpaceOnUse" x1="${FILL.x1}" y1="${FILL.y1}" x2="${FILL.x2}" y2="${FILL.y2}">
      <stop offset="0" stop-color="${FILL.from}"/>
      <stop offset="1" stop-color="${FILL.to}"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" rx="${radius}" fill="url(#bg)"/>
  <g transform="${group}">
    <circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="${TRACK}" stroke-width="${RING.width}"/>
    <circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="url(#fill)" stroke-width="${RING.width}" stroke-linecap="round" stroke-dasharray="${filled} ${circumference}" transform="rotate(${rotate} ${RING.cx} ${RING.cy})"/>
  </g>
  <rect x="${strapX}" y="${strap.top}" width="${strapWidth}" height="${round(strap.bottom - strap.top)}" rx="${round(APP_ICON.strap.radius * scale)}" fill="${CREAM}"/>
  <g transform="${group}" fill="${CREAM}">
    ${buckles}
  </g>
</svg>
`
}
