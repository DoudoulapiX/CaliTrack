import { screen, waitFor, within } from '@testing-library/react'
import { addSession, addSlot, emptyProgram, newSession, newSlot } from '@/content/programs/edit'
import { schemeFor } from '@/content/programs/schemes'
import { customGoal } from '@/content/goals/create'
import { addClimb } from '@/db/climbing'
import { db } from '@/db/db'
import { addSkillGoals, logWeight, saveGoal } from '@/db/goals'
import { activateProgram, saveProgram } from '@/db/programs'
import { updateProfile, updateSettings } from '@/db/settings'
import type { Program } from '@/db/types'
import { calendarEvent, climbSession, doneWorkout, sequentialIds, testCatalog } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import { expectFrenchSpacing } from '@/test/typography'

// Les horloges de la séance en direct ne tournent pas pendant les tests.
vi.mock('@/features/workout/useNow', () => ({ useNow: () => Date.now() }))

/** Programme suivi : « Haut du corps » (des pompes) le lundi et le mercredi, depuis le lundi 5 octobre 2026. */
async function saveProgramMondayWednesday(): Promise<Program> {
  const { byId } = await testCatalog()
  const pushup = byId.get('pushup')
  if (!pushup) throw new Error('pushup')
  const newId = sequentialIds('c')
  let program = emptyProgram({
    name: 'Mon programme',
    focuses: ['strength'],
    locationId: null,
    startDate: '2026-10-05',
    now: '2026-10-05T08:00:00.000Z',
    newId,
  })
  const session = newSession('Haut du corps', [1, 3], newId)
  program = addSession(program, session)
  const defaults = { scheme: schemeFor(['strength'], 'intermediate'), loadsOf: () => [], newId }
  program = addSlot(program, session.id, 'strength', newSlot(pushup, 'strength', defaults), newId)
  const saved = await saveProgram(program)
  await activateProgram(saved.id)
  return { ...saved, active: true }
}

/** Une semaine bien remplie : programme, escalade le mercredi, une course, objectifs, pesées, records. */
async function fullWeek() {
  const program = await saveProgramMondayWednesday()
  const session = program.sessions[0]
  if (!session) throw new Error('séance manquante')
  await updateProfile({ climbingDays: [3] })
  await db.workouts.bulkPut([
    doneWorkout('avant', '2026-10-12', [['pushup', [10, 9]]]),
    doneWorkout('lundi', '2026-10-19', [['pushup', [12, 10]]], {
      title: 'Haut du corps',
      programId: program.id,
      programSessionId: session.id,
    }),
  ])
  await db.events.put(calendarEvent('course', '2026-10-21', { time: '19:00', durationMin: 40 }))
  await addClimb(
    climbSession('samedi', '2026-10-17', [
      ['bleu', 'flash'],
      ['rouge', 'sent'],
    ]),
  )
  const { byId } = await testCatalog()
  await addSkillGoals(['muscleUp'], (id) => byId.get(id)?.name ?? id)
  await saveGoal(
    customGoal(
      { title: 'Courir 10 km', deadline: null, pinned: false },
      '2026-10-01T08:00:00.000Z',
      () => 'g2',
    ),
  )
  await logWeight('2026-10-01', 74.5)
  await logWeight('2026-10-20', 73.3)
}

// Les textes se comparent avec des espaces simples : la recherche ramène les espaces insécables à des
// espaces ; expectFrenchSpacing vérifie qu'elles sont bien là.

/** Les titres des cartes, dans l'ordre de l'écran. */
const cardTitles = () => screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)

/** La carte (section) qui porte ce titre. */
function card(title: string): HTMLElement {
  const section = screen.getByRole('heading', { name: title, level: 2 }).closest('section')
  if (!section) throw new Error(`Carte ${title} introuvable`)
  return section
}

