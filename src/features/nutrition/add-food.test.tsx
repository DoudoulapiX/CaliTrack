import { screen, waitFor } from '@testing-library/react'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const PAGE = '/nutrition/add?day=2026-10-21&meal=dinner'

describe('raccourcis pour ajouter un aliment', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, en fin de matinée.
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gardent le jour et le repas, avec les idées du frigo sur toute la largeur', async () => {
    await renderApp(PAGE)
    expect(await screen.findByRole('heading', { name: 'Ajouter au dîner', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scanner un produit' })).toHaveAttribute(
      'href',
      '/nutrition/scan?day=2026-10-21&meal=dinner',
    )
    expect(screen.getByRole('link', { name: 'Photo du repas' })).toHaveAttribute(
      'href',
      '/nutrition/photo?day=2026-10-21&meal=dinner',
    )
    expect(screen.getByRole('button', { name: 'Saisie rapide' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Créer un aliment' })).toHaveAttribute(
      'href',
      '/nutrition/foods/new?day=2026-10-21&meal=dinner',
    )
    const ideas = screen.getByRole('link', { name: 'Idées avec mon frigo' })
    expect(ideas).toHaveAttribute('href', '/nutrition/kitchen/ideas?day=2026-10-21&meal=dinner')
    expect(ideas).toHaveClass('col-span-2')
    expect(screen.getByRole('link', { name: 'Scanner un produit' })).not.toHaveClass('col-span-2')
    expectFrenchSpacing()
  })

  it('mènent aux idées de repas, puis reviennent à l’ajout', async () => {
    const { user, router } = await renderApp(PAGE)
    await user.click(await screen.findByRole('link', { name: 'Idées avec mon frigo' }))
    expect(await screen.findByRole('heading', { name: 'Idées de repas', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition/kitchen/ideas')
    expect(router.state.location.search).toBe('?day=2026-10-21&meal=dinner')

    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(await screen.findByRole('heading', { name: 'Ajouter au dîner', level: 1 })).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/nutrition/add')
    })
    expect(router.state.location.search).toBe('?day=2026-10-21&meal=dinner')
  })

  it('reviennent à l’ajout du bon repas quand les idées sont ouvertes directement', async () => {
    const { user, router } = await renderApp('/nutrition/kitchen/ideas?day=2026-10-20&meal=snack')
    expect(await screen.findByRole('heading', { name: 'Idées de repas', level: 1 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ajouter' }))
    expect(
      await screen.findByRole('heading', { name: 'Ajouter à la collation', level: 1 }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/nutrition/add')
    expect(router.state.location.search).toBe('?day=2026-10-20&meal=snack')
  })
})
