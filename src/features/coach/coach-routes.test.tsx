import { screen, waitFor } from '@testing-library/react'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

const PAGES = [
  {
    path: '/training/coach',
    title: 'Coach du jour',
    back: 'Entraînement',
    backTo: '/training',
    tabBar: true,
  },
  { path: '/nutrition/body', title: 'Coach physique', back: 'Nutrition', backTo: '/nutrition', tabBar: true },
  {
    path: '/nutrition/kitchen',
    title: 'Frigo et placards',
    back: 'Nutrition',
    backTo: '/nutrition',
    tabBar: true,
  },
  {
    path: '/nutrition/kitchen/photo',
    title: 'Photo du frigo',
    back: 'Frigo',
    backTo: '/nutrition/kitchen',
    tabBar: false,
  },
  {
    path: '/nutrition/kitchen/ideas',
    title: 'Idées de repas',
    back: 'Frigo',
    backTo: '/nutrition/kitchen',
    tabBar: true,
  },
  { path: '/more/coach', title: 'Discussion avec le coach', back: 'Plus', backTo: '/more', tabBar: false },
]

describe('écrans du coach IA : adresse, titre, retour et place dans Plus', () => {
  it.each(PAGES)('$path s’ouvre sur « $title »', async ({ path, title, back, backTo, tabBar }) => {
    const { user, router } = await renderApp(path)
    expect(await screen.findByRole('heading', { name: title, level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' }) !== null).toBe(tabBar)
    expectFrenchSpacing()
    await user.click(screen.getByRole('button', { name: back }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(backTo)
    })
  })

  it('sont rangés dans Plus, section Coach IA', async () => {
    const { user, router } = await renderApp('/more')
    expect(await screen.findByRole('heading', { name: 'Coach IA', level: 2 })).toBeInTheDocument()
    const links = [
      { name: /^Coach du jour\s*Ta séance selon ta forme/, to: '/training/coach' },
      { name: /^Coach physique\s*Photos, phase et objectifs/, to: '/nutrition/body' },
      { name: /^Frigo et placards\s*Des idées avec ce que tu as/, to: '/nutrition/kitchen' },
      { name: /^Discussion avec le coach\s*Pose tes questions/, to: '/more/coach' },
    ]
    for (const link of links) {
      expect(screen.getByRole('link', { name: link.name })).toHaveAttribute('href', link.to)
    }
    await user.click(screen.getByRole('link', { name: links[3]!.name }))
    expect(
      await screen.findByRole('heading', { name: 'Discussion avec le coach', level: 1 }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/more/coach')
  })
})
