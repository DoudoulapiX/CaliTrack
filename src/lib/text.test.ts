import { normalizeName } from './text'

describe('normalizeName', () => {
  it('ignore la casse, les accents et les ligatures', () => {
    expect(normalizeName('Crème Fraîche')).toBe('creme fraiche')
    expect(normalizeName('ŒUFS')).toBe('oeufs')
    expect(normalizeName('Cæsar')).toBe('caesar')
  })

  it('resserre les espaces, insécables comprises', () => {
    expect(normalizeName('  pâtes \u00a0 complètes\t')).toBe('pates completes')
    expect(normalizeName('   ')).toBe('')
  })

  it('garde les chiffres et la ponctuation', () => {
    expect(normalizeName('Yaourt 0 %')).toBe('yaourt 0 %')
  })
})
