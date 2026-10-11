import { screen, waitFor, within } from '@testing-library/react'
import { addSession, addSlot, emptyProgram, newSession, newSlot } from '@/content/programs/edit'
import { schemeFor } from '@/content/programs/schemes'
import { db } from '@/db/db'
import { activateProgram, saveProgram } from '@/db/programs'
import { updateProfile } from '@/db/settings'
import type { Program, Workout } from '@/db/types'
import { sequentialIds, testCatalog } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'

// Les horloges de la séance en direct ne tournent pas pendant les tests.
vi.mock('@/features/workout/useNow', () => ({ useNow: () => Date.now() }))

/** Programme suivi, fait main : « Haut du corps » le lundi et le jeudi, depuis le lundi 5 octobre 2026. */
async function saveCustomProgram(): Promise<Program> {
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
  const session = newSession('Haut du corps', [1, 4], newId)
  program = addSession(program, session)
  const defaults = { scheme: schemeFor(['strength'], 'intermediate'), loadsOf: () => [], newId }
  program = addSlot(program, session.id, 'strength', newSlot(pushup, 'strength', defaults), newId)
  const saved = await saveProgram(program)
  await activateProgram(saved.id)
  return { ...saved, active: true }
}

/** La séance du programme faite le lundi 19 octobre. */
async function saveMondayWorkout(program: Program): Promise<void> {
  const session = program.sessions[0]
  if (!session) throw new Error('séance manquante')
  const workout: Workout = {
    id: 'lundi',
    date: '2026-10-19',
    startedAt: '2026-10-19T17:00:00.000Z',
    endedAt: '2026-10-19T17:50:00.000Z',
    title: session.name,
    programId: program.id,
    programSessionId: session.id,
    plannedFor: null,
    eventId: null,
    exercises: [],
    rpe: null,
    notes: '',
    status: 'done',
    deload: false,
    progression: [],
  }
  await db.workouts.put(workout)
}

function dayButton(name: RegExp | string) {
  return screen.getByRole('button', { name })
}

