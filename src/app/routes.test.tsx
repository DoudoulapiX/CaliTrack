import { screen, waitFor } from '@testing-library/react'
import { updateSettings } from '@/db/settings'
import { renderApp } from '@/test/render-app'

describe('navigation', () => {
  it('redirige vers l’accueil tant qu’il n’est pas terminé', async () => {
    const { router } = await renderApp('/library', { onboarded: false })
    expect(await screen.findByRole('button', { name: 'Commencer' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/onboarding')
  })

  it('laisse s’afficher le retour d’Oura avant la fin de l’accueil', async () => {
    const { router } = await renderApp('/oura/callback#error=access_denied', { onboarded: false })
    expect(await screen.findByRole('heading', { name: 'Accès refusé', level: 2 })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/oura/callback')
  })

  it('quitte l’accueil une fois terminé', async () => {
    const { router } = await renderApp('/onboarding')
    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
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
    expect(screen.getByRole('link', { name: 'Plus' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Aujourd’hui' })).not.toHaveAttribute('aria-current')
  })

  it('met en avant « Plus » sur un écran qui n’a pas son onglet', async () => {
    const { user } = await renderApp('/more')
    await user.click(await screen.findByRole('link', { name: 'Objectifs' }))
    expect(await screen.findByRole('heading', { name: 'Objectifs', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plus' })).toHaveAttribute('aria-current', 'page')
    // Un onglet Objectifs dans la barre : c'est lui qui est mis en avant.
    await updateSettings({ tabs: ['today', 'goals'] })
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Objectifs' })).toHaveAttribute('aria-current', 'page')
    })
    expect(screen.getByRole('link', { name: 'Plus' })).not.toHaveAttribute('aria-current')
  })
})
