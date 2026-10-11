import { screen, waitFor, within } from '@testing-library/react'
import { collectBackup, serializeBackup } from '@/db/backup'
import { db } from '@/db/db'
import { ensureSeeded } from '@/db/seed'
import { updateProfile, updateSettings } from '@/db/settings'
import { renderApp } from '@/test/render-app'
import { resetDb } from '@/test/db'

const next = () => screen.getByRole('button', { name: 'Continuer' })

describe('premier lancement', () => {
  it('prépare profil, lieux, matériel et niveau', async () => {
    const { user, router } = await renderApp('/onboarding', { onboarded: false })
    await user.click(await screen.findByRole('button', { name: 'Commencer' }))

    // Toi
    await user.type(screen.getByLabelText('Prénom'), 'Charles')
    await user.type(screen.getByLabelText('Poids'), '72,5')
    await user.click(next())

    // Objectifs : il en faut au moins un.
    const goals = screen.getByRole('group', { name: 'Tes objectifs' })
    await user.click(within(goals).getByRole('button', { name: 'Force' }))
    await user.click(within(goals).getByRole('button', { name: 'Figures' }))
    await user.click(next())
    expect(screen.getByRole('alert')).toHaveTextContent('Choisis au moins un objectif.')
    await user.click(within(goals).getByRole('button', { name: 'Escalade' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(next())

    // Planning
    const climbing = screen.getByRole('group', { name: 'Jours d’escalade' })
    await user.click(within(climbing).getByRole('button', { name: 'samedi' }))
    await user.click(next())

    // Matériel : le parc arrive avec ses barres déjà cochées.
    const where = screen.getByRole('group', { name: /Où t’entraînes-tu/ })
    await user.click(within(where).getByRole('button', { name: 'Maison' }))
    await user.click(within(where).getByRole('button', { name: 'Parc' }))
    const home = screen.getByRole('group', { name: /Matériel.+Maison/ })
    await user.click(within(home).getByRole('button', { name: 'Barre de traction' }))
    await user.click(within(home).getByRole('button', { name: 'Haltères' }))
    const park = screen.getByRole('group', { name: /Matériel.+Parc/ })
    expect(within(park).getByRole('button', { name: 'Barre basse' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(next())

    // Niveau : le test donne le niveau.
    expect(screen.getByLabelText('Dips')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Tractions'), '8')
    await user.type(screen.getByLabelText('Pompes'), '30')
    expect(screen.getByText('Niveau estimé')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Terminer' }))

    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
    expect(await screen.findByText(/Tout est prêt/)).toBeInTheDocument()

    expect(await db.profile.get('me')).toMatchObject({
      firstName: 'Charles',
      weightKg: 72.5,
      focuses: ['climbing'],
      trainingDays: [1, 3, 5],
      climbingDays: [6],
      experience: 'intermediate',
      levelTest: { pushUps: 30, pullUps: 8, dips: null },
    })
    const locations = await db.locations.toArray()
    expect(locations.map((l) => l.name).sort()).toEqual(['Maison', 'Parc'])
    const homeId = locations.find((l) => l.icon === 'home')?.id
    const parkId = locations.find((l) => l.icon === 'park')?.id
    const items = await db.equipment.toArray()
    const at = (kind: string) => items.find((i) => i.kind === kind)?.locationIds.sort()
    expect(items.map((i) => i.kind).sort()).toEqual(['dipBars', 'dumbbells', 'lowBar', 'pullupBar'])
    expect(at('pullupBar')).toEqual([homeId, parkId].sort())
    expect(at('dumbbells')).toEqual([homeId])
    expect(at('dipBars')).toEqual([parkId])
  })

  it('revient en arrière et laisse choisir son niveau', async () => {
    const { user } = await renderApp('/onboarding', { onboarded: false })
    await user.click(await screen.findByRole('button', { name: 'Commencer' }))
    await user.type(screen.getByLabelText('Prénom'), 'Léa')
    await user.click(next())
    expect(screen.getByText('Étape 2 sur 5')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Retour' }))
    expect(screen.getByText('Étape 1 sur 5')).toBeInTheDocument()
    expect(screen.getByLabelText('Prénom')).toHaveValue('Léa')

    for (let step = 1; step <= 4; step++) await user.click(next())
    expect(screen.getByText(/Sans résultat, tu commences au niveau débutant/)).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Choisir moi-même' }))
    await user.click(screen.getByRole('radio', { name: /^Avancé/ }))
    await user.click(screen.getByRole('button', { name: 'Terminer' }))

    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    expect(await db.profile.get('me')).toMatchObject({
      firstName: 'Léa',
      experience: 'advanced',
      levelTest: null,
    })
    expect(await db.locations.count()).toBe(0)
    expect(await db.equipment.count()).toBe(0)
  })

  it('signale les tests impossibles sans le matériel', async () => {
    const { user } = await renderApp('/onboarding', { onboarded: false })
    await user.click(await screen.findByRole('button', { name: 'Commencer' }))
    for (let step = 1; step <= 3; step++) await user.click(next())
    const where = screen.getByRole('group', { name: /Où t’entraînes-tu/ })
    await user.click(within(where).getByRole('button', { name: 'Maison' }))
    await user.click(next())
    // Tractions et suspension demandent une barre, les dips des barres parallèles.
    expect(screen.getAllByText(/Il te faut.+barre de traction/)).toHaveLength(2)
    expect(screen.getAllByText(/Il te faut.+barres parallèles/)).toHaveLength(1)
  })

  it('restaure une sauvegarde au lieu de tout reprendre', async () => {
    await resetDb()
    await ensureSeeded()
    await updateSettings({ onboardingDone: true })
    await updateProfile({ firstName: 'Charles' })
    const text = serializeBackup(await collectBackup())

    const { user, router } = await renderApp('/onboarding', { onboarded: false })
    const file = new File([text], 'calitrack.json', { type: 'application/json' })
    await user.upload(await screen.findByLabelText('Restaurer une sauvegarde'), file)
    const sheet = await screen.findByRole('dialog', { name: /Restaurer cette sauvegarde/ })
    expect(within(sheet).getByText(/0 séance, 0 séance d’escalade, 0 objectif/)).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Restaurer' }))

    expect(await screen.findByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument()
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/')
    })
    expect((await db.profile.get('me'))?.firstName).toBe('Charles')
  })

  it('refuse un fichier qui n’est pas une sauvegarde', async () => {
    const { user } = await renderApp('/onboarding', { onboarded: false })
    const file = new File(['{"bonjour":1}'], 'autre.json', { type: 'application/json' })
    await user.upload(await screen.findByLabelText('Restaurer une sauvegarde'), file)
    expect(await screen.findByText('Ce fichier n’est pas une sauvegarde CaliTrack.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
