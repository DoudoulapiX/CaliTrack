import type { EstimatedItem } from '@/content/ai/meal-photo'
import { ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import {
  addItemsLabel,
  itemsAddedText,
  keptTotal,
  photoItemLine,
  photoItems,
  rescaleItem,
} from './photo-view'

const NB = '\u00a0'

const rice: EstimatedItem = {
  name: 'Riz blanc cuit',
  grams: 180,
  nutrients: { ...ZERO_NUTRIENTS, kcal: 234, protein: 4.9, carbs: 51.8, fat: 0.5 },
}
const chicken: EstimatedItem = {
  name: 'Blanc de poulet',
  grams: 150,
  nutrients: { ...ZERO_NUTRIENTS, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 },
}

describe('aliments reconnus sur une photo', () => {
  it('sont tous gardés au départ, chacun avec son identifiant', () => {
    expect(photoItems([rice, chicken])).toEqual([
      { ...rice, id: '0', keep: true },
      { ...chicken, id: '1', keep: true },
    ])
    expect(photoItemLine(rice)).toBe(`180${NB}g · 234${NB}kcal`)
  })

  it('changent de valeurs avec la quantité, dans la même proportion', () => {
    expect(rescaleItem(rice, 90)).toEqual({
      name: 'Riz blanc cuit',
      grams: 90,
      nutrients: { ...ZERO_NUTRIENTS, kcal: 117, protein: 2.5, carbs: 25.9, fat: 0.3 },
    })
    expect(rescaleItem({ ...rice, nutrients: { ...rice.nutrients, salt: 0.4 } }, 360).nutrients.salt).toBe(
      0.8,
    )
    expect(rescaleItem({ ...rice, grams: 0 }, 50).nutrients).toEqual(rice.nutrients)
  })

  it('font un total avec les seuls aliments gardés', () => {
    const items = photoItems([rice, chicken])
    expect(keptTotal(items)).toEqual({ ...ZERO_NUTRIENTS, kcal: 482, protein: 51.4, carbs: 51.8, fat: 5.9 })
    expect(keptTotal(items.map((item) => ({ ...item, keep: item.id === '1' }))).kcal).toBe(248)
    expect(keptTotal([]).kcal).toBe(0)
  })

  it('disent combien d’aliments partent dans quel repas', () => {
    expect(addItemsLabel(3, 'lunch')).toBe('Ajouter 3 aliments au déjeuner')
    expect(addItemsLabel(1, 'breakfast')).toBe('Ajouter 1 aliment au petit-déjeuner')
    expect(addItemsLabel(0, 'dinner')).toBe('Garde au moins un aliment')
    expect(itemsAddedText(2, 'dinner')).toBe('2 aliments ajoutés au dîner')
    expect(itemsAddedText(1, 'snack')).toBe('1 aliment ajouté à la collation')
  })
})
