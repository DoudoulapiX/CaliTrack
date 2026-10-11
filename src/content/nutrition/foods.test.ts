import type { Food } from '@/db/types'
import { foodItem, loadCiqual, matchScore, normalize, searchFoods, words, type FoodItem } from './foods'

describe('aliments', () => {
  let ciqual: FoodItem[]

  beforeAll(async () => {
    ciqual = await loadCiqual()
  })

  it('charge la table Ciqual une seule fois', async () => {
    expect(ciqual.length).toBeGreaterThan(3000)
    expect(await loadCiqual()).toBe(ciqual)
    const apple = ciqual.find((food) => food.name === 'Pomme, chair et peau, crue')
    expect(apple).toMatchObject({ source: 'ciqual', detail: 'fruits' })
    expect(apple?.per100.kcal).toBeGreaterThan(40)
    expect(apple?.id).toMatch(/^ciqual:\d+$/)
  })

  it('compare sans accents, ligatures ni pluriels', () => {
    expect(normalize('Œuf à la coque')).toBe('oeuf a la coque')
    expect(words('Pâtes sèches, cuites')).toEqual(['pate', 'seche', 'cuite'])
    expect(words('Choux de Bruxelles')).toEqual(['chou', 'de', 'bruxelle'])
    expect(words('Pâté, pâtés et café')).toEqual(['patee', 'patee', 'et', 'cafee'])
  })

  it('trouve un aliment par le début de ses mots', () => {
    expect(matchScore('Poulet, filet, rôti', ['poul', 'fil'])).not.toBeNull()
    expect(matchScore('Poulet, filet, rôti', ['let'])).toBeNull()
    expect(matchScore('Poulet', [])).toBeNull()
  })

  it('met en tête les aliments dont le nom commence par le mot cherché', () => {
    const [first] = searchFoods(ciqual, 'pomme')
    expect(normalize(first?.name ?? '')).toMatch(/^pomme\b/)
    const eggs = searchFoods(ciqual, 'oeufs durs')
    expect(eggs.length).toBeGreaterThan(0)
    expect(normalize(eggs[0]?.name ?? '')).toContain('oeuf')
    expect(searchFoods(ciqual, 'pâtes cuites').every((food) => /p[aâ]te/i.test(food.name))).toBe(true)
    // « pates » sans accent : les pâtes avant les pâtés.
    expect(searchFoods(ciqual, 'pates')[0]?.name).toMatch(/^Pâtes? /)
    expect(searchFoods(ciqual, 'pâté')[0]?.name).toMatch(/^Pâté/)
  })

  it('ignore les petits mots et limite le nombre de résultats', () => {
    expect(searchFoods(ciqual, 'de la')).toEqual([])
    expect(searchFoods(ciqual, '   ')).toEqual([])
    expect(searchFoods(ciqual, 'a', 10).length).toBeLessThanOrEqual(10)
  })

  it('cherche aussi dans la marque des produits perso', () => {
    const food: Food = {
      id: 'off:3017620422003',
      source: 'off',
      name: 'Pâte à tartiner',
      brand: 'Nutella',
      barcode: '3017620422003',
      per100: {
        kcal: 539,
        protein: 6.3,
        carbs: 57.5,
        fat: 30.9,
        fiber: null,
        sugars: 56.3,
        satFat: 10.6,
        salt: 0.11,
      },
      servingG: 15,
      createdAt: 'x',
      updatedAt: 'x',
    }
    const item = foodItem(food)
    expect(item).toMatchObject({ detail: 'Nutella', portionG: 15 })
    expect(searchFoods([item], 'nutella')).toEqual([item])
  })
})
