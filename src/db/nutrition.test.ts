import { resetDb } from '@/test/db'
import type { FoodItem } from '@/content/nutrition/foods'
import { ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import { db } from './db'
import {
  addEntries,
  copyEntries,
  deleteEntries,
  entryFromEstimate,
  entryFromFood,
  foodByBarcode,
  quickEntry,
  recentFoods,
  saveFood,
  updateEntry,
  updateNutritionGoals,
} from './nutrition'
import { ensureSeeded } from './seed'
import type { Food } from './types'

const rice: FoodItem = {
  id: 'ciqual:9111',
  source: 'ciqual',
  name: 'Riz blanc, cuit',
  detail: 'pâtes, riz et céréales',
  per100: { kcal: 145, protein: 2.9, carbs: 31.4, fat: 0.4, fiber: 1.3, sugars: 0, satFat: 0.1, salt: 0.01 },
  portionG: 110,
}
const chicken: FoodItem = {
  id: 'ciqual:36018',
  source: 'ciqual',
  name: 'Poulet, filet, grillé',
  detail: 'viandes cuites',
  per100: { ...ZERO_NUTRIENTS, kcal: 150, protein: 30, carbs: 0, fat: 3 },
  portionG: 140,
}

describe('journal des repas', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('note un aliment avec les valeurs de la quantité mangée', async () => {
    const [entry] = await addEntries([entryFromFood(rice, 200, '2026-10-21', 'lunch', 'now')])
    expect(entry).toMatchObject({
      date: '2026-10-21',
      meal: 'lunch',
      source: 'ciqual',
      foodId: 'ciqual:9111',
      grams: 200,
      nutrients: { kcal: 290, protein: 5.8, carbs: 62.8, fat: 0.8 },
    })
    expect(await db.foodEntries.count()).toBe(1)
  })

  it('recalcule les valeurs quand la quantité change', async () => {
    const [entry] = await addEntries([entryFromFood(rice, 200, '2026-10-21', 'lunch')])
    const updated = await updateEntry(entry!.id, { grams: 100, meal: 'dinner' })
    expect(updated).toMatchObject({ grams: 100, meal: 'dinner', nutrients: { kcal: 145 } })
  })

  it('garde l’estimation de l’IA et permet de corriger la quantité', async () => {
    const estimate = entryFromEstimate(
      {
        name: 'Pâtes bolognaise',
        grams: 300,
        nutrients: { ...ZERO_NUTRIENTS, kcal: 480, protein: 24, carbs: 60, fat: 15 },
      },
      '2026-10-21',
      'dinner',
    )
    expect(estimate).toMatchObject({ source: 'ai', foodId: null, per100: { kcal: 160, protein: 8 } })
    const [saved] = await addEntries([estimate])
    expect((await updateEntry(saved!.id, { grams: 150 })).nutrients.kcal).toBe(240)
  })

  it('modifie les valeurs d’une saisie rapide, pas sa quantité', async () => {
    const [entry] = await addEntries([
      quickEntry(
        'Restaurant',
        { ...ZERO_NUTRIENTS, kcal: 900, protein: 40, carbs: 90, fat: 35 },
        '2026-10-21',
        'lunch',
      ),
    ])
    const updated = await updateEntry(entry!.id, {
      grams: 300,
      nutrients: { ...ZERO_NUTRIENTS, kcal: 850, protein: 40, carbs: 80, fat: 35 },
    })
    expect(updated).toMatchObject({ grams: null, per100: null, nutrients: { kcal: 850 } })
  })

  it('refuse une donnée invalide sans rien enregistrer', async () => {
    await expect(addEntries([entryFromFood(rice, 0, '2026-10-21', 'lunch')])).rejects.toThrow()
    await expect(updateEntry('absent', { grams: 10 })).rejects.toThrow('n’est plus dans le journal')
    expect(await db.foodEntries.count()).toBe(0)
  })

  it('recopie un repas vers un autre jour, puis supprime', async () => {
    const lunch = await addEntries([
      entryFromFood(rice, 150, '2026-10-20', 'lunch'),
      entryFromFood(chicken, 140, '2026-10-20', 'lunch'),
    ])
    const copies = await copyEntries(lunch, '2026-10-21', 'dinner')
    expect(copies.map((entry) => [entry.date, entry.meal, entry.name])).toEqual([
      ['2026-10-21', 'dinner', 'Riz blanc, cuit'],
      ['2026-10-21', 'dinner', 'Poulet, filet, grillé'],
    ])
    expect(new Set([...lunch, ...copies].map((entry) => entry.id)).size).toBe(4)
    await deleteEntries(copies.map((entry) => entry.id))
    expect(await db.foodEntries.count()).toBe(2)
  })

  it('propose les aliments récents, une fois chacun, avec la dernière quantité', async () => {
    await addEntries([
      entryFromFood(rice, 150, '2026-10-19', 'lunch', '2026-10-19T12:00:00.000Z'),
      entryFromFood(chicken, 140, '2026-10-20', 'lunch', '2026-10-20T12:00:00.000Z'),
      entryFromFood(rice, 220, '2026-10-21', 'dinner', '2026-10-21T19:00:00.000Z'),
      quickEntry('Restaurant', ZERO_NUTRIENTS, '2026-10-21', 'lunch'),
    ])
    const recent = await recentFoods()
    expect(recent.map((item) => [item.name, item.portionG])).toEqual([
      ['Riz blanc, cuit', 220],
      ['Poulet, filet, grillé', 140],
    ])
  })
})

describe('aliments perso', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  const food = (patch: Partial<Food>): Food => ({
    id: 'off:3017620422003',
    source: 'off',
    name: 'Pâte à tartiner',
    brand: 'Nutella',
    barcode: '3017620422003',
    per100: { ...ZERO_NUTRIENTS, kcal: 539, protein: 6.3, carbs: 57.5, fat: 30.9 },
    servingG: 15,
    createdAt: 'x',
    updatedAt: 'x',
    ...patch,
  })

  it('retrouve un produit par son code-barres, la version corrigée à la main d’abord', async () => {
    await saveFood(food({}))
    expect((await foodByBarcode('3017620422003'))?.source).toBe('off')
    await saveFood(food({ id: 'perso', source: 'custom', name: '  Ma pâte  ' }))
    expect(await foodByBarcode('3017620422003')).toMatchObject({ id: 'perso', name: 'Ma pâte' })
    expect(await foodByBarcode('0000000000000')).toBeUndefined()
  })

  it('refuse un aliment sans nom', async () => {
    await expect(saveFood(food({ name: '   ' }))).rejects.toThrow()
  })
})

describe('objectifs caloriques', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('enregistre la phase et les valeurs fixées à la main', async () => {
    await updateNutritionGoals({ phase: 'cut', kcal: 2300 })
    expect(await db.nutritionGoals.get('me')).toMatchObject({
      phase: 'cut',
      kcal: 2300,
      activity: 'moderate',
    })
    await expect(updateNutritionGoals({ kcal: -5 })).rejects.toThrow()
  })
})
