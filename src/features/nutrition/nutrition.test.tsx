import { screen, waitFor, within } from '@testing-library/react'
import type { FoodItem } from '@/content/nutrition/foods'
import { ZERO_NUTRIENTS } from '@/content/nutrition/nutrients'
import { db } from '@/db/db'
import { addEntries, entryFromFood } from '@/db/nutrition'
import { updateProfile } from '@/db/settings'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

// Les textes se comparent avec des espaces simples : la recherche ramène les espaces insécables à des
// espaces ; expectFrenchSpacing vérifie qu'elles sont bien là.

const rice: FoodItem = {
  id: 'ciqual:9104',
  source: 'ciqual',
  name: 'Riz blanc, cuit, sans sel ajouté',
  detail: 'pâtes, riz et céréales',
  per100: { ...ZERO_NUTRIENTS, kcal: 155, protein: 3.2, carbs: 33.2, fat: 0.7 },
  portionG: 110,
}

/** Homme, 30 ans, 1,80 m, 80 kg : 2 760 kcal par jour en maintien, activité modérée. */
const charles = () => updateProfile({ sex: 'male', birthYear: 1996, heightCm: 180, weightKg: 80 })

/** La section (repas, carte) qui porte ce titre. */
function section(title: string): HTMLElement {
  const found = screen.getByRole('heading', { name: title, level: 2 }).closest('section')
  if (!found) throw new Error(`Section ${title} introuvable`)
  return found
}

/** Ce qu'apporte la quantité choisie, case par case (« Calories 310 kcal »). */
function tiles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('dl > div'), (tile) =>
    [tile.querySelector('dt')?.textContent, tile.querySelector('dd')?.textContent]
      .join(' ')
      .replace(/\s/g, ' '),
  )
}

