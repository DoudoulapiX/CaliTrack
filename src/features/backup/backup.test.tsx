import { screen, waitFor, within } from '@testing-library/react'
import { parseBackup } from '@/db/backup'
import { db } from '@/db/db'
import { today } from '@/lib/dates'
import { climbSession, doneWorkout } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'
import { stubProperty } from '@/test/stub'

const settings = async () => {
  const value = await db.settings.get('app')
  if (!value) throw new Error('Réglages absents')
  return value
}

const withData = () =>
  Promise.all([
    db.workouts.put(doneWorkout('w1', '2026-10-09', [['pullup', [8, 8]]])),
    db.climbingSessions.put(climbSession('c1', '2026-10-10', [['bleu', 'flash']])),
  ])

describe('écran Sauvegarde', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'canShare')
    Reflect.deleteProperty(navigator, 'share')
  })

  it('enregistre toutes les données dans Fichiers et note la date', async () => {
    const shared: File[] = []
    stubProperty(navigator, 'canShare', () => true)
    stubProperty(navigator, 'share', ({ files }: { files: File[] }) => {
      shared.push(...files)
      return Promise.resolve()
    })
    const { user } = await renderApp('/more/backup', { setup: withData })

    expect(await screen.findByText('Jamais', { selector: 'p' })).toBeInTheDocument()
    expect(await screen.findByText('1 séance, 1 séance d’escalade, 0 objectif')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Enregistrer dans Fichiers' }))

    expect(await screen.findByText('Sauvegarde enregistrée')).toBeInTheDocument()
    expect(await screen.findByText(/^Aujourd’hui à \d\d:\d\d$/)).toBeInTheDocument()
    expect((await settings()).lastBackupAt).not.toBeNull()

    expect(shared).toHaveLength(1)
    const [file] = shared
    expect(file?.name).toBe(`calitrack-sauvegarde-${today()}.json`)
    const parsed = parseBackup((await file?.text()) ?? '')
    expect(parsed.ok && parsed.backup.tables.workouts.map((w) => w.id)).toEqual(['w1'])
    expect(parsed.ok && parsed.backup.tables.climbingSessions.map((c) => c.id)).toEqual(['c1'])
    // Le fichier sait lui-même de quand il date.
    const { lastBackupAt } = await settings()
    expect(parsed.ok && parsed.backup.exportedAt).toBe(lastBackupAt)
    expect(parsed.ok && parsed.backup.tables.settings[0]?.lastBackupAt).toBe(lastBackupAt)
  })

  it('ne note rien quand le partage est annulé', async () => {
    stubProperty(navigator, 'canShare', () => true)
    stubProperty(navigator, 'share', () => Promise.reject(new DOMException('Annulé', 'AbortError')))
    const { user } = await renderApp('/more/backup', { setup: withData })

    const save = await screen.findByRole('button', { name: 'Enregistrer dans Fichiers' })
    await waitFor(() => {
      expect(save).toBeEnabled()
    })
    await user.click(save)
    await waitFor(() => {
      expect(save).toBeEnabled()
    })
    expect(screen.getByText('Jamais', { selector: 'p' })).toBeInTheDocument()
    expect(screen.queryByText(/Sauvegarde (enregistrée|téléchargée)/)).not.toBeInTheDocument()
    expect((await settings()).lastBackupAt).toBeNull()
  })

  it('règle le rappel de sauvegarde de l’accueil', async () => {
    const { user } = await renderApp('/more/backup')
    const reminder = await screen.findByRole('radiogroup', { name: 'Rappel de sauvegarde' })
    expect(within(reminder).getByRole('radio', { name: 'Tous les 7 jours' })).toBeChecked()

    await user.click(within(reminder).getByRole('radio', { name: 'Tous les 14 jours' }))
    await waitFor(async () => {
      expect((await settings()).backupReminderDays).toBe(14)
    })
    await user.click(within(reminder).getByRole('radio', { name: 'Jamais' }))
    await waitFor(async () => {
      expect((await settings()).backupReminderDays).toBe(0)
    })
  })

  it('fait une copie de sécurité et y revient', async () => {
    const { user } = await renderApp('/more/backup', { setup: withData })

    await user.click(await screen.findByRole('button', { name: 'Faire une copie maintenant' }))
    expect(await screen.findByText('Copie de sécurité faite')).toBeInTheDocument()
    const copy = await screen.findByRole('button', { name: /^Copie manuelle · .+\sà\s\d\d:\d\d/ })

    await db.workouts.delete('w1')
    expect(await screen.findByText('0 séance, 1 séance d’escalade, 0 objectif')).toBeInTheDocument()

    await user.click(copy)
    const sheet = await screen.findByRole('dialog', { name: /Revenir à cette copie/ })
    await user.click(within(sheet).getByRole('button', { name: 'Revenir à cette copie' }))
    expect(await screen.findByText('Copie restaurée')).toBeInTheDocument()
    expect(await screen.findByText('1 séance, 1 séance d’escalade, 0 objectif')).toBeInTheDocument()
    expect(await db.workouts.get('w1')).toBeDefined()

    // L'état d'avant le retour est gardé dans une nouvelle copie.
    expect(await screen.findByRole('button', { name: /^Avant restauration · / })).toBeInTheDocument()
    expect(await db.snapshots.count()).toBe(2)
  })

  it('tout effacer ramène au premier lancement', async () => {
    const { user, router } = await renderApp('/more/backup', { setup: withData })

    await user.click(await screen.findByRole('button', { name: 'Tout effacer' }))
    const sheet = await screen.findByRole('dialog', { name: /Tout effacer/ })
    await user.click(within(sheet).getByRole('button', { name: 'Tout effacer' }))

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/onboarding')
    })
    expect(await db.workouts.count()).toBe(0)
    expect(await db.climbingSessions.count()).toBe(0)
    expect((await settings()).onboardingDone).toBe(false)
  })
})

