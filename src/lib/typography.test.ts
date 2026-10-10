import { describe, expect, it } from 'vitest'
import { frenchSpacing, joinFrench, lowerFirst } from './typography'

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

describe('joinFrench', () => {
  it('énumère avec des virgules puis « et »', () => {
    expect(joinFrench([])).toBe('')
    expect(joinFrench(['lundi'])).toBe('lundi')
    expect(joinFrench(['lundi', 'mardi'])).toBe('lundi et mardi')
    expect(joinFrench(['lundi', 'mardi', 'jeudi'])).toBe('lundi, mardi et jeudi')
  })
})

describe('lowerFirst', () => {
  it('met la première lettre en minuscule', () => {
    expect(lowerFirst('Pompes archer')).toBe('pompes archer')
    expect(lowerFirst('Élastiques')).toBe('élastiques')
    expect(lowerFirst('Sangles de suspension (TRX)')).toBe('sangles de suspension (TRX)')
  })

  it('garde les sigles et les noms à tiret', () => {
    expect(lowerFirst('L-sit groupé')).toBe('L-sit groupé')
    expect(lowerFirst('HSPU au mur')).toBe('HSPU au mur')
    expect(lowerFirst('V')).toBe('V')
    expect(lowerFirst('')).toBe('')
  })
})
