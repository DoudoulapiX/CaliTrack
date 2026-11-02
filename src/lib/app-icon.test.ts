import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  APP_ICON,
  APP_ICON_FILES,
  FAVICON_RADIUS,
  appIconArc,
  appIconRing,
  appIconStrap,
  appIconSvg,
} from './app-icon'

const read = (path: string) => readFileSync(join(process.cwd(), path))

/** Largeur et hauteur d'un PNG, lues dans son en-tête (IHDR). */
function pngSize(file: string): { width: number; height: number } {
  const png = read(`public/${file}`)
  expect(png.subarray(1, 4).toString('latin1')).toBe('PNG')
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe('icône de l’appli', () => {
  it('a des fichiers à jour dans public/ (sinon : npm run data:icons)', () => {
    expect(read('public/favicon.svg').toString('utf8')).toBe(appIconSvg({ radius: FAVICON_RADIUS }))
    for (const { file, size } of APP_ICON_FILES) {
      expect(pngSize(file), file).toEqual({ width: size, height: size })
    }
  })

  it('donne à iOS une icône de 180 pixels et au manifeste les fichiers qu’il annonce', () => {
    const html = read('index.html').toString('utf8')
    const config = read('vite.config.ts').toString('utf8')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
    expect(APP_ICON_FILES).toContainEqual({ file: 'icons/apple-touch-icon.png', size: 180, scale: 1 })
    for (const { file, size } of APP_ICON_FILES.filter(({ file }) => file !== 'icons/apple-touch-icon.png')) {
      expect(config).toContain(`src: '${file}', sizes: '${size}x${size}'`)
    }
  })

  it('garde l’anneau dans la zone sûre de l’icône découpable d’Android', () => {
    const maskable = APP_ICON_FILES.find(({ file }) => file.includes('maskable'))!
    const { cx, cy, outer } = appIconRing(maskable.scale)
    // Point de l'anneau le plus loin du centre de l'icône : la zone sûre est un disque de 40 % de la taille.
    expect(Math.hypot(cx - 256, cy - 256) + outer).toBeLessThanOrEqual(0.4 * APP_ICON.size)
  })

  it('laisse une marge autour de l’anneau sur l’écran d’accueil', () => {
    const { cx, cy, outer } = appIconRing(1)
    expect(cx - outer).toBeGreaterThanOrEqual(48)
    expect(APP_ICON.size - (cx + outer)).toBeGreaterThanOrEqual(48)
    expect(APP_ICON.size - (cy + outer)).toBeGreaterThanOrEqual(48)
  })

  it('fait partir la sangle du bord haut jusqu’à la boucle, quelle que soit la réduction', () => {
    for (const { scale } of APP_ICON_FILES) {
      const strap = appIconStrap(scale)
      const buckleTop = 256 + (APP_ICON.buckles[0].y - 256) * scale
      expect(strap.top).toBeLessThan(0)
      expect(strap.bottom).toBeGreaterThan(buckleTop)
    }
    expect(appIconStrap(0.5)).toEqual({ top: -10, bottom: 198 })
  })

  it('remplit l’anneau aux trois quarts environ, en partant de la sangle', () => {
    const { circumference, filled, rotate } = appIconArc()
    expect(filled / circumference).toBeCloseTo(0.72, 3)
    expect(rotate).toBe(-77)
    expect(appIconSvg()).toContain(`stroke-dasharray="${filled} ${circumference}"`)
    expect(appIconSvg({ scale: 0.78 })).toContain('scale(0.78)')
  })

  it('anime le remplissage depuis un anneau vide jusqu’à la partie remplie', () => {
    const css = read('src/index.css').toString('utf8')
    const keyframes = css.slice(css.indexOf('@keyframes app-icon-fill'))
    expect(keyframes).toMatch(new RegExp(`from \\{\\s*stroke-dashoffset: ${appIconArc().filled};`))
    expect(keyframes).toMatch(/to \{\s*stroke-dashoffset: 0;/)
  })
})
