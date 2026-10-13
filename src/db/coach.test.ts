import Dexie from 'dexie'
import { resetDb } from '@/test/db'
import { aiUsageRow, bodyReview, coachChange, coachDay, coachMessage, pantryItem } from '@/test/fixtures'
import {
  addPantryItem,
  appendChatExchange,
  applyBodyReview,
  applyPantryChanges,
  CHAT_MAX_STORED,
  CHAT_TEXT_MAX,
  clearChat,
  deletePantryItem,
  type PantryInput,
  saveBodyReview,
  saveCoachDay,
  setCoachDayIgnored,
  updatePantryItem,
} from './coach'
import { db } from './db'
import { updateNutritionGoals } from './nutrition'
import {
  aiUsageSchema,
  bodyReviewSchema,
  coachDaySchema,
  coachMessageSchema,
  pantryItemSchema,
} from './schema'
import { ensureSeeded } from './seed'
import type { CoachDay, PantryPlace } from './types'

const placeNames = async (place: PantryPlace) =>
  (await db.pantryItems.where('place').equals(place).toArray()).map((item) => item.name).sort()

beforeEach(async () => {
  await resetDb()
  await ensureSeeded()
})

describe('jeux de données du coach', () => {
  it('sont tous valides', () => {
    expect(coachDaySchema.parse(coachDay())).toEqual(coachDay())
    const lighter = coachDay({ decision: 'lighter', changes: [coachChange()] })
    expect(coachDaySchema.parse(lighter)).toEqual(lighter)
    expect(bodyReviewSchema.parse(bodyReview())).toEqual(bodyReview())
    expect(pantryItemSchema.parse(pantryItem())).toEqual(pantryItem())
    expect(coachMessageSchema.parse(coachMessage(0))).toMatchObject({ role: 'user', model: null })
    expect(coachMessageSchema.parse(coachMessage(1))).toMatchObject({ role: 'assistant' })
    expect(aiUsageSchema.parse(aiUsageRow())).toEqual(aiUsageRow())
  })
})

describe('coach du jour', () => {
  it('enregistre un conseil par jour : redemander le remplace', async () => {
    await saveCoachDay(coachDay())
    await saveCoachDay(
      coachDay({ decision: 'lighter', changes: [coachChange()], headline: 'Séance allégée' }),
    )
    expect(await db.coachDays.count()).toBe(1)
    expect(await db.coachDays.get('2026-10-21')).toMatchObject({
      decision: 'lighter',
      headline: 'Séance allégée',
    })
  })

  it('garde un conseil donné par un modèle qui n’est plus proposé', async () => {
    await saveCoachDay(coachDay({ model: 'claude-opus-4-1' }))
    expect((await db.coachDays.get('2026-10-21'))?.model).toBe('claude-opus-4-1')
  })

  it.each<[string, Record<string, unknown>]>([
    ['une date invalide', { date: '21/10/2026' }],
    ['une décision inconnue', { decision: 'maybe' }],
    ['un titre trop long', { headline: 'x'.repeat(81) }],
    ['plus de quatre conseils', { tips: ['a', 'b', 'c', 'd', 'e'] }],
    ['une note trop longue', { checkIn: { ...coachDay().checkIn, note: 'x'.repeat(301) } }],
    ['un changement sans série', { changes: [coachChange({ sets: 0 })] }],
    ['une action inconnue', { changes: [{ ...coachChange(), action: 'harder' }] }],
  ])('refuse %s sans rien écrire', async (_, patch) => {
    await expect(saveCoachDay({ ...coachDay(), ...patch })).rejects.toThrow()
    expect(await db.coachDays.count()).toBe(0)
  })

  it('ignore puis reprend le conseil du coach', async () => {
    await saveCoachDay(coachDay())
    await setCoachDayIgnored('2026-10-21', true)
    const ignored = await db.coachDays.get('2026-10-21')
    expect(ignored?.ignored).toBe(true)
    expect(ignored?.updatedAt).not.toBe(coachDay().updatedAt)
    expect(ignored).toMatchObject({ headline: coachDay().headline, decision: 'asPlanned' })
    await setCoachDayIgnored('2026-10-21', false)
    expect((await db.coachDays.get('2026-10-21'))?.ignored).toBe(false)
  })

  it('refuse d’ignorer un conseil absent ou abîmé, sans rien écrire', async () => {
    await expect(setCoachDayIgnored('2026-10-21', true)).rejects.toThrow('introuvable')
    expect(await db.coachDays.count()).toBe(0)
    const broken = { ...coachDay(), decision: 'maybe' } as unknown as CoachDay
    await db.coachDays.put(broken)
    await expect(setCoachDayIgnored('2026-10-21', true)).rejects.toThrow()
    expect(await db.coachDays.get('2026-10-21')).toEqual(broken)
  })
})

