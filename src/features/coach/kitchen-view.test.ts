import { cleanIdeas } from '@/content/coach/kitchen'
import { IDEAS } from '@/test/anthropic'
import { pantryItem } from '@/test/fixtures'
import {
  afterIdeaText,
  aliments,
  ideaReviewItems,
  ideaTotal,
  keptNames,
  minutesText,
  modeHint,
  pantryByPlace,
  pantryCountText,
  pantrySavedText,
  remainingTitle,
  replaceLabel,
  reviewItems,
  savePantryLabel,
} from './kitchen-view'

const NB = '\u00a0'
const NNB = '\u202f'

/** Pas d'espace simple devant « : ; ! ? % » (typographie française). */
const spaced = (text: string) => !/ [:;!?%»]/.test(text)

describe('textes du frigo et des placards', () => {
  it('rangent les aliments par place, puis par nom', () => {
    const items = [
      pantryItem({ id: 'a', place: 'cupboard', name: 'Riz' }),
      pantryItem({ id: 'b', place: 'fridge', name: 'yaourts' }),
      pantryItem({ id: 'c', place: 'fridge', name: 'Œufs' }),
      pantryItem({ id: 'd', place: 'fridge', name: 'Beurre' }),
    ]
    expect(pantryByPlace(items).map(({ place, items: list }) => [place, list.map((i) => i.id)])).toEqual([
      ['fridge', ['d', 'c', 'b']],
      ['freezer', []],
      ['cupboard', ['a']],
    ])
  })

  it('comptent les aliments', () => {
    expect(aliments(1)).toBe('1 aliment')
    expect(aliments(7)).toBe('7 aliments')
    expect(pantryCountText(0)).toBe('Aucun aliment noté')
    expect(pantryCountText(1)).toBe('1 aliment noté')
    expect(pantryCountText(9)).toBe('9 aliments notés')
  })

  describe('photo du frigo', () => {
    it('garde les aliments cochés et nommés', () => {
      const items = reviewItems([
        { name: 'Œufs', quantity: '6' },
        { name: 'Lait', quantity: '1 L' },
        { name: 'Tomates', quantity: '3' },
      ])
      expect(items[0]).toEqual({ id: '0', name: 'Œufs', quantity: '6', keep: true })
      const edited = [
        { ...items[0]!, name: '  Œufs bio ', quantity: ' 6 ' },
        { ...items[1]!, keep: false },
        { ...items[2]!, name: '   ' },
      ]
      expect(keptNames(edited)).toEqual([{ name: 'Œufs bio', quantity: '6' }])
    })

    it('nomme les boutons et les choix', () => {
      expect(savePantryLabel(0)).toBe('Coche au moins un aliment')
      expect(savePantryLabel(1)).toBe('Enregistrer 1 aliment')
      expect(savePantryLabel(7)).toBe('Enregistrer 7 aliments')
      expect(replaceLabel('fridge')).toBe('Remplacer le frigo')
      expect(replaceLabel('freezer')).toBe('Remplacer le congélateur')
      expect(replaceLabel('cupboard')).toBe('Remplacer les placards')
    })

    it('explique l’ajout et le remplacement', () => {
      expect(modeHint('merge', 'fridge')).toBe(
        `Ce qui est déjà noté reste${NB}; un aliment déjà là n’est pas ajouté deux fois.`,
      )
      expect(modeHint('replace', 'cupboard')).toBe(
        'Ce qui est noté dans tes placards est effacé, puis remplacé par cette liste.',
      )
    })

    it('dit ce qui a été ajouté', () => {
      expect(pantrySavedText(7, 'fridge')).toBe('7 aliments ajoutés au frigo')
      expect(pantrySavedText(1, 'freezer')).toBe('1 aliment ajouté au congélateur')
      expect(pantrySavedText(2, 'cupboard')).toBe('2 aliments ajoutés aux placards')
      expect(pantrySavedText(0, 'fridge')).toBe(`Rien de nouveau${NB}: tout était déjà dans ton frigo.`)
      for (const place of ['fridge', 'freezer', 'cupboard'] as const) {
        expect(spaced(pantrySavedText(0, place))).toBe(true)
        expect(spaced(modeHint('merge', place))).toBe(true)
      }
    })
  })

  describe('idées de repas', () => {
    it('nomment le jour et la durée', () => {
      expect(remainingTitle('2026-10-21', '2026-10-21')).toBe('Reste pour aujourd’hui')
      expect(remainingTitle('2026-10-19', '2026-10-21')).toBe('Reste pour le 19 octobre')
      expect(minutesText(15)).toBe(`15${NB}min`)
    })

    it('additionnent les ingrédients d’une idée', () => {
      const [omelette] = cleanIdeas(IDEAS)
      expect(ideaTotal(omelette!.items)).toEqual({ kcal: 291, protein: 25, carbs: 7.5, fat: 18.4 })
      expect(ideaTotal([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    })

    it('disent ce que l’idée laisse pour la journée', () => {
      const total = { kcal: 291, protein: 25, carbs: 7.5, fat: 18.4 }
      expect(afterIdeaText(total, { kcal: 1560, protein: 130, carbs: 175, fat: 42 })).toBe(
        `Il te restera ensuite 1${NNB}269${NB}kcal et 105${NB}g de protéines.`,
      )
      expect(afterIdeaText(total, { kcal: 1560, protein: 10, carbs: 175, fat: 42 })).toBe(
        `Il te restera ensuite 1${NNB}269${NB}kcal et 0${NB}g de protéines.`,
      )
      expect(afterIdeaText(total, { kcal: 171, protein: 0, carbs: 0, fat: 0 })).toBe(
        `120${NB}kcal de plus que ce qui te reste.`,
      )
      expect(afterIdeaText(total, null)).toBeNull()
    })

    it('préparent les ingrédients choisis, tous gardés', () => {
      const [, poulet] = cleanIdeas(IDEAS)
      const items = ideaReviewItems(poulet!.items)
      expect(items.map(({ id, name, keep, fromPantry }) => ({ id, name, keep, fromPantry }))).toEqual([
        { id: '0', name: 'Blanc de poulet', keep: true, fromPantry: true },
        { id: '1', name: 'Riz blanc cuit', keep: true, fromPantry: false },
        { id: '2', name: 'Tomates', keep: true, fromPantry: true },
      ])
      expect(items[1]?.grams).toBe(180)
    })
  })
})
