import { NBSP } from './typography'
import {
  clamp,
  formatBodyWeight,
  formatDollars,
  formatNumber,
  formatWeight,
  kgToUnit,
  parseNumber,
  unitToKg,
} from './units'

describe('unités', () => {
  it('convertit kg et lb dans les deux sens', () => {
    expect(kgToUnit(10, 'kg')).toBe(10)
    expect(kgToUnit(10, 'lb')).toBeCloseTo(22.046, 2)
    expect(unitToKg(kgToUnit(12.5, 'lb'), 'lb')).toBeCloseTo(12.5, 6)
  })

  it('formate les poids à la française', () => {
    expect(formatWeight(12.5, 'kg')).toBe('12,5 kg')
    expect(formatWeight(2, 'kg')).toBe('2 kg')
    expect(formatWeight(10, 'lb')).toBe('22 lb')
    expect(formatBodyWeight(72.94, 'kg')).toBe('72,9 kg')
    expect(formatBodyWeight(75, 'kg')).toBe('75 kg')
    expect(formatBodyWeight(80, 'lb')).toBe('176,4 lb')
    expect(formatNumber(1250)).toMatch(/^1\s?250$/)
  })

  it('formate les dollars au centime, à la française', () => {
    expect(formatDollars(6.722)).toBe(`6,72${NBSP}$`)
    expect(formatDollars(6.7)).toBe(`6,70${NBSP}$`)
    expect(formatDollars(0.16955)).toBe(`0,17${NBSP}$`)
    expect(formatDollars(0)).toBe(`0,00${NBSP}$`)
    expect(formatDollars(1234.5)).toMatch(/^1\s?234,50\u00a0\$$/)
  })

  it('lit les nombres saisis avec une virgule ou un point', () => {
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber(' 7.25 ')).toBe(7.25)
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('1e5')).toBeNull()
  })

  it('borne une valeur', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
  })
})
