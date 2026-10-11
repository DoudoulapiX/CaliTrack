import { screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { updateProfile } from '@/db/settings'
import { renderApp } from '@/test/render-app'

describe('profil et niveau', () => {
  it('enregistre les changements du profil', async () => {
    const { user } = await renderApp('/more/profile')
    const save = await screen.findByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Prénom'), 'Charles')
    await user.type(screen.getByLabelText('Taille'), '180')
    const skills = screen.getByRole('group', { name: 'Figures visées' })
    await user.click(within(skills).getByRole('button', { name: 'Front lever' }))
    await user.click(screen.getByRole('radio', { name: /^Intermédiaire/ }))
    expect(save).toBeEnabled()
    await user.click(save)

    expect(await screen.findByText('Profil enregistré')).toBeInTheDocument()
    await waitFor(() => {
      expect(save).toBeDisabled()
    })
    expect(await db.profile.get('me')).toMatchObject({
      firstName: 'Charles',
      heightCm: 180,
      targetSkills: ['muscleUp', 'frontLever'],
      experience: 'intermediate',
    })
  })

  it('suit un changement enregistré ailleurs sans perdre la saisie', async () => {
    const { user } = await renderApp('/more/profile')
    await user.type(await screen.findByLabelText('Prénom'), 'Charles')
    // Le test de niveau vient d'être enregistré : le profil change pendant que l'écran est ouvert.
    await updateProfile({ experience: 'advanced' })
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /^Avancé/ })).toHaveAttribute('aria-checked', 'true')
    })
    expect(screen.getByLabelText('Prénom')).toHaveValue('Charles')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(async () => {
      expect(await db.profile.get('me')).toMatchObject({ firstName: 'Charles', experience: 'advanced' })
    })
  })

  it('demande au moins un jour d’entraînement', async () => {
    const { user } = await renderApp('/more/profile')
    const days = await screen.findByRole('group', { name: 'Jours d’entraînement' })
    for (const day of ['lundi', 'mercredi', 'vendredi']) {
      await user.click(within(days).getByRole('button', { name: day }))
    }
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choisis au moins un jour d’entraînement.')
    expect((await db.profile.get('me'))?.trainingDays).toEqual([1, 3, 5])
  })

  it('fait le test de niveau et revient au profil', async () => {
    const { user, router } = await renderApp('/more/profile')
    await user.click(await screen.findByRole('link', { name: 'Faire le test' }))
    expect(await screen.findByRole('heading', { name: 'Test de niveau', level: 1 })).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Enregistrer le test' })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText('Pompes'), '45')
    await user.type(screen.getByLabelText('Tractions'), '13')
    await user.type(screen.getByLabelText('Gainage'), '150')
    expect(screen.getByText('Niveau estimé')).toBeInTheDocument()
    await user.click(save)

    expect(await screen.findByText(/Test enregistré.+Avancé/)).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/profile')
    })
    expect(await screen.findByRole('link', { name: 'Refaire le test' })).toBeInTheDocument()
    expect(screen.getByText(/^Test du /)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /^Avancé/ })).toHaveAttribute('aria-checked', 'true')
    expect(await db.profile.get('me')).toMatchObject({
      experience: 'advanced',
      levelTest: { pushUps: 45, pullUps: 13, plankSec: 150, dips: null },
    })
  })

  it('ouvert directement, le test revient au profil une fois enregistré', async () => {
    const { user, router } = await renderApp('/more/profile/test')
    await user.type(await screen.findByLabelText('Squats'), '20')
    await user.click(screen.getByRole('button', { name: 'Enregistrer le test' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/profile')
    })
    expect((await db.profile.get('me'))?.experience).toBe('beginner')
  })

  it('rappelle le test précédent dans chaque champ', async () => {
    await renderApp('/more/profile/test')
    await updateProfile({
      levelTest: {
        date: '2026-09-01',
        pushUps: 20,
        pullUps: 5,
        dips: null,
        squats: null,
        plankSec: 90,
        deadHangSec: null,
      },
    })
    expect(await screen.findByPlaceholderText(/Avant.+20/)).toBe(screen.getByLabelText('Pompes'))
    expect(screen.getByPlaceholderText(/Avant.+90/)).toBe(screen.getByLabelText('Gainage'))
    expect(screen.getByLabelText('Dips')).toHaveAttribute('placeholder', '')
  })
})
