import { describe, expect, it } from 'vitest'
import { frenchSpacing } from './typography'

describe('frenchSpacing', () => {
  it('remplace l’espace avant la ponctuation haute par une espace insécable', () => {
    expect(frenchSpacing('Astuce : serre ; vas-y ! Prêt ? 50 %')).toBe(
      'Astuce\u00a0: serre\u00a0; vas-y\u00a0! Prêt\u00a0? 50\u00a0%',
    )
  })

  it('protège l’intérieur des guillemets', () => {
    expect(frenchSpacing('« creux »')).toBe('«\u00a0creux\u00a0»')
  })

  it('ne touche pas aux heures ni au texte sans espace', () => {
    expect(frenchSpacing('À 10:30, pas d’espace:ici')).toBe('À 10:30, pas d’espace:ici')
  })

  it('est idempotente', () => {
    const once = frenchSpacing('Garde le dos droit : regarde devant !')
    expect(frenchSpacing(once)).toBe(once)
  })
})
