import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast } from '@/lib/color'
import { ACCENT_PRESETS, PALETTE, themeVars } from './theme'

const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

/** Variables --ct-* d'un bloc de index.css (`:root` pour le thème clair). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const block = css.slice(start, css.indexOf('}', start))
  const result: Record<string, string> = {}
  for (const [, name, value] of block.matchAll(/--ct-([\w-]+):\s*(#[0-9a-f]{6})/g)) {
    if (name && value) result[name] = value
  }
  return result
}

const THEMES = {
  light: tokens(':root'),
  // Le thème sombre ne redéfinit pas l'accent : il hérite de celui de :root.
  dark: { ...tokens(':root'), ...tokens("[data-theme='dark']") },
}

describe('couleurs des thèmes', () => {
  it.each(['light', 'dark'] as const)('reprennent les fonds de index.css (%s)', (theme) => {
    const t = THEMES[theme]
    expect(PALETTE[theme]).toEqual({ canvas: t.canvas, surface: t.surface, surface2: t['surface-2'] })
  })

  it.each(['light', 'dark'] as const)('ont un accent par défaut identique au calcul (%s)', (theme) => {
    const t = THEMES[theme]
    const vars = themeVars(theme, t.accent ?? '', false)
    expect({ soft: t['accent-soft'], text: t['accent-text'], ink: t['accent-ink'] }).toEqual({
      soft: vars.accentSoft,
      text: vars.accentText,
      ink: vars.accentInk,
    })
  })

  it.each(['light', 'dark'] as const)('gardent les textes lisibles sur tous les fonds (%s)', (theme) => {
    const t = THEMES[theme]
    const problems: string[] = []
    for (const ink of ['ink', 'ink-2', 'ink-3']) {
      for (const bg of ['canvas', 'surface', 'surface-2']) {
        const ratio = contrast(t[ink] ?? '', t[bg] ?? '')
        if (ratio < 4.5) problems.push(`${ink} sur ${bg} : ${ratio.toFixed(2)}`)
      }
    }
    for (const status of ['danger', 'success', 'warning', 'info']) {
      for (const bg of ['canvas', 'surface']) {
        const ratio = contrast(t[status] ?? '', t[bg] ?? '')
        if (ratio < 4.5) problems.push(`${status} sur ${bg} : ${ratio.toFixed(2)}`)
      }
    }
    expect(problems).toEqual([])
  })

  it('rend chaque couleur d’accent lisible, en clair comme en sombre', () => {
    const problems: string[] = []
    for (const { color, name } of ACCENT_PRESETS) {
      for (const theme of ['light', 'dark'] as const) {
        const vars = themeVars(theme, color, false)
        const palette = PALETTE[theme]
        for (const bg of [palette.canvas, palette.surface, palette.surface2, vars.accentSoft]) {
          if (contrast(vars.accentText, bg) < 4.5) problems.push(`${name} (${theme}) : texte sur ${bg}`)
        }
        if (contrast(vars.accentInk, color) < 4.5) problems.push(`${name} (${theme}) : texte sur bouton`)
      }
    }
    expect(problems).toEqual([])
  })
})