describe('nutrition', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, en fin de matinée.
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cherche un aliment de la table Ciqual et l’ajoute au déjeuner', async () => {
    const { user, router } = await renderApp('/nutrition', { setup: charles })
    expect(await screen.findByRole('heading', { name: 'Nutrition', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('sur 2 760 kcal')).toBeInTheDocument()
    expect(screen.getByText('Il te reste 2 760 kcal')).toBeInTheDocument()
    expect(screen.getByText('0 / 145 g')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Jour suivant' })).toBeDisabled()

    await user.click(within(section('Déjeuner')).getByRole('link', { name: 'Ajouter au déjeuner' }))
    expect(await screen.findByRole('heading', { name: 'Ajouter au déjeuner', level: 1 })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?day=2026-10-21&meal=lunch')

    await user.type(screen.getByRole('searchbox', { name: 'Chercher un aliment' }), 'riz blanc cuit')
    await user.click(await screen.findByRole('button', { name: /^Riz blanc, cuit, sans sel ajouté/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Riz blanc, cuit, sans sel ajouté' })
    // La portion habituelle d'abord.
    expect(within(sheet).getByLabelText('Quantité')).toHaveValue('110')
    expect(within(sheet).getByRole('button', { name: /^1 portion/ })).toHaveAttribute('aria-pressed', 'true')
    await user.clear(within(sheet).getByLabelText('Quantité'))
    await user.type(within(sheet).getByLabelText('Quantité'), '200')
    expect(tiles(sheet)).toEqual(['Calories 310 kcal', 'Protéines 6,4 g', 'Glucides 66 g', 'Lipides 1,4 g'])
    expectFrenchSpacing()
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter au déjeuner' }))
    expect(await screen.findByText('Ajouté au déjeuner')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Terminé' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/nutrition')
    })
    const lunch = await screen.findByRole('list', { name: 'Déjeuner' })
    expect(
      within(lunch).getByRole('button', { name: /^Riz blanc, cuit, sans sel ajouté/ }),
    ).toHaveTextContent('200 g · 310 kcal')
    expect(screen.getByText('Il te reste 2 450 kcal')).toBeInTheDocument()
    expect(within(section('Déjeuner')).getByText('310 kcal')).toBeInTheDocument()
    expect(await db.foodEntries.count()).toBe(1)
    expectFrenchSpacing()

    // L'aliment revient en tête des récents, avec la quantité mangée.
    await user.click(within(section('Dîner')).getByRole('link', { name: 'Ajouter au dîner' }))
    const recents = await screen.findByRole('heading', { name: 'Récents', level: 2 })
    expect(recents).toBeInTheDocument()
    await user.click(within(section('Récents')).getByRole('button', { name: /^Riz blanc, cuit/ }))
    const again = await screen.findByRole('dialog', { name: 'Riz blanc, cuit, sans sel ajouté' })
    expect(within(again).getByLabelText('Quantité')).toHaveValue('200')
  })

  it('change la quantité d’un aliment noté, puis le retire', async () => {
    const { user } = await renderApp('/nutrition', {
      setup: async () => {
        await charles()
        await addEntries([entryFromFood(rice, 150, '2026-10-21', 'lunch')])
      },
    })
    const row = await screen.findByRole('button', { name: /^Riz blanc, cuit/ })
    expect(row).toHaveTextContent('150 g · 233 kcal')

    await user.click(row)
    const sheet = await screen.findByRole('dialog', { name: 'Riz blanc, cuit, sans sel ajouté' })
    expect(within(sheet).getByText('Table Ciqual')).toBeInTheDocument()
    await user.clear(within(sheet).getByLabelText('Quantité'))
    await user.type(within(sheet).getByLabelText('Quantité'), '100')
    await user.click(within(sheet).getByRole('radio', { name: 'Dîner' }))
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Modifié')).toBeInTheDocument()
    const dinner = await screen.findByRole('list', { name: 'Dîner' })
    expect(within(dinner).getByRole('button', { name: /^Riz blanc, cuit/ })).toHaveTextContent(
      '100 g · 155 kcal',
    )
    expect(screen.queryByRole('list', { name: 'Déjeuner' })).not.toBeInTheDocument()

    await user.click(within(dinner).getByRole('button', { name: /^Riz blanc, cuit/ }))
    await user.click(await screen.findByRole('button', { name: 'Retirer du journal' }))
    expect(await screen.findByText('Retiré du journal')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('list', { name: 'Dîner' })).not.toBeInTheDocument()
    })
    expect(await db.foodEntries.count()).toBe(0)
  })

  it('note des calories en saisie rapide, macronutriments calculés ou non', async () => {
    const { user, router } = await renderApp('/nutrition/add?day=2026-10-21&meal=lunch', { setup: charles })
    await user.click(await screen.findByRole('button', { name: 'Saisie rapide' }))
    const sheet = await screen.findByRole('dialog', { name: 'Saisie rapide' })
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter au déjeuner' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Indique les calories.')

    await user.type(within(sheet).getByLabelText('Nom'), 'Burger au resto')
    await user.type(within(sheet).getByLabelText('Protéines'), '40')
    await user.type(within(sheet).getByLabelText('Glucides'), '80')
    await user.type(within(sheet).getByLabelText('Lipides'), '35')
    await user.click(within(sheet).getByRole('radio', { name: 'Dîner' }))
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter au dîner' }))
    expect(await screen.findByText('Ajouté au dîner')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Terminé' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/nutrition')
    })
    const dinner = await screen.findByRole('list', { name: 'Dîner' })
    // 40 × 4 + 80 × 4 + 35 × 9 = 795 kcal.
    expect(within(dinner).getByRole('button', { name: /^Burger au resto/ })).toHaveTextContent('795 kcal')
    expect(await db.foodEntries.toArray()).toMatchObject([
      { source: 'quick', grams: null, nutrients: { kcal: 795, protein: 40, carbs: 80, fat: 35 } },
    ])
  })

  it('reprend le repas de la veille et change de jour', async () => {
    const { user, router } = await renderApp('/nutrition', {
      setup: async () => {
        await charles()
        await addEntries([entryFromFood(rice, 150, '2026-10-20', 'lunch')])
      },
    })
    await screen.findByRole('heading', { name: 'Déjeuner', level: 2 })
    expect(within(section('Dîner')).queryByRole('button', { name: 'Comme la veille' })).toBeNull()
    await user.click(within(section('Déjeuner')).getByRole('button', { name: 'Comme la veille' }))
    expect(await screen.findByText('Déjeuner de la veille repris')).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Déjeuner' })).toHaveTextContent('150 g · 233 kcal')
    expect(await db.foodEntries.where('date').equals('2026-10-21').count()).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Jour précédent' }))
    expect(await screen.findByText('Hier', { selector: 'p' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?day=2026-10-20')
    expect(screen.getByRole('list', { name: 'Déjeuner' })).toHaveTextContent('150 g · 233 kcal')
    await user.click(screen.getByRole('button', { name: 'Jour suivant' }))
    expect(await screen.findByText('Aujourd’hui', { selector: 'p' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('')
  })

  it('crée un aliment introuvable, l’ajoute, puis le corrige et le supprime', async () => {
    const { user, router } = await renderApp('/nutrition/add?day=2026-10-21&meal=snack', { setup: charles })
    await user.type(await screen.findByRole('searchbox', { name: 'Chercher un aliment' }), 'granola maison')
    expect(await screen.findByText('Aucun aliment trouvé')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /^Créer\s«\sgranola maison\s»$/ }))

    expect(await screen.findByRole('heading', { name: 'Nouvel aliment', level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText('Nom')).toHaveValue('granola maison')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Indique les calories pour 100 g.')
    await user.type(screen.getByLabelText('Calories'), '450')
    await user.type(screen.getByLabelText('Protéines'), '10')
    await user.type(screen.getByLabelText('Glucides'), '60')
    await user.type(screen.getByLabelText('Lipides'), '18')
    await user.type(screen.getByLabelText('Portion habituelle (facultatif)'), '40')
    await user.type(screen.getByLabelText('Code-barres (facultatif)'), '123')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ce code-barres n’est pas valable : vérifie les chiffres.',
    )
    await user.clear(screen.getByLabelText('Code-barres (facultatif)'))
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Aliment créé')).toBeInTheDocument()

    // De retour sur l'ajout : la quantité du nouvel aliment est proposée aussitôt.
    const sheet = await screen.findByRole('dialog', { name: 'granola maison' })
    expect(router.state.location.pathname).toBe('/nutrition/add')
    expect(within(sheet).getByLabelText('Quantité')).toHaveValue('40')
    expect(tiles(sheet)).toEqual(['Calories 180 kcal', 'Protéines 4 g', 'Glucides 24 g', 'Lipides 7,2 g'])
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter à la collation' }))
    expect(await screen.findByText('Ajouté à la collation')).toBeInTheDocument()
    expect(await db.foodEntries.toArray()).toMatchObject([{ meal: 'snack', source: 'custom', grams: 40 }])

    await router.navigate('/nutrition/foods')
    await user.click(await screen.findByRole('link', { name: /^granola maison/ }))
    expect(await screen.findByRole('heading', { name: 'Modifier l’aliment', level: 1 })).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Nom'))
    await user.type(screen.getByLabelText('Nom'), 'Granola maison')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByText('Aliment modifié')).toBeInTheDocument()
    await user.click(await screen.findByRole('link', { name: /^Granola maison/ }))

    await user.click(await screen.findByRole('button', { name: 'Supprimer l’aliment' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer cet aliment/ })
    expect(within(confirm).getByText('Les repas où tu l’as déjà noté le gardent.')).toBeInTheDocument()
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByText('Aucun aliment perso')).toBeInTheDocument()
    expect(await db.foods.count()).toBe(0)
    expect(await db.foodEntries.count()).toBe(1)
  })

  it('règle la phase et fixe des valeurs à la main', async () => {
    const { user } = await renderApp('/nutrition/targets', { setup: charles })
    expect(await screen.findByText('Métabolisme de base : 1 780 kcal')).toBeInTheDocument()
    expect(screen.getByText('Dépense avec ton activité : 2 760 kcal')).toBeInTheDocument()
    expect(screen.getByText('En maintien : 2 760 kcal')).toBeInTheDocument()
    expect(screen.getByLabelText('Calories par jour')).toHaveAttribute(
      'placeholder',
      'Auto\u00a0: 2\u202f760',
    )
    expectFrenchSpacing()

    await user.click(screen.getByRole('radio', { name: 'Sèche' }))
    expect(await screen.findByText('En sèche : 2 210 kcal')).toBeInTheDocument()
    expect(screen.getByLabelText('Protéines')).toHaveAttribute('placeholder', 'Auto\u00a0: 175')
    await user.click(screen.getByRole('radio', { name: 'Active' }))
    expect(await screen.findByText('6 ou 7 séances par semaine.')).toBeInTheDocument()
    expect(await screen.findByText('En sèche : 2 460 kcal')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Calories par jour'), '2300')
    expect(await screen.findByText('Fixé à la main : 2 300 kcal')).toBeInTheDocument()
    expect(await db.nutritionGoals.get('me')).toMatchObject({ phase: 'cut', activity: 'active', kcal: 2300 })

    await user.click(screen.getByRole('button', { name: 'Revenir au calcul automatique' }))
    await waitFor(() => {
      expect(screen.queryByText(/^Fixé à la main/)).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Calories par jour')).toHaveValue('')
    expect(await db.nutritionGoals.get('me')).toMatchObject({ kcal: null, proteinG: null })
  })

  it('demande de compléter le profil pour calculer les besoins', async () => {
    await renderApp('/nutrition')
    expect(
      await screen.findByText(
        /^Ajoute ton âge, ta taille et ton poids à ton profil pour calculer tes besoins\./,
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Compléter mon profil' })).toHaveAttribute(
      'href',
      '/more/profile',
    )
    expect(screen.getByText('0 kcal')).toBeInTheDocument()
  })

  it('montre les calories du jour sur l’accueil, avec de quoi noter le repas en cours', async () => {
    await renderApp('/', {
      setup: async () => {
        await charles()
        await addEntries([entryFromFood(rice, 200, '2026-10-21', 'breakfast')])
      },
    })
    await screen.findByRole('heading', { name: 'Calories du jour', level: 2 })
    const card = section('Calories du jour')
    expect(within(card).getByText('Il te reste 2 450 kcal')).toBeInTheDocument()
    expect(within(card).getByRole('progressbar', { name: 'Calories du jour' })).toHaveAttribute(
      'aria-valuenow',
      '11',
    )
    expect(within(card).getByRole('link', { name: 'Noter un repas' })).toHaveAttribute(
      'href',
      '/nutrition/add?day=2026-10-21&meal=lunch',
    )
    expect(within(card).getByRole('link', { name: 'Voir le journal des repas' })).toHaveAttribute(
      'href',
      '/nutrition',
    )
    expectFrenchSpacing()
  })
})