describe('coach physique', () => {
  const goals = () => db.nutritionGoals.get('me')

  it('enregistre une analyse par jour : la dernière l’emporte', async () => {
    await saveBodyReview(bodyReview())
    await saveBodyReview(bodyReview({ phase: 'maintain', bodyFat: null }))
    expect(await db.bodyReviews.toArray()).toEqual([bodyReview({ phase: 'maintain', bodyFat: null })])
  })

  it.each<[string, Record<string, unknown>]>([
    ['une phase inconnue', { phase: 'shred' }],
    ['une masse grasse hors limites', { bodyFat: { low: 2, high: 9 } }],
    ['des calories nulles', { targets: { ...bodyReview().targets, kcal: 0 } }],
    ['un poids nul', { weightKg: 0 }],
    ['plus de quatre conseils', { advice: ['a', 'b', 'c', 'd', 'e'] }],
  ])('refuse %s sans rien écrire', async (_, patch) => {
    await expect(saveBodyReview({ ...bodyReview(), ...patch })).rejects.toThrow()
    expect(await db.bodyReviews.count()).toBe(0)
  })

  it('applique la phase en gardant les valeurs fixées à la main, sans écrire de nombre', async () => {
    await updateNutritionGoals({ kcal: 2500, proteinG: 150 })
    await saveBodyReview(bodyReview())
    await applyBodyReview('2026-10-21', { resetOverrides: false, now: '2026-10-21T10:00:00.000Z' })
    expect(await goals()).toMatchObject({ phase: 'cut', kcal: 2500, proteinG: 150, carbsG: null, fatG: null })
    expect(await db.bodyReviews.get('2026-10-21')).toMatchObject({
      appliedAt: '2026-10-21T10:00:00.000Z',
      updatedAt: '2026-10-21T10:00:00.000Z',
      targets: bodyReview().targets,
    })
  })

  it('efface les valeurs fixées à la main quand on le demande', async () => {
    await updateNutritionGoals({ kcal: 2500, proteinG: 150, carbsG: 300, fatG: 70, activity: 'active' })
    await saveBodyReview(bodyReview({ phase: 'bulk' }))
    await applyBodyReview('2026-10-21', { resetOverrides: true })
    // Les objectifs redeviennent calculés : aucun nombre de l'analyse n'est recopié.
    expect(await goals()).toMatchObject({
      phase: 'bulk',
      activity: 'active',
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
    })
    expect((await db.bodyReviews.get('2026-10-21'))?.appliedAt).not.toBeNull()
  })

  it('ne change rien sans analyse ce jour-là', async () => {
    const before = await goals()
    await expect(applyBodyReview('2026-10-21', { resetOverrides: true })).rejects.toThrow('introuvable')
    expect(await goals()).toEqual(before)
  })

  it('ne change pas les objectifs si l’analyse ne peut pas être notée appliquée', async () => {
    await updateNutritionGoals({ kcal: 2500 })
    await saveBodyReview(bodyReview())
    const before = await goals()
    vi.spyOn(db.bodyReviews, 'put').mockImplementation(() => Dexie.Promise.reject(new Error('Disque plein')))
    await expect(applyBodyReview('2026-10-21', { resetOverrides: true })).rejects.toThrow('Disque plein')
    expect(await goals()).toEqual(before)
    expect((await db.bodyReviews.get('2026-10-21'))?.appliedAt).toBeNull()
  })
})