describe('écran Aujourd’hui', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, en fin de matinée.
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rassemble la séance du jour, la semaine, les objectifs, l’escalade, le poids et les records', async () => {
    await renderApp('/', { setup: fullWeek })

    expect(await screen.findByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Mercredi 21 octobre')).toBeInTheDocument()
    expect(await screen.findByText('Records récents')).toBeInTheDocument()
    await waitFor(() => {
      expect(cardTitles()).toEqual([
        'Au programme',
        'Ma semaine',
        'Objectifs',
        'Escalade',
        'Poids',
        'Records récents',
      ])
    })

    // Au programme : la séance du jour à commencer, puis l'escalade et la course du soir.
    const today = card('Au programme')
    expect(await within(today).findByRole('button', { name: 'Commencer la séance' })).toBeInTheDocument()
    expect(within(today).getByText('Haut du corps')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: /^Escalade/ })).toHaveAttribute(
      'href',
      '/calendar?jour=2026-10-21',
    )
    expect(within(today).getByRole('link', { name: /^Course à pied/ })).toHaveAttribute(
      'href',
      '/calendar?jour=2026-10-21',
    )

    // La semaine : la séance du lundi faite, celle du jour à faire.
    const week = card('Ma semaine')
    expect(
      within(week).getByRole('link', { name: 'Lundi 19 octobre, Haut du corps (faite)' }),
    ).toHaveAttribute('href', '/calendar?jour=2026-10-19')
    expect(
      within(week).getByRole('link', { name: /^Mercredi 21 octobre, aujourd’hui, Haut du corps, / }),
    ).toHaveAttribute('aria-current', 'date')
    expect(within(week).getByText('1 séance faite sur 2')).toBeInTheDocument()
    expect(
      within(week).getByRole('progressbar', { name: 'Séances du programme faites cette semaine' }),
    ).toHaveAttribute('aria-valuenow', '50')

    // Objectifs : seulement ceux affichés sur l'accueil.
    const goals = card('Objectifs')
    expect(within(goals).getByRole('link', { name: /^Muscle-up\s:\s/ })).toBeInTheDocument()
    // Tous ceux de la carte sont sur l'accueil : pas d'épingle pour le redire.
    expect(within(goals).queryByRole('link', { name: /sur l’accueil/ })).toBeNull()
    expect(within(goals).queryByText('Courir 10 km')).not.toBeInTheDocument()

    // Escalade : prévue aujourd'hui, avec les chiffres du mois.
    const climbing = card('Escalade')
    expect(within(climbing).getByText('Escalade prévue aujourd’hui')).toBeInTheDocument()
    expect(within(climbing).getByText('Dernière séance : samedi 17 octobre')).toBeInTheDocument()
    expect(within(climbing).getByText('Blocs réussis').nextElementSibling).toHaveTextContent('2')
    expect(within(climbing).getByRole('button', { name: 'Commencer une séance' })).toBeEnabled()

    // Poids : la dernière pesée et l'évolution du mois.
    const weight = card('Poids')
    expect(within(weight).getByText('73,3 kg')).toBeInTheDocument()
    expect(within(weight).getByText('Dernière pesée : hier')).toBeInTheDocument()
    expect(within(weight).getByText('−1,2 kg depuis le 1 octobre')).toBeInTheDocument()

    // Records : les pompes du lundi.
    const records = card('Records récents')
    const pushups = within(records).getByRole('link', { name: /^Pompes/ })
    expect(pushups).toHaveAttribute('href', '/training/history/lundi')
    expect(pushups).toHaveTextContent('Plus de répétitions : 12 rép. (avant : 10 rép.)')
    expect(pushups).toHaveTextContent('19 oct.')

    expectFrenchSpacing()
  })

  it('commence la séance du jour et la reprend depuis l’accueil', async () => {
    const { user, router } = await renderApp('/', { setup: saveProgramMondayWednesday })
    await user.click(await screen.findByRole('button', { name: 'Commencer la séance' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/workout\/.+/)
    })
    const path = router.state.location.pathname

    await router.navigate('/')
    const resume = await screen.findByRole('link', { name: 'Reprendre la séance' })
    expect(resume).toHaveAttribute('href', path)
    expect(within(card('Au programme')).getByText('Séance en cours')).toBeInTheDocument()
  })

  it('sans programme ni données : de quoi tout commencer', async () => {
    const { user } = await renderApp('/')

    await screen.findByRole('heading', { name: 'Au programme', level: 2 })
    const today = card('Au programme')
    expect(await within(today).findByText('Pas encore de programme')).toBeInTheDocument()
    expect(within(today).getByRole('link', { name: 'Créer mon programme' })).toHaveAttribute(
      'href',
      '/training/new',
    )
    expect(
      within(card('Ma semaine')).getByText('Rien de prévu ni de fait cette semaine.'),
    ).toBeInTheDocument()
    expect(within(card('Objectifs')).getByRole('link', { name: 'Créer un objectif' })).toHaveAttribute(
      'href',
      '/goals/new',
    )
    expect(within(card('Escalade')).getByText('Pas encore de séance')).toBeInTheDocument()
    expect(
      within(card('Records récents')).getByText('Aucun record battu ces 30 derniers jours.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Pense à sauvegarder')).not.toBeInTheDocument()

    // Le poids se note depuis l'accueil.
    const weight = card('Poids')
    expect(within(weight).getByText('Aucune pesée notée')).toBeInTheDocument()
    await user.click(within(weight).getByRole('button', { name: 'Noter mon poids' }))
    const sheet = await screen.findByRole('dialog', { name: 'Noter mon poids' })
    await user.type(within(sheet).getByLabelText('Poids'), '72,5')
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer' }))
    expect(await within(weight).findByText('72,5 kg')).toBeInTheDocument()
    expect(within(weight).getByText('Dernière pesée : aujourd’hui')).toBeInTheDocument()
    expectFrenchSpacing()
  })

  it('suit les cartes choisies dans les réglages, dans leur ordre', async () => {
    const { user, router } = await renderApp('/', {
      setup: () =>
        updateSettings({
          dashboardCards: ['weight', 'climbing', 'todaySession'],
          hiddenModules: ['climbing'],
        }),
    })
    await waitFor(() => {
      expect(cardTitles()).toEqual(['Poids', 'Au programme'])
    })
    await user.click(screen.getByRole('link', { name: 'Personnaliser l’accueil' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/more/settings')
    })

    await updateSettings({ dashboardCards: [] })
    await router.navigate('/')
    expect(await screen.findByText('Aucune carte sur l’accueil')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choisir mes cartes' })).toHaveAttribute('href', '/more/settings')
  })

  it('rappelle de sauvegarder quand la dernière sauvegarde date', async () => {
    const { router } = await renderApp('/', {
      setup: async () => {
        await db.settings.update('app', { createdAt: '2026-09-01T08:00:00.000Z' })
        await db.workouts.put(doneWorkout('w1', '2026-10-19'))
      },
    })
    expect(await screen.findByText('Pense à sauvegarder')).toBeInTheDocument()
    expect(
      screen.getByText('Tes données ne sont que sur cet iPhone : garde-en une copie dans Fichiers.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sauvegarder' })).toHaveAttribute('href', '/more/backup')

    await updateSettings({ lastBackupAt: '2026-10-11T08:00:00.000Z' })
    expect(await screen.findByText('Dernière sauvegarde il y a 10 jours.')).toBeInTheDocument()
    await updateSettings({ lastBackupAt: '2026-10-20T08:00:00.000Z' })
    await waitFor(() => {
      expect(screen.queryByText('Pense à sauvegarder')).not.toBeInTheDocument()
    })
    expect(router.state.location.pathname).toBe('/')
  })

  it('reprend la séance d’escalade en cours', async () => {
    await renderApp('/', {
      setup: async () => {
        await addClimb(
          climbSession('encours', '2026-10-21', [['vert', 'sent']], {
            status: 'active',
            startedAt: '2026-10-21T08:30:00.000Z',
            endedAt: null,
            durationMin: null,
          }),
        )
      },
    })
    await screen.findByRole('heading', { name: 'Escalade', level: 2 })
    const climbing = card('Escalade')
    expect(await within(climbing).findByText('Séance en cours')).toBeInTheDocument()
    expect(within(climbing).getByText('Depuis 10:30 · 1 bloc réussi')).toBeInTheDocument()
    expect(within(climbing).getByRole('link', { name: 'Reprendre' })).toHaveAttribute(
      'href',
      '/climbing/session/encours',
    )
  })
})
