export type WeightUnit = 'kg' | 'lb'

const LB_PER_KG = 2.2046226218

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

/** Affiche un poids avec l'unité choisie : « 12,5 kg ». */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const v = kgToUnit(kg, unit)
  const rounded = unit === 'kg' ? roundTo(v, 0.25) : roundTo(v, 0.5)
  return `${formatNumber(rounded)} ${unit}`
}

/** Poids du corps, au dixième près : « 72,9 kg » (une charge, elle, s'arrondit aux disques). */
export function formatBodyWeight(kg: number, unit: WeightUnit): string {
  return `${formatNumber(Math.round(kgToUnit(kg, unit) * 10) / 10, 1)} ${unit}`
}

/** Nombre au format français, sans zéros inutiles : 12,5 / 3 / 1 250. */
export function formatNumber(value: number, maxFractionDigits = 2): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxFractionDigits }).format(value)
}

/** Lit un nombre saisi à la française (virgule ou point). Renvoie null si invalide. */
export function parseNumber(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '').replace(',', '.')
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
