import { screen, waitFor, within } from '@testing-library/react'
import { db } from '@/db/db'
import { EMPTY_FILTER } from '@/content/exercises/catalog'
import { renderApp } from '@/test/render-app'
import { saveLibraryFilter } from './filter-store'

describe('bibliothèque d’exercices', () => {
  beforeEach(() => {
    saveLibraryFilter(EMPTY_FILTER)
  })

  it('liste tous les exercices et cherche sans tenir compte des accents', async () => {
    const { user } = await renderApp('/library')
    expect(await screen.findByText(/^\d{3} exercices$/, {}, { timeout: 5000 })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Rechercher un exercice' }), 'tractions')
    const results = await screen.findAllByRole('link', { name: /traction/i })
    expect(results[0]).toHaveAccessibleName(/^Tractions\b/)

    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzqx')
    expect(await screen.findByText('Aucun exercice trouvé')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tout effacer' }))
    expect(await screen.findByText(/^\d{3} exercices$/)).toBeInTheDocument()
  })

  it('filtre les exercices sans matériel et garde les filtres en revenant', async () => {
    const { user, router } = await renderApp('/library')
    await user.click(await screen.findByRole('button', { name: 'Sans matériel' }))
    expect(await screen.findByText(/exercices? sur \d{3}/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Tractions\b/ })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox'), 'pompes')
    await user.click((await screen.findAllByRole('link', { name: /^Pompes/ }))[0]!)
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/library\/.+/)
    })
    await user.click(await screen.findByRole('button', { name: 'Exercices' }))
    expect(await screen.findByRole('button', { name: 'Sans matériel', pressed: true })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('pompes')
  })

  it('affiche la liste par morceaux', async () => {
    const { user } = await renderApp('/library')
    const more = await screen.findByRole('button', { name: /Afficher plus/ })
    const before = screen.getAllByRole('link', { name: /./ }).length
    await user.click(more)
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /./ }).length).toBeGreaterThan(before)
    })
  })

  it('ouvre une fiche complète et enregistre favori et note', async () => {
    const { user } = await renderApp('/library/pullup')
    expect(await screen.findByRole('heading', { name: 'Tractions', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Animation : Tractions' })).toBeInTheDocument()
    const steps = screen.getByRole('heading', { name: 'Comment faire' }).closest('section')
    expect(within(steps!).getAllByRole('listitem').length).toBeGreaterThanOrEqual(2)

    await user.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }))
    await waitFor(async () => {
      expect((await db.exerciseMeta.get('pullup'))?.favorite).toBe(true)
    })
    expect(await screen.findByRole('button', { name: 'Retirer des favoris' })).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Ma note' }), 'Prise large')
    await user.tab()
    await waitFor(async () => {
      expect((await db.exerciseMeta.get('pullup'))?.note).toBe('Prise large')
    })
  })

  it('affiche les photos d’une fiche de la base générale', async () => {
    await renderApp('/library/Barbell_Squat')
    expect(await screen.findByRole('img', { name: /position de départ/ })).toBeInTheDocument()
    expect(screen.getByText(/Nom anglais/)).toBeInTheDocument()
  })

  it('signale un exercice introuvable', async () => {
    await renderApp('/library/inconnu')
    expect(await screen.findByText('Exercice introuvable')).toBeInTheDocument()
  })

  it('crée, modifie puis supprime un exercice personnel', async () => {
    const { user, router } = await renderApp('/library/new')
    await user.click(await screen.findByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Donne un nom')

    await user.type(screen.getByRole('textbox', { name: 'Nom' }), 'Pompes sur poings')
    await user.click(
      within(screen.getByRole('group', { name: 'Muscles principaux' })).getByRole('button', {
        name: 'Pectoraux',
      }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Comment faire' }),
      '1. Serre les poings{enter}2. Descends : lentement',
    )
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByRole('heading', { name: 'Pompes sur poings', level: 1 })).toBeInTheDocument()
    const saved = (await db.customExercises.toArray())[0]
    expect(saved).toMatchObject({
      name: 'Pompes sur poings',
      source: 'custom',
      primaryMuscles: ['chest'],
      instructions: ['Serre les poings', 'Descends\u00a0: lentement'],
    })

    await user.click(screen.getByRole('link', { name: 'Modifier' }))
    const name = await screen.findByRole('textbox', { name: 'Nom' })
    await user.clear(name)
    await user.type(name, 'Pompes poings fermés')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('heading', { name: 'Pompes poings fermés', level: 1 })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    const dialog = await screen.findByRole('dialog', { name: /Supprimer cet exercice/ })
    await user.click(within(dialog).getByRole('button', { name: 'Supprimer' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/library')
    })
    expect(await db.customExercises.count()).toBe(0)
  })

  it('crée sa version d’un exercice existant, avec son animation', async () => {
    const { user } = await renderApp('/library/new?from=pushup')
    const name = await screen.findByRole('textbox', { name: 'Nom' })
    expect(name).toHaveValue('Pompes (ma version)')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(await screen.findByRole('heading', { name: 'Pompes (ma version)', level: 1 })).toBeInTheDocument()
    const saved = (await db.customExercises.toArray())[0]
    expect(saved?.figure).toBe('pushup')
    expect(screen.getByRole('img', { name: 'Animation : Pompes (ma version)' })).toBeInTheDocument()
  })

  it('refuse de supprimer un exercice utilisé dans l’historique', async () => {
    const { user } = await renderApp('/library/new')
    await user.type(await screen.findByRole('textbox', { name: 'Nom' }), 'Mon gainage')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await screen.findByRole('heading', { name: 'Mon gainage', level: 1 })
    const exercise = (await db.customExercises.toArray())[0]!
    await db.workouts.put({
      id: 'w1',
      date: '2026-10-10',
      startedAt: '2026-10-10T10:00:00.000Z',
      endedAt: null,
      title: 'Séance',
      programId: null,
      programSessionId: null,
      plannedFor: null,
      eventId: null,
      exercises: [
        {
          id: 'we1',
          exerciseId: exercise.id,
          slotId: null,
          block: null,
          target: null,
          restSec: 60,
          sets: [],
          note: '',
        },
      ],
      rpe: null,
      notes: '',
      status: 'done',
      deload: false,
      progression: [],
    })
    await user.click(screen.getByRole('button', { name: 'Supprimer' }))
    expect(await screen.findByRole('dialog', { name: 'Exercice utilisé' })).toHaveTextContent(
      '1 séance de ton historique',
    )
    expect(await db.customExercises.count()).toBe(1)
  })
})
