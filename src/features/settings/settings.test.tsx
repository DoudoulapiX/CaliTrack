import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { renderApp } from '@/test/render-app'

const settings = async () => {
  const value = await db.settings.get('app')
  if (!value) throw new Error('Réglages absents')
  return value
}

/** Les onglets de la barre du bas, dans l'ordre. */
const tabBar = () =>
  within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    .getAllByRole('link')
    .map((link) => link.textContent)

describe('réglages', () => {
  it('change le thème, la couleur de l’appli et l’unité de poids', async () => {
    const { user } = await renderApp('/more/settings')
    await screen.findByRole('heading', { name: 'Réglages' })

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Thème' })).getByRole('radio', { name: 'Clair' }),
    )
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme', 'light')
    })
    expect((await settings()).themeMode).toBe('light')

    const colors = screen.getByRole('radiogroup', { name: 'Couleur de l’appli' })
    expect(within(colors).getByRole('radio', { name: 'Orange' })).toHaveAttribute('aria-checked', 'true')
    await user.click(within(colors).getByRole('radio', { name: 'Bleu' }))
    await waitFor(() => {
      expect(within(colors).getByRole('radio', { name: 'Bleu' })).toHaveAttribute('aria-checked', 'true')
    })
    expect(document.documentElement.style.getPropertyValue('--ct-accent')).toBe('#2563eb')

    fireEvent.change(screen.getByLabelText('Autre couleur'), { target: { value: '#123456' } })
    // Une couleur à soi : enregistrée, puis plus aucune pastille cochée (une fois l'écran à jour).
    await waitFor(async () => {
      expect((await settings()).accent).toBe('#123456')
    })
    await waitFor(() => {
      expect(within(colors).queryByRole('radio', { checked: true })).not.toBeInTheDocument()
    })

    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Poids et charges' })).getByRole('radio', {
        name: 'Livres (lb)',
      }),
    )
    await waitFor(async () => {
      expect((await settings()).weightUnit).toBe('lb')
    })
  })

  it('choisit les onglets de la barre et leur ordre, quatre au plus et un au moins', async () => {
    const { user } = await renderApp('/more/settings')
    const list = await screen.findByRole('list', { name: 'Onglets de la barre' })
    const toggle = (name: string) => within(list).getByRole('switch', { name })
    expect(tabBar()).toEqual(['Aujourd’hui', 'Calendrier', 'Entraînement', 'Escalade', 'Plus'])

    // Barre pleine : il faut d'abord en retirer un.
    expect(toggle('Objectifs')).toBeDisabled()
    await user.click(toggle('Calendrier'))
    await waitFor(() => {
      expect(tabBar()).toEqual(['Aujourd’hui', 'Entraînement', 'Escalade', 'Plus'])
    })
    await user.click(toggle('Objectifs'))
    await waitFor(() => {
      expect(tabBar()).toEqual(['Aujourd’hui', 'Entraînement', 'Escalade', 'Objectifs', 'Plus'])
    })

    await user.click(within(list).getByRole('button', { name: 'Objectifs : monter' }))
    await waitFor(() => {
      expect(tabBar()).toEqual(['Aujourd’hui', 'Entraînement', 'Objectifs', 'Escalade', 'Plus'])
    })
    expect(within(list).getByRole('button', { name: 'Aujourd’hui : monter' })).toBeDisabled()
    expect(within(list).getByRole('button', { name: 'Escalade : descendre' })).toBeDisabled()
    expect((await settings()).tabs).toEqual(['today', 'training', 'goals', 'climbing'])

    // « Plus » reste mis en avant : les réglages n'ont pas d'onglet.
    expect(screen.getByRole('link', { name: 'Plus' })).toHaveAttribute('aria-current', 'page')

    for (const name of ['Aujourd’hui', 'Entraînement', 'Objectifs']) {
      await user.click(toggle(name))
      await waitFor(() => {
        expect(toggle(name)).not.toBeChecked()
      })
    }
    expect(toggle('Escalade')).toBeDisabled()
    expect(tabBar()).toEqual(['Escalade', 'Plus'])
  })

  it('choisit les cartes de l’accueil et leur ordre', async () => {
    const { user } = await renderApp('/more/settings')
    const list = await screen.findByRole('list', { name: 'Cartes de l’accueil' })

    await user.click(within(list).getByRole('switch', { name: 'Poids' }))
    await waitFor(async () => {
      expect((await settings()).dashboardCards).toEqual([
        'todaySession',
        'week',
        'goals',
        'climbing',
        'records',
      ])
    })
    await user.click(within(list).getByRole('button', { name: 'Records récents : monter' }))
    await waitFor(async () => {
      expect((await settings()).dashboardCards).toEqual([
        'todaySession',
        'week',
        'goals',
        'records',
        'climbing',
      ])
    })
    // Les cartes choisies d'abord, dans leur ordre, puis les autres.
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Au programme', 'Ma semaine', 'Objectifs épinglés', 'Records récents', 'Escalade', 'Poids'])
  })

  it('règle le son, la voix et la veille pendant la séance', async () => {
    const { user } = await renderApp('/more/settings')
    const sound = await screen.findByRole('switch', { name: 'Son du minuteur' })
    const voice = screen.getByRole('switch', { name: 'Annonces vocales' })
    const screenOn = screen.getByRole('switch', { name: 'Écran toujours allumé' })
    expect(sound).toBeChecked()
    expect(voice).not.toBeChecked()
    expect(screenOn).toBeChecked()

    await user.click(sound)
    await user.click(voice)
    await user.click(screenOn)
    await waitFor(async () => {
      expect(await settings()).toMatchObject({ restTimerSound: false, voiceCues: true, keepScreenOn: false })
    })
    expect(sound).not.toBeChecked()
    expect(voice).toBeChecked()
  })

  it('masque l’escalade partout, puis la réaffiche', async () => {
    const { user } = await renderApp('/more/settings')
    const module = await screen.findByRole('switch', { name: 'Module escalade' })

    await user.click(module)
    expect(await screen.findByText('Escalade masquée')).toBeInTheDocument()
    await waitFor(() => {
      expect(tabBar()).toEqual(['Aujourd’hui', 'Calendrier', 'Entraînement', 'Plus'])
    })
    expect(screen.queryByRole('link', { name: 'Couleurs et cotations' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Salle des nouvelles séances')).not.toBeInTheDocument()
    const tabs = screen.getByRole('list', { name: 'Onglets de la barre' })
    expect(within(tabs).queryByRole('switch', { name: 'Escalade' })).not.toBeInTheDocument()
    const cards = screen.getByRole('list', { name: 'Cartes de l’accueil' })
    expect(within(cards).queryByRole('switch', { name: 'Escalade' })).not.toBeInTheDocument()
    expect(await settings()).toMatchObject({
      hiddenModules: ['climbing'],
      tabs: ['today', 'calendar', 'training'],
    })

    await user.click(module)
    expect(await screen.findByText('Escalade affichée')).toBeInTheDocument()
    await waitFor(() => {
      expect(tabBar()).toEqual(['Aujourd’hui', 'Calendrier', 'Entraînement', 'Escalade', 'Plus'])
    })
    expect(within(cards).getByRole('switch', { name: 'Escalade' })).toBeChecked()
  })

  it('enregistre la salle d’escalade en quittant le champ et mène aux couleurs', async () => {
    const { user, router } = await renderApp('/more/settings')
    const gym = await screen.findByLabelText('Salle des nouvelles séances')
    expect(gym).toHaveValue('Vertical’Art')

    await user.clear(gym)
    await user.type(gym, '  Arkose Massy  {Enter}')
    expect(await screen.findByText('Salle enregistrée')).toBeInTheDocument()
    expect(gym).toHaveValue('Arkose Massy')
    expect((await settings()).climbingGym).toBe('Arkose Massy')

    await user.click(screen.getByRole('link', { name: 'Couleurs et cotations' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/climbing/grades')
    })
  })
})