describe('calendrier', () => {
  beforeEach(() => {
    // Le mercredi 21 octobre 2026, en fin de matinée.
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('montre le mois avec le programme, l’escalade et une course ajoutée en deux touches', async () => {
    const { user } = await renderApp('/calendar', {
      setup: async () => {
        await saveMondayWorkout(await saveCustomProgram())
        await updateProfile({ climbingDays: [6] })
      },
    })
    expect(await screen.findByRole('heading', { name: 'Octobre 2026', level: 2 })).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: 'Lundi 19 octobre, Haut du corps (faite)' }),
    ).toHaveAttribute('aria-pressed', 'false')
    expect(dayButton('Jeudi 22 octobre, Haut du corps')).toBeInTheDocument()
    expect(dayButton('Jeudi 15 octobre, Haut du corps (manquée)')).toBeInTheDocument()
    expect(dayButton('Samedi 24 octobre, Escalade')).toBeInTheDocument()
    const today = dayButton('Mercredi 21 octobre, aujourd’hui')
    expect(today).toHaveAttribute('aria-pressed', 'true')
    expect(today).toHaveAttribute('aria-current', 'date')
    expect(screen.getByRole('heading', { name: 'Mercredi 21 octobre · Aujourd’hui' })).toBeInTheDocument()
    expect(screen.getByText('Rien de prévu ce jour-là.')).toBeInTheDocument()

    // Le lundi : la séance faite, avec son bilan.
    await user.click(dayButton(/^Lundi 19 octobre/))
    expect(await screen.findByRole('heading', { name: 'Lundi 19 octobre' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Haut du corps/ }))
    const done = await screen.findByRole('dialog', { name: 'Haut du corps' })
    expect(within(done).getByText('Faite')).toBeInTheDocument()
    expect(within(done).getByRole('link', { name: 'Voir le bilan' })).toHaveAttribute(
      'href',
      '/training/history/lundi',
    )
    expect(within(done).queryByRole('button', { name: 'Passer cette séance' })).not.toBeInTheDocument()
    await user.click(within(done).getByRole('button', { name: 'Fermer' }))

    // Retour à aujourd'hui, puis une course faite : le + puis « Ajouter la séance ».
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }))
    await user.click(screen.getByRole('button', { name: 'Ajouter une séance' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nouvelle séance' })
    expect(within(sheet).getByRole('radio', { name: 'Cardio' })).toHaveAttribute('aria-checked', 'true')
    expect(within(sheet).getByRole('radio', { name: 'Course à pied' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(sheet).getByRole('radio', { name: 'Faite' })).toHaveAttribute('aria-checked', 'true')
    await user.type(within(sheet).getByLabelText('Distance'), '7,5')
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter la séance' }))
    expect(await screen.findByText('Séance ajoutée')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Course à pied/ })).toHaveTextContent('7,5 km')
    const [run] = await db.events.toArray()
    expect(run).toMatchObject({ date: '2026-10-21', kind: 'cardio', status: 'done', distanceKm: 7.5 })
  })

  it('passe une séance du programme, la remet, puis la fait en avance', async () => {
    const { user, router } = await renderApp('/calendar?jour=2026-10-22', { setup: saveCustomProgram })
    const row = await screen.findByRole('button', { name: /^Haut du corps/ })
    await user.click(row)
    let sheet = await screen.findByRole('dialog', { name: 'Haut du corps' })
    expect(
      within(sheet).getByText('Faite dès aujourd’hui, elle comptera pour ce jour-là.'),
    ).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Passer cette séance' }))
    expect(await screen.findByText('Séance passée')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Haut du corps/ })).toHaveTextContent(/Passée$/)
    })
    expect(await db.events.count()).toBe(1)
    expect(dayButton('Jeudi 22 octobre')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Haut du corps/ }))
    sheet = await screen.findByRole('dialog', { name: 'Haut du corps' })
    await user.click(within(sheet).getByRole('button', { name: 'Remettre cette séance' }))
    expect(await screen.findByText('Séance remise')).toBeInTheDocument()
    await waitFor(async () => {
      expect(await db.events.count()).toBe(0)
    })

    await user.click(await screen.findByRole('button', { name: /^Haut du corps/ }))
    sheet = await screen.findByRole('dialog', { name: 'Haut du corps' })
    await user.click(within(sheet).getByRole('button', { name: 'La faire maintenant' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/workout\//)
    })
    const [workout] = await db.workouts.toArray()
    expect(workout).toMatchObject({ date: '2026-10-21', plannedFor: '2026-10-22', status: 'active' })
  })

  it('répète une séance chaque semaine, note un jour, puis supprime la répétition', async () => {
    const { user, router } = await renderApp('/calendar')
    await user.click(await screen.findByRole('button', { name: 'Ajouter une séance' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nouvelle séance' })
    await user.click(within(sheet).getByRole('radio', { name: 'Autre' }))
    const name = within(sheet).getByLabelText('Nom')
    expect(name).toHaveValue('Séance')
    await user.clear(name)
    await user.type(name, 'Yoga')
    await user.click(within(sheet).getByRole('switch', { name: 'Répéter chaque semaine' }))
    const days = within(sheet).getByRole('group', { name: 'Jours de la semaine' })
    expect(within(days).getByRole('button', { name: 'mercredi' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(days).getByRole('button', { name: 'mardi' }))
    expect(within(sheet).queryByRole('radiogroup', { name: 'Statut' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Ajouter la séance' }))
    expect(await screen.findByText('Séance ajoutée')).toBeInTheDocument()
    const [series] = await db.eventSeries.toArray()
    expect(series).toMatchObject({ title: 'Yoga', kind: 'custom', weekdays: [2, 3], startDate: '2026-10-21' })
    expect(dayButton('Mardi 27 octobre, Yoga')).toBeInTheDocument()
    expect(dayButton('Mardi 20 octobre')).toBeInTheDocument() // avant le début

    // Aujourd'hui : c'est fait.
    await user.click(await screen.findByRole('button', { name: /^Yoga/ }))
    let occurrence = await screen.findByRole('dialog', { name: 'Yoga' })
    expect(within(occurrence).getByText(/^Chaque mardi et mercredi/)).toBeInTheDocument()
    await user.click(within(occurrence).getByRole('button', { name: 'C’est fait' }))
    expect(await screen.findByText('Séance notée')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^Yoga/ })).toHaveTextContent(/Faite$/)
    })

    // Mardi prochain : pas cette fois.
    await user.click(dayButton(/^Mardi 27 octobre/))
    expect(router.state.location.search).toBe('?jour=2026-10-27')
    await user.click(await screen.findByRole('button', { name: /^Yoga/ }))
    occurrence = await screen.findByRole('dialog', { name: 'Yoga' })
    expect(within(occurrence).queryByRole('button', { name: 'C’est fait' })).not.toBeInTheDocument()
    await user.click(within(occurrence).getByRole('button', { name: 'Pas cette fois' }))
    expect(await screen.findByText('Séance annulée')).toBeInTheDocument()
    expect(dayButton('Mardi 27 octobre')).toBeInTheDocument() // plus de pastille

    // Le mercredi suivant : on supprime la répétition, le jour fait reste.
    await user.click(dayButton(/^Mercredi 28 octobre/))
    await user.click(await screen.findByRole('button', { name: /^Yoga/ }))
    occurrence = await screen.findByRole('dialog', { name: 'Yoga' })
    await user.click(within(occurrence).getByRole('button', { name: 'Modifier la répétition' }))
    const edit = await screen.findByRole('dialog', { name: 'Séance répétée' })
    expect(within(edit).getByLabelText('Premier jour')).toHaveValue('2026-10-21')
    await user.click(within(edit).getByRole('button', { name: 'Supprimer la répétition' }))
    const confirm = await screen.findByRole('dialog', { name: /^Supprimer/ })
    await user.click(within(confirm).getByRole('button', { name: 'Supprimer la répétition' }))
    expect(await screen.findByText('Répétition supprimée')).toBeInTheDocument()
    expect(await db.eventSeries.count()).toBe(0)
    const left = await db.events.toArray()
    expect(left.map((e) => [e.date, e.status, e.seriesId])).toEqual([['2026-10-21', 'done', null]])
    expect(dayButton('Mercredi 21 octobre, aujourd’hui, Yoga (faite)')).toBeInTheDocument()
  })

  it('change de mois aux flèches et au clavier', async () => {
    const { user, router } = await renderApp('/calendar')
    await user.click(await screen.findByRole('button', { name: 'Mois suivant' }))
    expect(screen.getByRole('heading', { name: 'Novembre 2026', level: 2 })).toBeInTheDocument()
    expect(dayButton('Dimanche 1 novembre')).toHaveAttribute('aria-pressed', 'true')
    expect(router.state.location.search).toBe('?jour=2026-11-01')

    // Au clavier, le jour d'avant est en octobre : le mois suit.
    dayButton('Dimanche 1 novembre').focus()
    await user.keyboard('{ArrowLeft}')
    expect(await screen.findByRole('heading', { name: 'Octobre 2026', level: 2 })).toBeInTheDocument()
    await waitFor(() => {
      expect(dayButton('Samedi 31 octobre')).toHaveFocus()
    })
    await user.keyboard('{ArrowUp}')
    await waitFor(() => {
      expect(dayButton('Samedi 24 octobre')).toHaveFocus()
    })

    await user.click(screen.getByRole('button', { name: 'Mois précédent' }))
    expect(screen.getByRole('heading', { name: 'Septembre 2026', level: 2 })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Aujourd’hui' }))
    expect(screen.getByRole('heading', { name: 'Octobre 2026', level: 2 })).toBeInTheDocument()
    expect(dayButton('Mercredi 21 octobre, aujourd’hui')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Aujourd’hui' })).not.toBeInTheDocument()
  })

  it('propose de rattraper la séance manquée, puis la suivante', async () => {
    const { user, router } = await renderApp('/training', { setup: saveCustomProgram })
    expect(await screen.findByText('À rattraper')).toBeInTheDocument()
    expect(screen.getByText(/^Prévue lundi 19/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cette semaine' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'lundi 19 oct. : Haut du corps (manquée)' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'jeudi 22 oct. : Haut du corps' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'La passer' }))
    expect(await screen.findByText('Séance passée')).toBeInTheDocument()
    expect(await screen.findByText('Repos aujourd’hui')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'lundi 19 oct. : Haut du corps (passée)' })).toBeInTheDocument()
    expect(screen.getByText(/^Prochaine séance demain/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'La faire maintenant' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/workout\//)
    })
    const [workout] = await db.workouts.toArray()
    expect(workout).toMatchObject({ date: '2026-10-21', plannedFor: '2026-10-22' })
  })
})
