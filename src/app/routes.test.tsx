import { screen } from '@testing-library/react'
import { renderApp } from '@/test/render-app'

describe('navigation', () => {
  it('redirige vers l’accueil tant qu’il n’est pas terminé', async () => {
    const { router } = await renderApp('/library', { onboarded: false })
    expect(await screen.findByRole('button', { name: 'Commencer' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/onboarding')
  })

  it('affiche une page introuvable pour une adresse inconnue', async () => {
    await renderApp('/nimporte-quoi')
    expect(await screen.findByText('Cette page n’existe pas')).toBeInTheDocument()
  })

  it('passe d’un onglet à l’autre', async () => {
    const { user, router } = await renderApp('/')
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' })
    await user.click(screen.getByRole('link', { name: 'Plus' }))
    expect(await screen.findByRole('heading', { name: 'Plus', level: 1 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/more')
    expect(nav).toBeInTheDocument()
  })
})
