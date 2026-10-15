import { act, screen, waitFor, within } from '@testing-library/react'
import { addSession, addSlot, emptyProgram, newSession, newSlot } from '@/content/programs/edit'
import { schemeFor } from '@/content/programs/schemes'
import { addExercise, completeSet, freeWorkout } from '@/content/workouts/workout'
import { db } from '@/db/db'
import { newEquipmentItem, saveEquipmentItem } from '@/db/equipment'
import { saveProgram } from '@/db/programs'
import type { Program, Workout } from '@/db/types'
import { startWorkout } from '@/db/workouts'
import { sequentialIds, testCatalog } from '@/test/fixtures'
import { renderApp } from '@/test/render-app'
import type { RepCounterSheetProps } from './counter/RepCounterSheet'
import { skipRest } from './rest-timer'

// Les horloges de l'écran (durée, repos) ne tournent pas pendant les tests : pas de rendu hors de act().
vi.mock('./useNow', () => ({ useNow: () => Date.now() }))

// La vraie feuille du compteur caméra, dont le test garde les props (pour cocher une série comme elle le fera).
const counterSheet = vi.hoisted(() => ({ props: null as RepCounterSheetProps | null }))
vi.mock('./counter/RepCounterSheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./counter/RepCounterSheet')>()
  const { createElement } = await import('react')
  return {
    ...actual,
    RepCounterSheet: (props: RepCounterSheetProps) => {
      counterSheet.props = props
      return createElement(actual.RepCounterSheet, props)
    },
  }
})

const PROGRAM_ID = 'w-1'
const SESSION_ID = 'w-2'
const SESSION_PATH = `/training/programs/${PROGRAM_ID}/sessions/${SESSION_ID}`

afterEach(() => {
  skipRest()
  counterSheet.props = null
})

/** Programme fait main : une figure (tractions poitrine à la barre), puis des pompes et des dips. */
async function saveCustomProgram(): Promise<Program> {
  const { byId } = await testCatalog()
  const get = (id: string) => {
    const exercise = byId.get(id)
    if (!exercise) throw new Error(id)
    return exercise
  }
  const newId = sequentialIds('w')
  const defaults = { scheme: schemeFor(['strength'], 'intermediate'), loadsOf: () => [], newId }
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
  const skill = newSlot(get('pullup-chest-to-bar'), 'skill', defaults, 'skill:muscleUp')
  program = addSlot(program, session.id, 'skill', skill, newId)
  program = addSlot(program, session.id, 'strength', newSlot(get('pushup'), 'strength', defaults), newId)
  program = addSlot(program, session.id, 'strength', newSlot(get('dip'), 'strength', defaults), newId)
  await saveEquipmentItem(newEquipmentItem('pullupBar'))
  await saveEquipmentItem(newEquipmentItem('dipBars'))
  return saveProgram(program)
}

/** Une séance libre déjà terminée : 10 pompes et 30 s de gainage, il y a quelques jours. */
async function savePastWorkout(): Promise<Workout> {
  const newId = sequentialIds('past')
  let workout = freeWorkout({ date: '2026-10-01', now: '2026-10-01T17:00:00.000Z', newId })
  workout = addExercise(workout, 'pushup', { restSec: 90, newId, sets: 1, block: 'strength' })
  workout = addExercise(workout, 'plank', { restSec: 60, newId, sets: 1, block: 'strength' })
  const [pushups, plank] = workout.exercises
  workout = completeSet(workout, pushups!.id, pushups!.sets[0]!.id, { reps: 10 }, '2026-10-01T17:10:00.000Z')
  workout = completeSet(
    workout,
    plank!.id,
    plank!.sets[0]!.id,
    { durationSec: 30 },
    '2026-10-01T17:20:00.000Z',
  )
  const done: Workout = { ...workout, status: 'done', endedAt: '2026-10-01T17:45:00.000Z', rpe: 6 }
  await db.workouts.put(done)
  return done
}