describe('frigo et placards', () => {
  it('ajoute un aliment à la main, nettoyé', async () => {
    const item = await addPantryItem({ place: 'fridge', name: '  Lait demi-écrémé ', quantity: ' 1 L ' })
    expect(item).toMatchObject({
      place: 'fridge',
      name: 'Lait demi-écrémé',
      quantity: '1 L',
      source: 'manual',
    })
    expect(await db.pantryItems.get(item.id)).toEqual(item)
  })

  it.each<[string, Record<string, string>]>([
    ['un nom vide', { name: '   ' }],
    ['un nom trop long', { name: 'x'.repeat(61) }],
    ['une quantité trop longue', { quantity: 'x'.repeat(41) }],
    ['une place inconnue', { place: 'cellar' }],
  ])('refuse %s sans rien écrire', async (_, patch) => {
    const input = { place: 'fridge', name: 'Lait', quantity: '', ...patch }
    await expect(addPantryItem(input as unknown as PantryInput)).rejects.toThrow()
    expect(await db.pantryItems.count()).toBe(0)
  })

  it('modifie le nom, la quantité ou la place d’un aliment', async () => {
    await db.pantryItems.put(pantryItem())
    await updatePantryItem('pantry-1', { quantity: ' 4 ' })
    expect(await db.pantryItems.get('pantry-1')).toMatchObject({
      name: 'Œufs',
      quantity: '4',
      place: 'fridge',
    })
    await updatePantryItem('pantry-1', { name: 'Œufs bio', place: 'cupboard' })
    const item = await db.pantryItems.get('pantry-1')
    expect(item).toMatchObject({ name: 'Œufs bio', quantity: '4', place: 'cupboard', source: 'manual' })
    expect(item?.updatedAt).not.toBe(pantryItem().updatedAt)
  })

  it('refuse une modification invalide ou un aliment absent, sans rien écrire', async () => {
    await db.pantryItems.put(pantryItem())
    await expect(updatePantryItem('pantry-1', { name: ' ' })).rejects.toThrow()
    await expect(
      updatePantryItem('pantry-1', { place: 'cellar' as unknown as PantryPlace }),
    ).rejects.toThrow()
    expect(await db.pantryItems.get('pantry-1')).toEqual(pantryItem())
    await expect(updatePantryItem('absent', { name: 'Lait' })).rejects.toThrow('introuvable')
    expect(await db.pantryItems.count()).toBe(1)
  })

  it('supprime un aliment', async () => {
    await db.pantryItems.bulkPut([pantryItem(), pantryItem({ id: 'pantry-2', name: 'Beurre' })])
    await deletePantryItem('pantry-1')
    expect(await db.pantryItems.toArray()).toEqual([pantryItem({ id: 'pantry-2', name: 'Beurre' })])
  })

  it('ajoute les aliments d’une photo sans doublon, accents et majuscules compris', async () => {
    await db.pantryItems.bulkPut([
      pantryItem(),
      pantryItem({ id: 'pantry-2', place: 'cupboard', name: 'Lait' }),
    ])
    const added = await applyPantryChanges({
      place: 'fridge',
      mode: 'merge',
      names: [
        { name: 'oeufs', quantity: '4' },
        { name: 'Crème  fraîche', quantity: '' },
        { name: 'creme fraiche ', quantity: '1 pot' },
        { name: 'Lait', quantity: '1 L' },
      ],
    })
    expect(added).toBe(2)
    expect(await placeNames('fridge')).toEqual(['Crème  fraîche', 'Lait', 'Œufs'])
    // Les œufs déjà notés gardent leur quantité ; les nouveaux viennent de la photo.
    expect(await db.pantryItems.get('pantry-1')).toEqual(pantryItem())
    const fromPhoto = (await db.pantryItems.where('place').equals('fridge').toArray()).filter(
      (item) => item.id !== 'pantry-1',
    )
    expect(fromPhoto.map((item) => item.source)).toEqual(['photo', 'photo'])
    expect(await placeNames('cupboard')).toEqual(['Lait'])
  })

  it('remplace le contenu d’une seule place', async () => {
    await db.pantryItems.bulkPut([
      pantryItem(),
      pantryItem({ id: 'pantry-2', name: 'Beurre' }),
      pantryItem({ id: 'pantry-3', place: 'cupboard', name: 'Riz' }),
      pantryItem({ id: 'pantry-4', place: 'freezer', name: 'Petits pois' }),
    ])
    const added = await applyPantryChanges({
      place: 'fridge',
      mode: 'replace',
      names: [
        { name: 'Œufs', quantity: '12' },
        { name: 'Tomates', quantity: '3' },
        { name: 'tomates', quantity: '2' },
      ],
    })
    expect(added).toBe(2)
    const fridge = await db.pantryItems.where('place').equals('fridge').toArray()
    expect(fridge.map(({ name, quantity, source }) => ({ name, quantity, source }))).toEqual(
      expect.arrayContaining([
        { name: 'Œufs', quantity: '12', source: 'photo' },
        { name: 'Tomates', quantity: '3', source: 'photo' },
      ]),
    )
    expect(fridge).toHaveLength(2)
    expect(await placeNames('cupboard')).toEqual(['Riz'])
    expect(await placeNames('freezer')).toEqual(['Petits pois'])
  })

  it('vide une place quand la photo ne montre rien', async () => {
    await db.pantryItems.bulkPut([
      pantryItem(),
      pantryItem({ id: 'pantry-3', place: 'cupboard', name: 'Riz' }),
    ])
    expect(await applyPantryChanges({ place: 'fridge', mode: 'replace', names: [] })).toBe(0)
    expect(await placeNames('fridge')).toEqual([])
    expect(await placeNames('cupboard')).toEqual(['Riz'])
  })

  it.each(['merge', 'replace'] as const)('ne change rien si un aliment est invalide (%s)', async (mode) => {
    await db.pantryItems.bulkPut([
      pantryItem(),
      pantryItem({ id: 'pantry-3', place: 'cupboard', name: 'Riz' }),
    ])
    const names = [
      { name: 'Tomates', quantity: '3' },
      { name: 'x'.repeat(61), quantity: '' },
    ]
    await expect(applyPantryChanges({ place: 'fridge', mode, names })).rejects.toThrow()
    expect(await placeNames('fridge')).toEqual(['Œufs'])
    expect(await placeNames('cupboard')).toEqual(['Riz'])
  })
})

