import { useEffect } from 'react'
import { mix, readableAccent, readableOn } from '@/lib/color'
import type { ThemeMode } from '@/db/types'

export const THEME_STORAGE_KEY = 'calitrack.theme'

export const ACCENT_PRESETS: { color: string; name: string }[] = [
  { color: '#ff6a2b', name: 'Orange' },
  { color: '#e11d48', name: 'Framboise' },
  { color: '#db2777', name: 'Rose' },
  { color: '#7c3aed', name: 'Violet' },
  { color: '#2563eb', name: 'Bleu' },
  { color: '#0891b2', name: 'Turquoise' },
  { color: '#16a34a', name: 'Vert' },
  { color: '#ca8a04', name: 'Or' },
]

const PALETTE = {
  light: { canvas: '#f2f2f7', surface: '#ffffff', surface2: '#f2f2f7' },
  dark: { canvas: '#0b0b0f', surface: '#1c1c1f', surface2: '#26262a' },
}

export function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && systemDark)
}

export interface ThemeVars {
  theme: 'light' | 'dark'
  accent: string
  accentInk: string
  accentSoft: string
  accentText: string
  canvas: string
}

/** Calcule les couleurs dérivées de l'accent pour un thème donné. */
export function themeVars(mode: ThemeMode, accent: string, systemDark: boolean): ThemeVars {
  const dark = resolveDark(mode, systemDark)
  const palette = dark ? PALETTE.dark : PALETTE.light
  const accentSoft = mix(palette.surface, accent, dark ? 0.2 : 0.14)
  return {
    theme: dark ? 'dark' : 'light',
    accent,
    accentInk: readableOn(accent),
    accentSoft,
    accentText: readableAccent(accent, [palette.canvas, palette.surface, palette.surface2, accentSoft], dark),
    canvas: palette.canvas,
  }
}

export function applyTheme(mode: ThemeMode, accent: string, systemDark: boolean = prefersDark()): void {
  const vars = themeVars(mode, accent, systemDark)
  const root = document.documentElement
  root.setAttribute('data-theme', vars.theme)
  root.style.setProperty('--ct-accent', vars.accent)
  root.style.setProperty('--ct-accent-ink', vars.accentInk)
  root.style.setProperty('--ct-accent-soft', vars.accentSoft)
  root.style.setProperty('--ct-accent-text', vars.accentText)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', vars.canvas)
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode, accent }))
  } catch {
    /* stockage indisponible : le thème sera recalculé au prochain lancement */
  }
}

/** Applique le thème et suit le réglage clair/sombre de l'iPhone en mode « automatique ». */
export function useTheme(mode: ThemeMode, accent: string): void {
  useEffect(() => {
    applyTheme(mode, accent)
    if (mode !== 'system' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyTheme(mode, accent, query.matches)
    }
    query.addEventListener('change', onChange)
    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [mode, accent])
}