describe('écran À propos', () => {
  it('donne la version, les crédits et cherche une mise à jour', async () => {
    const { user } = await renderApp('/more/about')

    expect(await screen.findByRole('heading', { name: 'À propos' })).toBeInTheDocument()
    expect(screen.getByText(/^Version 0\.\d+\.\d+ du \d{1,2} \S+ \d{4}$/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Exercices et images/ })).toHaveAttribute(
      'href',
      'https://github.com/yuhonas/free-exercise-db',
    )
    expect(screen.getByText(/Kaskad Coaching/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Valeurs nutritionnelles.*Etalab 2\.0/ })).toHaveAttribute(
      'href',
      'https://ciqual.anses.fr',
    )
    expect(screen.getByRole('link', { name: /^Produits scannés.*ODbL/ })).toHaveAttribute(
      'href',
      'https://world.openfoodfacts.org',
    )
    expect(screen.getByText(/la photo d’un repas \(vers Anthropic, avec ta clé\)/)).toBeInTheDocument()
    // Le coach IA : ses demandes et leurs photos partent aussi vers Anthropic, sans qu'aucune photo soit gardée.
    expect(
      screen.getByText(/les demandes au coach IA et leurs photos \(aussi vers Anthropic\)/),
    ).toHaveTextContent(
      /CaliTrack ne garde aucune de ces photos, pas même celles de ton corps pour le coach physique\./,
    )
    // Le compteur caméra : l'image reste sur l'iPhone ; MediaPipe et les données de test sont cités.
    expect(
      screen.getByText(/Le compteur de répétitions regarde l’image de la caméra sur l’iPhone même/),
    ).toHaveTextContent(/aucune image n’est envoyée ni enregistrée\./)
    expect(
      screen.getByRole('link', {
        name: /^Compteur de répétitions.*MediaPipe Pose Landmarker de Google.*licence Apache 2\.0\.$/,
      }),
    ).toHaveAttribute('href', 'https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker')
    expect(
      screen.getByRole('link', {
        name: /^Données de test du compteur.*MM-Fit \(Strömbäck, Huang et Radu, 2020\), licence CC BY 4\.0\s; démo de Sports2D, licence BSD-3-Clause\.$/,
      }),
    ).toHaveAttribute('href', 'https://mmfit.github.io/')
    expectFrenchSpacing()
    // Dans Safari, pas encore sur l'écran d'accueil : les étapes pour l'y mettre.
    expect(screen.getByText(/Sur l’écran d’accueil\s»/)).toBeInTheDocument()

    // Pas de service hors ligne dans les tests (comme dans un onglet privé).
    await user.click(screen.getByRole('button', { name: 'Rechercher une mise à jour' }))
    expect(await screen.findByText(/^Recherche indisponible ici/)).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Sauvegarde' }))
    expect(await screen.findByRole('heading', { name: 'Sauvegarde' })).toBeInTheDocument()
  })
})