describe('discussion', () => {
  const messages = () => db.coachMessages.orderBy('seq').toArray()

  it('enregistre la question puis la réponse, à la suite', async () => {
    const now = '2026-10-21T10:00:00.000Z'
    await appendChatExchange({ user: '  Bonjour  ', assistant: '\nSalut !\n', model: 'claude-opus-5-5', now })
    await appendChatExchange({ user: 'Et demain ?', assistant: 'Repos.', model: 'claude-haiku-5-5', now })
    const rows = await messages()
    expect(
      rows.map(({ seq, role, text, model, createdAt }) => ({ seq, role, text, model, createdAt })),
    ).toEqual([
      { seq: 0, role: 'user', text: 'Bonjour', model: null, createdAt: now },
      { seq: 1, role: 'assistant', text: 'Salut !', model: 'claude-opus-5-5', createdAt: now },
      { seq: 2, role: 'user', text: 'Et demain ?', model: null, createdAt: now },
      { seq: 3, role: 'assistant', text: 'Repos.', model: 'claude-haiku-5-5', createdAt: now },
    ])
    expect(new Set(rows.map((row) => row.id)).size).toBe(4)
  })

  it('suit le dernier numéro, même après des messages effacés', async () => {
    await db.coachMessages.bulkPut([coachMessage(6), coachMessage(7)])
    await appendChatExchange({ user: 'Q', assistant: 'R', model: 'claude-opus-5-5' })
    expect((await messages()).map((row) => row.seq)).toEqual([6, 7, 8, 9])
  })

  it.each([
    ['une question vide', { user: '   ', assistant: 'Réponse' }],
    ['une réponse vide', { user: 'Question', assistant: '\n' }],
  ])('refuse %s sans rien écrire', async (_, texts) => {
    await expect(appendChatExchange({ ...texts, model: 'claude-opus-5-5' })).rejects.toThrow('vide')
    expect(await db.coachMessages.count()).toBe(0)
  })

  it('coupe une réponse trop longue', async () => {
    await appendChatExchange({
      user: 'Q',
      assistant: 'a'.repeat(CHAT_TEXT_MAX + 50),
      model: 'claude-opus-5-5',
    })
    expect((await messages())[1]?.text).toHaveLength(CHAT_TEXT_MAX)
  })

  it(`ne garde que les ${String(CHAT_MAX_STORED)} derniers messages`, async () => {
    await db.coachMessages.bulkPut(Array.from({ length: CHAT_MAX_STORED - 1 }, (_, seq) => coachMessage(seq)))
    await appendChatExchange({ user: 'Q', assistant: 'R', model: 'claude-opus-5-5' })
    let seqs = (await messages()).map((row) => row.seq)
    expect(seqs).toHaveLength(CHAT_MAX_STORED)
    expect(seqs[0]).toBe(1)
    expect(seqs.slice(-2)).toEqual([CHAT_MAX_STORED - 1, CHAT_MAX_STORED])

    await appendChatExchange({ user: 'Q2', assistant: 'R2', model: 'claude-opus-5-5' })
    seqs = (await messages()).map((row) => row.seq)
    expect(seqs).toHaveLength(CHAT_MAX_STORED)
    expect(seqs[0]).toBe(3)
    expect((await messages()).slice(-2).map((row) => row.text)).toEqual(['Q2', 'R2'])
  })

  it('n’enregistre pas la question seule si la réponse échoue', async () => {
    const put = db.coachMessages.put.bind(db.coachMessages)
    vi.spyOn(db.coachMessages, 'put')
      .mockImplementationOnce((item, key) => put(item, key))
      .mockImplementationOnce(() => Dexie.Promise.reject(new Error('Disque plein')))
    await expect(appendChatExchange({ user: 'Q', assistant: 'R', model: 'claude-opus-5-5' })).rejects.toThrow(
      'Disque plein',
    )
    expect(await db.coachMessages.count()).toBe(0)
  })

  it('efface toute la discussion', async () => {
    await db.coachMessages.bulkPut([coachMessage(0), coachMessage(1)])
    await clearChat()
    expect(await db.coachMessages.count()).toBe(0)
  })
})
