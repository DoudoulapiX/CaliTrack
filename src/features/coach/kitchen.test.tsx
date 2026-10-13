import { act, screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { saveSecret } from '@/db/secrets'
import { fakeAnthropicFetch } from '@/test/anthropic'
import { pantryItem } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const PAGE = '/nutrition/kitchen'
const KEY = 'sk-ant-api03-test-0123456789abcdefghij'

/** Deux aliments au frigo, un aux placards. */
const stocked = () =>
  db.pantryItems.bulkPut([
    pantryItem({ id: 'p1', name: 'Œufs', quantity: '6' }),
    pantryItem({ id: 'p2', name: 'Beurre', quantity: '' }),
    pantryItem({ id: 'p3', place: 'cupboard', name: 'Riz', quantity: '1 kg' }),
  ])

/** La section d'un rangement (Frigo, Congélateur, Placards). */
function place(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title, level: 2 }).closest('section')
  if (!section) throw new Error(`Section ${title} introuvable`)
  return section
}

describe('frigo et placards', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('n’appelle jamais Claude à l’ouverture', async () => {
    const fake = fakeAnthropicFetch()
    vi.stubGlobal('fetch', fake.fetchImpl)
    await renderApp(PAGE, {
      setup: async () => {
        await saveSecret('anthropic', KEY)
        await stocked()
      },
    })
    expect(await screen.findByRole('heading', { name: 'Frigo et placards', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Œufs/ })).toBeInTheDocument()
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(fake.requests).toHaveLength(0)
  })

  it('invite à remplir un frigo vide, à la main ou en photo', async () => {
    await renderApp(PAGE)
    expect(
      await screen.findByText('Ton frigo est vide ici. Ajoute ce que tu as, ou prends-le en photo.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Photographier mon frigo' })).toHaveAttribute(
      'href',
      '/nutrition/kitchen/photo',
    )
    expect(screen.getByRole('link', { name: 'Trouver des idées de repas' })).toHaveAttribute(
      'href',
      '/nutrition/kitchen/ideas',
    )
    expect(screen.queryByRole('heading', { name: 'Frigo', level: 2 })).not.toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('range les aliments par place, puis par nom', async () => {
    await renderApp(PAGE, { setup: stocked })
    await screen.findByRole('heading', { name: 'Frigo', level: 2 })
    expect(
      within(place('Frigo'))
        .getAllByRole('button')
        .map((row) => row.textContent),
    ).toEqual(['Beurre', 'Œufs6'])
    expect(within(place('Congélateur')).getByText('Rien de noté.')).toBeInTheDocument()
    expect(within(place('Placards')).getByRole('button', { name: /^Riz/ })).toHaveTextContent('Riz1 kg')
    expectFrenchSpacing()
  })

  it('ajoute un aliment à la main', async () => {
    const { user } = await renderApp(PAGE)
    await user.click(await screen.findByRole('button', { name: 'Ajouter un aliment' }))
    const sheet = await screen.findByRole('dialog', { name: 'Ajouter un aliment' })
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Donne un nom à cet aliment.')

    await user.type(within(sheet).getByLabelText('Nom'), 'Lait d’avoine')
    await user.type(within(sheet).getByLabelText('Quantité (facultatif)'), '1 L')
    expect(within(sheet).getByRole('radio', { name: 'Frigo' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(sheet).getByRole('radio', { name: 'Placards' }))
    expectFrenchSpacing()
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter' }))

    expect(await screen.findByText('Aliment ajouté')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(within(place('Placards')).getByRole('button', { name: /^Lait d’avoine/ })).toHaveTextContent(
      'Lait d’avoine1 L',
    )
    expect(await db.pantryItems.toArray()).toMatchObject([
      { place: 'cupboard', name: 'Lait d’avoine', quantity: '1 L', source: 'manual' },
    ])
  })

  it('modifie un aliment', async () => {
    const { user } = await renderApp(PAGE, { setup: stocked })
    await user.click(await screen.findByRole('button', { name: /^Œufs/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Modifier l’aliment' })
    expect(within(sheet).getByLabelText('Nom')).toHaveValue('Œufs')
    await user.clear(within(sheet).getByLabelText('Nom'))
    await user.type(within(sheet).getByLabelText('Nom'), 'Œufs bio')
    await user.clear(within(sheet).getByLabelText('Quantité (facultatif)'))
    await user.type(within(sheet).getByLabelText('Quantité (facultatif)'), '4')
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Aliment enregistré')).toBeInTheDocument()
    expect(await within(place('Frigo')).findByRole('button', { name: /^Œufs bio/ })).toHaveTextContent(
      'Œufs bio4',
    )
    expect(await db.pantryItems.get('p1')).toMatchObject({ name: 'Œufs bio', quantity: '4', place: 'fridge' })
  })

  it('garde la feuille ouverte quand l’aliment a disparu entre-temps', async () => {
    const { user } = await renderApp(PAGE, { setup: stocked })
    await user.click(await screen.findByRole('button', { name: /^Riz/ }))
    const sheet = await screen.findByRole('dialog', { name: 'Modifier l’aliment' })
    await act(() => db.pantryItems.delete('p3'))
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Aliment introuvable.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Modifier l’aliment' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    expect(await db.pantryItems.count()).toBe(2)
  })

  it('dit quand la suppression échoue', async () => {
    const { user } = await renderApp(PAGE, { setup: stocked })
    vi.spyOn(db.pantryItems, 'delete').mockRejectedValueOnce(new Error('Disque plein.'))
    await user.click(await screen.findByRole('button', { name: /^Riz/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Modifier l’aliment' })).getByRole('button', {
        name: 'Supprimer',
      }),
    )
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer\s«\sRiz/ })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer' }))

    expect(await screen.findByText('Disque plein.')).toBeInTheDocument()
    expect(within(confirm).getByRole('button', { name: 'Supprimer' })).toBeEnabled()
    expect(await db.pantryItems.get('p3')).toBeDefined()
  })

  it('supprime un aliment après confirmation', async () => {
    const { user } = await renderApp(PAGE, { setup: stocked })
    await user.click(await screen.findByRole('button', { name: /^Riz/ }))
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Modifier l’aliment' })).getByRole('button', {
        name: 'Supprimer',
      }),
    )
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer\s«\sRiz\s»\s\?$/ })
    expectFrenchSpacing()
    await user.click(within(confirm).getByRole('button', { name: 'Annuler' }))
    const sheet = await screen.findByRole('dialog', { name: 'Modifier l’aliment' })
    await user.click(within(sheet).getByRole('button', { name: 'Supprimer' }))
    await user.click(
      within(await screen.findByRole('dialog', { name: /^Supprimer\s«\sRiz/ })).getByRole('button', {
        name: 'Supprimer',
      }),
    )

    expect(await screen.findByText('Aliment supprimé')).toBeInTheDocument()
    await waitFor(() => {
      expect(within(place('Placards')).queryByRole('button', { name: /^Riz/ })).not.toBeInTheDocument()
    })
    expect(within(place('Placards')).getByText('Rien de noté.')).toBeInTheDocument()
    expect(await db.pantryItems.get('p3')).toBeUndefined()
    expect(await db.pantryItems.count()).toBe(2)
  })
})