async function storedWorkouts(): Promise<Workout[]> {
  return db.workouts.toArray()
}

async function activeWorkout(): Promise<Workout> {
  const [workout] = (await storedWorkouts()).filter((w) => w.status === 'active')
  if (!workout) throw new Error('aucune séance en cours')
  return workout
}

describe('séance en direct', () => {
  it('fait une séance du programme : séries, repos, fin et progression', async () => {
    const { user, router } = await renderApp(SESSION_PATH, { setup: saveCustomProgram })
    await user.click(await screen.findByRole('button', { name: 'Commencer la séance' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/workout\//)
    })
    expect(await screen.findByRole('article', { name: 'Pompes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Haut du corps', level: 1 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navigation principale' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Figures',
      'Renforcement',
    ])

    // Première série de pompes : 9 répétitions tapées, puis cochée. Le repos commence.
    const pushups = await screen.findByRole('article', { name: 'Pompes' })
    const first = within(pushups).getByRole('textbox', { name: 'Pompes, série 1 : répétitions' })
    expect(first).toHaveAttribute('placeholder', '8')
    await user.type(first, '9')
    await user.click(within(pushups).getByRole('button', { name: 'Pompes, série 1 faite' }))
    await waitFor(() => {
      expect(within(pushups).getByRole('button', { name: 'Pompes, série 1 faite' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toHaveTextContent('2:00')
    expect(screen.getByText('Pompes · série 2 sur 3 · 9 rép.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+15 s' }))
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toHaveTextContent('2:15')
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    expect(screen.queryByRole('timer', { name: 'Repos restant' })).not.toBeInTheDocument()

    // Les séries suivantes reprennent la valeur de la précédente : un toucher suffit.
    expect(within(pushups).getByRole('textbox', { name: 'Pompes, série 2 : répétitions' })).toHaveAttribute(
      'placeholder',
      '9',
    )
    await user.click(within(pushups).getByRole('button', { name: 'Pompes, série 2 faite' }))
    await waitFor(() => {
      expect(within(pushups).getByRole('button', { name: 'Pompes, série 2 faite' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
    await user.click(within(pushups).getByRole('button', { name: 'Pompes, série 3 faite' }))
    expect(await screen.findByText('Dips aux barres parallèles · série 1 sur 3 · 8 rép.')).toBeInTheDocument()
    await waitFor(async () => {
      const done = (await activeWorkout()).exercises.find((e) => e.exerciseId === 'pushup')
      expect(done?.sets.map((set) => [set.done, set.reps])).toEqual([
        [true, 9],
        [true, 9],
        [true, 9],
      ])
    })

    // Une série cochée par erreur se décoche.
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    const dips = screen.getByRole('article', { name: 'Dips aux barres parallèles' })
    await user.click(within(dips).getByRole('button', { name: 'Dips aux barres parallèles, série 1 faite' }))
    await waitFor(() => {
      expect(
        within(dips).getByRole('button', { name: 'Dips aux barres parallèles, série 1 faite' }),
      ).toHaveAttribute('aria-pressed', 'true')
    })
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await user.click(within(dips).getByRole('button', { name: 'Dips aux barres parallèles, série 1 faite' }))
    await waitFor(() => {
      expect(
        within(dips).getByRole('button', { name: 'Dips aux barres parallèles, série 1 faite' }),
      ).toHaveAttribute('aria-pressed', 'false')
    })

    // Fin de séance : ressenti et notes, puis le bilan avec la progression des pompes.
    await user.click(screen.getByRole('button', { name: 'Terminer la séance' }))
    const sheet = await screen.findByRole('dialog', { name: 'Terminer la séance' })
    expect(within(sheet).getByText(/^6 séries pas cochées/)).toBeInTheDocument()
    await user.click(within(sheet).getByRole('radio', { name: 'Dur' }))
    await user.type(within(sheet).getByLabelText('Notes'), 'Bonne forme')
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer la séance' }))
    expect(await screen.findByText('Séance terminée')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'La prochaine fois' })).toBeInTheDocument()
    expect(screen.getByText('Dur')).toBeInTheDocument()
    expect(screen.getByText('Bonne forme')).toBeInTheDocument()

    const [finished] = await storedWorkouts()
    expect(finished).toMatchObject({ status: 'done', rpe: 8, notes: 'Bonne forme' })
    expect(finished?.progression).toHaveLength(1)
    expect(finished?.progression[0]).toMatchObject({ fromExerciseId: 'pushup' })
    const program = await db.programs.get(PROGRAM_ID)
    const slot = program?.sessions[0]?.blocks
      .flatMap((b) => b.slots)
      .find((s) => s.id === finished?.progression[0]?.slotId)
    expect(slot).toBeDefined()
    expect([slot?.exerciseId, slot?.target.max, slot?.loadKg]).not.toEqual(['pushup', 8, null])

    await user.click(screen.getByRole('button', { name: 'Terminé' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/training')
    })
  })

  it('séance libre : ajoute des exercices, une charge, le chrono, et bat des records', async () => {
    const { user, router } = await renderApp('/training', { setup: savePastWorkout })
    await user.click(await screen.findByRole('button', { name: /^Séance libre/ }))
    expect(await screen.findByRole('heading', { name: 'Séance libre', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Séance vide')).toBeInTheDocument()

    // Pompes : ajoutées depuis le répertoire.
    await user.click(screen.getByRole('button', { name: 'Ajouter un exercice' }))
    let picker = await screen.findByRole('dialog', { name: 'Ajouter un exercice' })
    await user.type(within(picker).getByRole('searchbox', { name: 'Rechercher un exercice' }), 'pompes')
    await user.click(await within(picker).findByRole('button', { name: /^PompesSans matériel/ }))
    const pushups = await screen.findByRole('article', { name: 'Pompes' })
    await user.type(within(pushups).getByRole('textbox', { name: 'Pompes, série 1 : répétitions' }), '12')
    await user.click(within(pushups).getByRole('button', { name: 'Pompes, série 1 faite' }))
    await user.click(await screen.findByRole('button', { name: 'Passer' }))

    // Une charge sur les séries suivantes : elle se reporte sur les séries pas encore faites.
    await user.click(within(pushups).getByRole('button', { name: 'Options : Pompes' }))
    const options = await screen.findByRole('dialog', { name: 'Pompes' })
    await user.click(within(options).getByRole('button', { name: /^Ajouter une charge/ }))
    await user.type(
      await within(pushups).findByRole('textbox', { name: 'Pompes, série 2 : charge en kg' }),
      '10',
    )
    await waitFor(async () => {
      const loads = (await activeWorkout()).exercises[0]?.sets.map((set) => set.loadKg)
      expect(loads).toEqual([null, 10, 10])
    })
    await waitFor(() => {
      expect(within(pushups).getByRole('textbox', { name: 'Pompes, série 3 : charge en kg' })).toHaveValue(
        '10',
      )
    })
    await user.click(within(pushups).getByRole('button', { name: 'Pompes, série 2 faite' }))
    await user.click(await screen.findByRole('button', { name: 'Passer' }))

    // Gainage : une série au chrono, une autre tapée.
    await user.click(screen.getByRole('button', { name: 'Ajouter un exercice' }))
    picker = await screen.findByRole('dialog', { name: 'Ajouter un exercice' })
    await user.type(within(picker).getByRole('searchbox', { name: 'Rechercher un exercice' }), 'avant-bras')
    await user.click(await within(picker).findByRole('button', { name: /^Gainage sur les avant-bras/ }))
    const plank = await screen.findByRole('article', { name: 'Gainage sur les avant-bras' })
    await user.click(
      within(plank).getByRole('button', { name: 'Gainage sur les avant-bras, série 1 : chrono' }),
    )
    const hold = await screen.findByRole('dialog', { name: 'Gainage sur les avant-bras, série 1' })
    expect(within(hold).getByText('Mets-toi en place')).toBeInTheDocument()
    await user.click(within(hold).getByRole('button', { name: 'Partir maintenant' }))
    expect(within(hold).getByText('Tiens bon')).toBeInTheDocument()
    await user.click(within(hold).getByRole('button', { name: 'Stop' }))
    await waitFor(() => {
      expect(
        within(plank).getByRole('button', { name: 'Gainage sur les avant-bras, série 1 faite' }),
      ).toHaveAttribute('aria-pressed', 'true')
    })
    await user.click(screen.getByRole('button', { name: 'Passer' }))
    await user.type(
      within(plank).getByRole('textbox', { name: 'Gainage sur les avant-bras, série 2 : secondes' }),
      '60',
    )
    await user.click(within(plank).getByRole('button', { name: 'Gainage sur les avant-bras, série 2 faite' }))
    await waitFor(async () => {
      const [, held] = (await activeWorkout()).exercises
      expect(held?.sets.map((set) => set.done)).toEqual([true, true, false])
      expect(held?.sets[1]?.durationSec).toBe(60)
      expect(held?.sets[0]?.durationSec).toBeGreaterThanOrEqual(1)
    })

    // Bilan : deux records battus par rapport à la séance d'avant.
    await user.click(await screen.findByRole('button', { name: 'Passer' }))
    await user.click(screen.getByRole('button', { name: 'Terminer la séance' }))
    const sheet = await screen.findByRole('dialog', { name: 'Terminer la séance' })
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer la séance' }))
    expect(await screen.findByText('Séance terminée')).toBeInTheDocument()
    const records = await screen.findByRole('heading', { name: 'Records battus' })
    const list = records.closest('section')
    if (!list) throw new Error('section manquante')
    expect(within(list).getByText(/Plus de répétitions.+12 rép\..+avant.+10 rép\./)).toBeInTheDocument()
    expect(within(list).getByText(/Maintien le plus long.+1 min.+avant.+30 s/)).toBeInTheDocument()

    // Historique, puis records.
    await user.click(screen.getByRole('button', { name: 'Terminé' }))
    await user.click(await screen.findByRole('link', { name: 'Historique' }))
    expect(await screen.findByRole('heading', { name: 'Historique', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Octobre 2026' })).toBeInTheDocument()
    const rows = screen.getAllByRole('link', { name: /^Séance libre/ })
    expect(rows).toHaveLength(2)
    await user.click(rows[1]!)
    expect(await screen.findByText(/^Jeudi 1 octobre · /)).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/training\/history\/past-/)
    expect(screen.getByRole('link', { name: /^Pompes10 rép\./ })).toBeInTheDocument()

    await router.navigate('/training/records')
    expect(await screen.findByRole('heading', { name: 'Records', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^Pompes12 rép\. · 10 kg × 12 · 2 séances/ })).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /^Gainage sur les avant-bras1 min · 2 séances/ }),
    ).toBeInTheDocument()

    // La fiche de l'exercice montre ses records et ses dernières séances.
    await user.click(screen.getByRole('link', { name: /^Pompes12 rép\./ }))
    expect(await screen.findByRole('heading', { name: 'Mes records' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dernières séances' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^12, 12 rép\. · chargé/ })).toBeInTheDocument()
  })

  it('reprend la séance en cours, ou l’abandonne pour en commencer une autre', async () => {
    const newId = sequentialIds('a')
    const { user, router } = await renderApp('/training', {
      setup: () =>
        startWorkout(
          freeWorkout({ date: '2026-10-10', now: new Date().toISOString(), newId, title: 'Bras' }),
        ),
    })
    // La barre au-dessus des onglets et la carte du jour ramènent à la séance.
    expect(
      await screen.findByRole('link', { name: 'Reprendre la séance en cours : Bras' }),
    ).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Reprendre la séance' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Séance libre/ }))
    const conflict = await screen.findByRole('dialog', { name: 'Une séance est déjà en cours' })
    expect(within(conflict).getByText(/« Bras » a commencé/)).toBeInTheDocument()
    await user.click(within(conflict).getByRole('button', { name: 'L’abandonner et commencer' }))
    expect(await screen.findByRole('heading', { name: 'Séance libre', level: 1 })).toBeInTheDocument()
    const workouts = await storedWorkouts()
    expect(workouts.map((w) => w.title)).toEqual(['Séance libre'])
    expect(router.state.location.pathname).toBe(`/workout/${workouts[0]?.id ?? ''}`)

    // Abandon : la séance disparaît, on revient à l'onglet.
    await user.click(screen.getByRole('button', { name: 'Abandonner la séance' }))
    const confirm = await screen.findByRole('dialog', { name: /^Abandonner la séance/ })
    await user.click(within(confirm).getByRole('button', { name: 'Abandonner' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/training')
    })
    expect(await screen.findByText('Séance abandonnée')).toBeInTheDocument()
    expect(await db.workouts.count()).toBe(0)
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /^Reprendre la séance/ })).not.toBeInTheDocument()
    })
  })

  it('termine sans série cochée : propose d’abandonner', async () => {
    const { user, router } = await renderApp('/training')
    await user.click(await screen.findByRole('button', { name: /^Séance libre/ }))
    await user.click(await screen.findByRole('button', { name: 'Terminer la séance' }))
    const sheet = await screen.findByRole('dialog', { name: 'Terminer la séance' })
    expect(within(sheet).getByText(/rien à enregistrer/)).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Abandonner la séance' }))
    const confirm = await screen.findByRole('dialog', { name: /^Abandonner la séance/ })
    await user.click(within(confirm).getByRole('button', { name: 'Abandonner' }))
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/training')
    })
    expect(await db.workouts.count()).toBe(0)
  })

  it('ouvre une séance en cours depuis l’historique, et signale une séance introuvable', async () => {
    const newId = sequentialIds('h')
    let id = ''
    const { router } = await renderApp('/training/history', {
      setup: async () => {
        id = (await startWorkout(freeWorkout({ date: '2026-10-10', now: new Date().toISOString(), newId })))
          .id
      },
    })
    expect(await screen.findByText('Pas encore de séance')).toBeInTheDocument()
    await router.navigate(`/training/history/${id}`)
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/workout/${id}`)
    })
    expect(await screen.findByRole('heading', { name: 'Séance libre', level: 1 })).toBeInTheDocument()

    await router.navigate('/workout/inconnue')
    expect(await screen.findByText('Séance introuvable')).toBeInTheDocument()
  })
})

/**
 * Séance libre en cours : pompes (3 séries, la première faite), gainage, pistol squat, tractions négatives,
 * et un squat déjà fini.
 */
async function saveCountingWorkout(): Promise<Workout> {
  const newId = sequentialIds('c')
  let workout = freeWorkout({ date: '2026-10-10', now: new Date().toISOString(), newId })
  for (const id of ['pushup', 'plank', 'pistol', 'pullup-negative', 'squat']) {
    workout = addExercise(workout, id, {
      restSec: 90,
      newId,
      sets: id === 'pushup' ? 3 : 1,
      block: 'strength',
    })
  }
  const [pushups, , , , squats] = workout.exercises
  const at = new Date().toISOString()
  workout = completeSet(workout, pushups!.id, pushups!.sets[0]!.id, { reps: 8 }, at)
  workout = completeSet(workout, squats!.id, squats!.sets[0]!.id, { reps: 15 }, at)
  return startWorkout(workout)
}

/** Ouvre la séance de saveCountingWorkout. */
async function openCountingWorkout() {
  let id = ''
  const app = await renderApp('/training', {
    setup: async () => {
      id = (await saveCountingWorkout()).id
    },
  })
  await app.router.navigate(`/workout/${id}`)
  expect(await screen.findByRole('article', { name: 'Pompes' })).toBeInTheDocument()
  return app
}

describe('compteur caméra', () => {
  it('se propose sur un exercice compté qui a une série à faire, et s’ouvre sur cette série', async () => {
    const { user } = await openCountingWorkout()
    const pushups = screen.getByRole('article', { name: 'Pompes' })
    const count = within(pushups).getByRole('button', { name: 'Compter à la caméra : Pompes' })
    expect(count).toHaveTextContent('Compter à la caméra')
    // Au chrono, pas compté, ou plus rien à faire : pas de bouton.
    for (const name of [
      'Gainage sur les avant-bras',
      'Pistol squat',
      'Tractions négatives',
      'Squat au poids du corps',
    ]) {
      const card = screen.getByRole('article', { name })
      expect(within(card).queryByRole('button', { name: /^Compter à la caméra/ })).not.toBeInTheDocument()
    }

    await user.click(count)
    const sheet = await screen.findByRole('dialog', { name: 'Pompes, série 2' })
    // La première fois pour les pompes : où poser le téléphone, la caméra n'est pas encore ouverte.
    expect(within(sheet).getByRole('heading', { name: 'Place ton téléphone' })).toBeInTheDocument()
    expect(counterSheet.props).toMatchObject({
      exerciseName: 'Pompes',
      variant: { movement: 'pushup', overrides: {} },
    })
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Pompes, série 2' })).not.toBeInTheDocument()
    })
    // Rien n'a été coché.
    expect((await activeWorkout()).exercises[0]?.sets.map((set) => set.done)).toEqual([true, false, false])
  })

  it('coche la série comptée : repos raccourci du temps déjà passé, série suivante rendue', async () => {
    const { user } = await openCountingWorkout()
    await user.click(screen.getByRole('button', { name: 'Compter à la caméra : Pompes' }))
    await screen.findByRole('dialog', { name: 'Pompes, série 2' })
    const props = counterSheet.props!
    const [, second, third] = props.exercise.sets

    // Dernière répétition il y a 30 s : il reste 1 min de repos sur 1 min 30.
    let next = await act(() => props.onComplete(second!, { reps: 11 }, Date.now() - 30_000))
    expect(next).toMatchObject({ index: 2, set: { id: third!.id }, exercise: { id: props.exercise.id } })
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toHaveTextContent('1:00')
    const saved = (await activeWorkout()).exercises[0]?.sets[1]
    expect(saved).toMatchObject({ done: true, reps: 11 })

    // Sans heure de fin : le repos entier ; puis la série d'un autre exercice.
    next = await act(() => props.onComplete(third!, { reps: 10 }))
    expect(next?.exercise.exerciseId).toBe('plank')
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toHaveTextContent('1:30')
  })

  it('ne lance pas de repos déjà écoulé, et rejette quand l’enregistrement échoue', async () => {
    const { user } = await openCountingWorkout()
    await user.click(screen.getByRole('button', { name: 'Compter à la caméra : Pompes' }))
    await screen.findByRole('dialog', { name: 'Pompes, série 2' })
    const props = counterSheet.props!
    const [, second, third] = props.exercise.sets

    await act(() => props.onComplete(second!, { reps: 9 }, Date.now() - 120_000))
    expect(screen.queryByRole('timer', { name: 'Repos restant' })).not.toBeInTheDocument()

    await db.workouts.clear()
    let failure: unknown = null
    await act(async () => {
      failure = await props.onComplete(third!, { reps: 9 }).catch((error: unknown) => error)
    })
    expect(failure).toEqual(new Error('Séance introuvable.'))
  })
})
