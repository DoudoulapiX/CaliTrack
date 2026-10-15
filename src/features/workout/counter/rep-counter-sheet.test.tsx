import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { Mock } from 'vitest'
import { repFixtureSchema } from '@/content/reps/fixture'
import type { CounterResult, CounterSnapshot } from '@/content/reps/types'
import { addExercise, completeSet, freeWorkout } from '@/content/workouts/workout'
import { db } from '@/db/db'
import type { Workout } from '@/db/types'
import { startWorkout } from '@/db/workouts'
import { shareOrDownload } from '@/lib/files'
import { sequentialIds } from '@/test/fixtures'
import { emptyFrame, fakeCounter, fakePoseCamera, type FakeCounter, type FakePoseCamera } from '@/test/pose'
import { renderApp } from '@/test/render-app'
import { stubProperty } from '@/test/stub'
import { expectFrenchSpacing } from '@/test/typography'
import { cue } from '../cues'
import { skipRest } from '../rest-timer'
import type { PoseCameraOptions, PoseCameraState } from './usePoseCamera'

// La caméra et le compteur sont pilotés par le test ; l'écran, la séance et le repos sont les vrais.
const fakes = vi.hoisted(() => ({
  camera: null as FakePoseCamera | null,
  counter: null as FakeCounter | null,
}))

vi.mock('./usePoseCamera', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./usePoseCamera')>()
  function usePoseCamera(options: PoseCameraOptions) {
    if (!fakes.camera) throw new Error('caméra du test absente')
    return fakes.camera.usePoseCamera(options)
  }
  return { ...actual, usePoseCamera }
})

vi.mock('@/content/reps/rep-counter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/content/reps/rep-counter')>()
  return {
    ...actual,
    createRepCounter: (options: Parameters<typeof actual.createRepCounter>[0]) => {
      if (!fakes.counter) throw new Error('compteur du test absent')
      return fakes.counter.createRepCounter(options)
    },
  }
})

// Les horloges de l'écran ne tournent pas pendant les tests : pas de rendu hors de act().
vi.mock('../useNow', () => ({ useNow: () => Date.now() }))

vi.mock('../cues', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cues')>()),
  cue: vi.fn(),
}))

vi.mock('@/lib/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/files')>()),
  shareOrDownload: vi.fn(() => Promise.resolve('downloaded' as const)),
}))

let t = 0
let fetchSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  fakes.camera = fakePoseCamera()
  fakes.counter = fakeCounter()
  t = 1000
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  skipRest()
  vi.useRealTimers()
  Reflect.deleteProperty(navigator, 'wakeLock')
  // Rien ne part sur le réseau : tout reste sur le téléphone.
  expect(fetchSpy).not.toHaveBeenCalled()
})

function camera(): FakePoseCamera {
  if (!fakes.camera) throw new Error('caméra du test absente')
  return fakes.camera
}

function counter(): FakeCounter {
  if (!fakes.counter) throw new Error('compteur du test absent')
  return fakes.counter
}

/** Une image analysée, après avoir dit au compteur ce qu'il rendra. */
function frame(patch: Partial<CounterSnapshot> = {}): void {
  counter().emit(patch)
  t += 100
  camera().frame(emptyFrame(t), 120)
}

/** Le compteur finit la série de lui-même : on le voit à l'image suivante. */
function end(patch: Partial<CounterResult> = {}): void {
  counter().end(patch)
  t += 100
  camera().frame(emptyFrame(t), 120)
}

function setCamera(state: PoseCameraState): void {
  camera().setState(state)
}

/**
 * Séance libre : 3 séries de squats (8 à 12, la première faite, 90 s de repos ; compteur validé), puis une
 * série de pompes (compteur en essai).
 */
async function saveWorkout(): Promise<Workout> {
  const newId = sequentialIds('r')
  let workout = freeWorkout({ date: '2026-10-21', now: new Date().toISOString(), newId })
  workout = addExercise(workout, 'squat', {
    restSec: 90,
    newId,
    sets: 3,
    block: 'strength',
    target: { kind: 'reps', min: 8, max: 12 },
  })
  workout = addExercise(workout, 'pushup', { restSec: 60, newId, sets: 1, block: 'strength' })
  const [squats] = workout.exercises
  workout = completeSet(workout, squats!.id, squats!.sets[0]!.id, { reps: 8 }, new Date().toISOString())
  return startWorkout(workout)
}

const SQUAT = 'Squat au poids du corps'

async function squatSets() {
  const [workout] = (await db.workouts.toArray()).filter((w) => w.status === 'active')
  return workout?.exercises[0]?.sets.map((set) => ({ done: set.done, reps: set.reps })) ?? []
}

/** Ouvre la séance ; `guideSeen` : les conseils des squats sont déjà vus. */
async function openWorkout({ guideSeen = true } = {}) {
  if (guideSeen) localStorage.setItem('calitrack.counter', JSON.stringify({ guides: ['squat'] }))
  let id = ''
  const app = await renderApp('/training', {
    setup: async () => {
      id = (await saveWorkout()).id
    },
  })
  await app.router.navigate(`/workout/${id}`)
  await screen.findByRole('article', { name: SQUAT })
  return app
}

/** Ouvre la séance puis le compteur des squats. */
async function openCounter({ guideSeen = true } = {}) {
  const app = await openWorkout({ guideSeen })
  const card = screen.getByRole('article', { name: SQUAT })
  await app.user.click(within(card).getByRole('button', { name: `Compter à la caméra : ${SQUAT}` }))
  const sheet = await screen.findByRole('dialog', { name: `${SQUAT}, série 2` })
  return { ...app, sheet }
}

/** Ouvre le compteur, caméra prête : direct. */
async function openLive() {
  const app = await openCounter()
  setCamera({ kind: 'running' })
  await within(app.sheet).findByRole('status', { name: 'Consigne' })
  return app
}

const consigne = (sheet: HTMLElement) => within(sheet).getByRole('status', { name: 'Consigne' })

/** Échap sur la feuille : rend l'évènement (empêché ou non). */
function cancel(sheet: HTMLElement): Event {
  const event = new Event('cancel', { cancelable: true })
  fireEvent(sheet, event)
  return event
}

/**
 * Le prochain enregistrement de la séance attend `release()` ; il échoue alors avec `fail`, sinon il se fait.
 */
function holdSave({ fail = false } = {}): { release: () => Promise<void> } {
  let open: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  const real = db.transaction.bind(db) as unknown as (...args: unknown[]) => Promise<unknown>
  const transaction = vi.spyOn(db, 'transaction') as unknown as Mock<(...args: unknown[]) => Promise<unknown>>
  transaction.mockImplementationOnce(async (...args) => {
    await gate
    if (fail) throw new Error('disque plein')
    return real(...args)
  })
  return {
    release: async () => {
      open()
      await gate
    },
  }
}

describe('compteur caméra : conseils et direct', () => {
  it('montre les conseils la première fois, et n’ouvre la caméra qu’au toucher', async () => {
    const { user, sheet } = await openCounter({ guideSeen: false })
    expect(within(sheet).getByText('Compteur caméra · Objectif : 8 à 12')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: 'Place ton téléphone' })).toBeInTheDocument()
    // Que du texte : la section prend le focus, pour défiler au clavier.
    const guide = within(sheet).getByRole('region', { name: 'Place ton téléphone' })
    expect(guide).toHaveAttribute('tabindex', '0')
    guide.focus()
    expect(guide).toHaveFocus()
    expect(
      within(sheet).getByText(/^Pose le téléphone debout, à hauteur de hanches, à 2 ou 3 mètres/),
    ).toBeInTheDocument()
    // Squats validés : pas de mention « en essai ».
    expect(within(sheet).queryByText(/en essai/)).not.toBeInTheDocument()
    expect(within(sheet).getByText('En mode silencieux, l’iPhone peut couper les bips.')).toBeInTheDocument()
    // Annonces vocales coupées (réglage par défaut), écran qui peut s'éteindre (pas de verrou dans jsdom).
    expect(within(sheet).getByText(/^Pour entendre le compte, active Annonces vocales/)).toBeInTheDocument()
    expect(within(sheet).getByText(/^L’écran risque de s’éteindre pendant la série/)).toBeInTheDocument()
    expect(
      within(sheet).getByText('L’image reste sur ton iPhone : rien n’est envoyé ni enregistré.'),
    ).toBeVisible()
    expectFrenchSpacing()
    // Le moteur se prépare, la caméra attend le toucher.
    expect(camera().options).toMatchObject({ open: true, cameraOn: false, analysing: false, facing: 'user' })
    expect(counter().createRepCounter).not.toHaveBeenCalled()

    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    expect(camera().options).toMatchObject({ cameraOn: true, analysing: false })
    expect(within(sheet).getByRole('status')).toHaveTextContent('Préparation du compteur…')
    expectFrenchSpacing()
    setCamera({ kind: 'loading', step: 'camera' })
    expect(within(sheet).getByRole('status')).toHaveTextContent('Ouverture de la caméra…')
    expect(within(sheet).getByLabelText('Image de la caméra')).toBeInTheDocument()
    setCamera({ kind: 'running' })
    expect(consigne(sheet)).toHaveTextContent('Tiens-toi debout, face au téléphone.')
    expect(camera().options).toMatchObject({ cameraOn: true, analysing: true })
    expect(JSON.parse(localStorage.getItem('calitrack.counter') ?? '{}')).toMatchObject({
      guides: ['squat'],
    })

    // « Conseils de placement » les remontre ; on revient au direct, caméra toujours ouverte.
    await user.click(within(sheet).getByRole('button', { name: 'Conseils de placement' }))
    expect(within(sheet).getByRole('heading', { name: 'Place ton téléphone' })).toBeInTheDocument()
    expect(camera().options).toMatchObject({ cameraOn: true, analysing: false })
    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    expect(consigne(sheet)).toBeInTheDocument()

    // Rien de compté : la croix ferme tout de suite ; à la prochaine ouverture, plus de conseils.
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: `Compter à la caméra : ${SQUAT}` }))
    const again = await screen.findByRole('dialog', { name: `${SQUAT}, série 2` })
    expect(within(again).queryByRole('heading', { name: 'Place ton téléphone' })).not.toBeInTheDocument()
    expect(camera().options).toMatchObject({ cameraOn: true })
    expect(await squatSets()).toEqual([
      { done: true, reps: 8 },
      { done: false, reps: null },
      { done: false, reps: null },
    ])
  })

  it('suit la série en direct : consignes, grand compte, mouvements pas comptés, objectif', async () => {
    const { sheet } = await openLive()
    const count = () => within(sheet).queryByRole('status', { name: 'Répétitions comptées' })

    frame({ hint: { kind: 'tooFar' } })
    expect(consigne(sheet)).toHaveTextContent('Tu es trop loin : rapproche-toi, 2 à 3 mètres suffisent.')
    expect(count()).not.toBeInTheDocument()
    frame({ hint: { kind: 'out', part: 'feet' } })
    expect(consigne(sheet)).toHaveTextContent('Tes pieds sortent de l’image : recule un peu.')

    frame({ hint: null, status: 'arming' })
    expect(consigne(sheet)).toHaveTextContent('Reste en position une seconde…')
    expect(count()).toHaveTextContent('0 répétition')
    expect(vi.mocked(cue)).not.toHaveBeenCalled()

    frame({ status: 'counting' })
    expect(consigne(sheet)).toHaveTextContent('Je compte. Arrête-toi quand tu as fini.')
    expect(vi.mocked(cue)).toHaveBeenLastCalledWith('go', { sound: true, voice: false }, 'C’est parti')
    expect(within(sheet).getByRole('button', { name: 'Changer de caméra' })).toBeEnabled()

    frame({ reps: 1 })
    expect(count()).toHaveTextContent('1 répétition')
    expect(vi.mocked(cue)).toHaveBeenLastCalledWith('tick', { sound: true, voice: false }, '1')
    // La caméra ne change plus une fois la série commencée.
    expect(within(sheet).getByRole('button', { name: 'Changer de caméra' })).toBeDisabled()

    frame({ reps: 3, event: { id: 1, kind: 'partial', t } })
    expect(count()).toHaveTextContent('3 répétitions')
    expect(within(sheet).getByText('Pas assez bas : pas comptée.')).toBeInTheDocument()
    frame({ event: { id: 2, kind: 'rejected', t, why: 'anchor' } })
    expect(within(sheet).getByText('Tes pieds ont bougé : pas comptée.')).toBeInTheDocument()
    // Une répétition comptée n'a pas de ligne ; la ligne s'efface après 2 s.
    frame({ reps: 4, event: { id: 3, kind: 'rep', t, reps: 4 } })
    expect(within(sheet).queryByText(/pas comptée/)).not.toBeInTheDocument()
    frame({ reps: 4, event: { id: 4, kind: 'partial', t } })
    expect(within(sheet).getByText('Pas assez bas : pas comptée.')).toBeInTheDocument()
    await waitFor(
      () => {
        expect(within(sheet).queryByText(/pas comptée/)).not.toBeInTheDocument()
      },
      { timeout: 3000 },
    )

    frame({ reps: 8 })
    expect(consigne(sheet)).toHaveTextContent('Objectif atteint, continue si tu peux.')
    expect(vi.mocked(cue)).toHaveBeenLastCalledWith(
      'go',
      { sound: true, voice: false },
      '8, objectif atteint',
    )
    frame({ slow: true })
    expect(consigne(sheet)).toHaveTextContent('Le téléphone peine à suivre : le compte sera à vérifier.')
    // Pas de verrou d'écran dans jsdom : le conseil s'affiche sous la consigne.
    expect(within(sheet).getByText(/^L’écran risque de s’éteindre pendant la série/)).toBeInTheDocument()
    expectFrenchSpacing()
    expect(counter().created).toEqual([{ variant: { movement: 'squat', overrides: {} }, offset: 0 }])
    expect(counter().pushed).toHaveLength(11)
  })

  it('ne compte pas le temps passé sur les conseils ou la question de fermeture, sauf dans le repos', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    let now = 50_000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 2 })

    // 20 s sur les conseils de placement, puis 9 s sur la question : le compteur n'en voit rien.
    await user.click(within(sheet).getByRole('button', { name: 'Conseils de placement' }))
    now += 20_000
    t += 20_000
    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    frame()
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    now += 9000
    t += 9000
    await user.click(within(sheet).getByRole('button', { name: 'Continuer à compter' }))
    frame()
    expect(counter().pushed.map(({ frame: pushed }) => pushed.t)).toEqual([1100, 1200, 1300])

    const finish = vi.spyOn(counter().counter, 'finish')
    counter().onFinish({ repTimes: [900, 1100] })
    await user.click(within(sheet).getByRole('button', { name: 'Terminer la série' }))
    expect(finish).toHaveBeenCalledWith(1301, 'manual')
    // Le repos part de la dernière répétition : les 29 s de pause depuis en font partie.
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(within(sheet).getByRole('timer', { name: 'Repos avant la série suivante' })).toHaveTextContent(
      '1:01',
    )
  })

  it('ne parle pas de l’écran qui s’éteint quand le téléphone le garde allumé', async () => {
    const lock = Object.assign(new EventTarget(), { released: false, release: () => Promise.resolve() })
    stubProperty(navigator, 'wakeLock', { request: vi.fn(() => Promise.resolve(lock)) })
    const { sheet } = await openLive()
    await waitFor(() => {
      expect(within(sheet).queryByText(/^L’écran risque de s’éteindre/)).not.toBeInTheDocument()
    })
  })
})

describe('compteur caméra : fin de série', () => {
  it('enregistre une série sûre, lance le repos raccourci, puis repart pour la série suivante', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 21, 11, 0))
    const { sheet } = await openLive()
    frame({ status: 'counting', reps: 10 })
    // Dernière répétition 6 s avant la dernière image : 84 s de repos sur 90.
    end({ reps: 10, repTimes: [t - 9000, t - 6100] })

    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: /^10\srépétitions$/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('timer', { name: 'Repos avant la série suivante' })).toHaveTextContent(
      '1:24',
    )
    expect(
      within(sheet).getByText('Ensuite : série 3 sur 3. Le compteur repart à la fin du repos.'),
    ).toBeInTheDocument()
    expect(vi.mocked(cue)).toHaveBeenCalledWith(
      'go',
      { sound: true, voice: false },
      '10 répétitions enregistrées',
    )
    expect(await squatSets()).toEqual([
      { done: true, reps: 8 },
      { done: true, reps: 10 },
      { done: false, reps: null },
    ])
    // La caméra reste ouverte pendant le repos, sans rien analyser.
    expect(camera().options).toMatchObject({ cameraOn: true, analysing: false })
    expectFrenchSpacing()

    // Fin du repos : direct pour la série 3, compteur neuf.
    act(() => {
      skipRest()
    })
    const next = await screen.findByRole('dialog', { name: `${SQUAT}, série 3` })
    expect(consigne(next)).toHaveTextContent('Tiens-toi debout, face au téléphone.')
    frame({ status: 'counting', reps: 9 })
    expect(counter().created.map((options) => options.offset)).toEqual([0, 0])

    // Dernière série des squats : rien après dans cet exercice.
    end({ reps: 9, repTimes: [t - 200] })
    expect(await within(next).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(within(next).getByText('C’était la dernière série de cet exercice.')).toBeInTheDocument()
    expect(within(next).queryByRole('button', { name: 'Série suivante' })).not.toBeInTheDocument()
    expect(await squatSets()).toEqual([
      { done: true, reps: 8 },
      { done: true, reps: 10 },
      { done: true, reps: 9 },
    ])
  })

  it('passe à la série suivante sans attendre la fin du repos', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 11 })
    await user.click(within(sheet).getByRole('button', { name: 'Terminer la série' }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Série suivante' }))
    const next = await screen.findByRole('dialog', { name: `${SQUAT}, série 3` })
    expect(consigne(next)).toBeInTheDocument()
    expect(screen.queryByRole('timer', { name: 'Repos restant' })).not.toBeInTheDocument()
    expect(await squatSets()).toMatchObject([{ reps: 8 }, { done: true, reps: 11 }, { done: false }])
  })

  it('enregistrement raté : la série se réenregistre, la correction le dit', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 10 })
    vi.spyOn(db.workouts, 'put').mockRejectedValueOnce(new Error('disque plein'))
    end({ reps: 10 })
    expect(await within(sheet).findByText('La série n’a pas pu être enregistrée.')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Corriger' })).not.toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: false, reps: null })
    expectFrenchSpacing()

    await user.click(within(sheet).getByRole('button', { name: 'Réessayer' }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: true, reps: 10 })

    await user.click(within(sheet).getByRole('button', { name: 'Corriger' }))
    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : moins' }))
    vi.spyOn(db.workouts, 'put').mockRejectedValueOnce(new Error('disque plein'))
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer la correction' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      'La correction n’a pas pu être enregistrée.',
    )
    expect((await squatSets())[1]).toEqual({ done: true, reps: 10 })
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer la correction' }))
    expect(await within(sheet).findByText('Correction enregistrée.')).toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: true, reps: 9 })
  })

  it('corrige le nombre enregistré : la série reste faite', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 10 })
    end({ reps: 10 })
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Corriger' }))
    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : plus' }))
    expect(within(sheet).getByRole('group', { name: 'Répétitions' })).toHaveTextContent('11')
    // « Annuler » garde le nombre enregistré.
    await user.click(within(sheet).getByRole('button', { name: 'Annuler' }))
    expect(within(sheet).queryByRole('group', { name: 'Répétitions' })).not.toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Corriger' }))
    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : plus' }))
    await user.click(within(sheet).getByRole('button', { name: 'Enregistrer la correction' }))
    expect(await within(sheet).findByText('Correction enregistrée.')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: /^11\srépétitions$/ })).toBeInTheDocument()
    expect(await squatSets()).toMatchObject([{ reps: 8 }, { done: true, reps: 11 }, { done: false }])
    expectFrenchSpacing()
  })

  it('compte douteux : rien n’est enregistré avant la vérification', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 7 })
    end({ reps: 7, doubtful: 2, confident: false, reasons: ['lost', 'doubtful'] })

    expect(await within(sheet).findByRole('heading', { name: /^7\srépétitions\s\?$/ })).toBeInTheDocument()
    expect(within(sheet).getByText('Vérifie le nombre avant de l’enregistrer :')).toBeInTheDocument()
    const reasons = within(sheet)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(reasons).toEqual([
      'je t’ai perdu de vue pendant une partie de la série\u00a0;',
      '2\u00a0mouvements après une pause n’ont pas été comptés.',
    ])
    expect(vi.mocked(cue)).toHaveBeenLastCalledWith(
      'tick',
      { sound: true, voice: false },
      'Compte à vérifier',
    )
    expectFrenchSpacing()
    expect((await squatSets())[1]).toEqual({ done: false, reps: null })

    await user.click(within(sheet).getByRole('button', { name: /^Ajouter les 2\smouvements$/ }))
    expect(within(sheet).getByRole('group', { name: 'Répétitions' })).toHaveTextContent('9')
    expect(within(sheet).queryByRole('button', { name: /^Ajouter/ })).not.toBeInTheDocument()
    // Il ne revient pas après la question de fermeture : les 2 mouvements ne s'ajoutent qu'une fois.
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await user.click(within(sheet).getByRole('button', { name: 'Revenir à la vérification' }))
    expect(within(sheet).getByRole('group', { name: 'Répétitions' })).toHaveTextContent('9')
    expect(within(sheet).queryByRole('button', { name: /^Ajouter/ })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: /^Enregistrer 9\srépétitions$/ }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(await squatSets()).toMatchObject([{ reps: 8 }, { done: true, reps: 9 }, { done: false }])
    // Vérifié à la main : pas d'annonce « enregistrées ».
    expect(vi.mocked(cue)).not.toHaveBeenCalledWith('go', expect.anything(), '9 répétitions enregistrées')
  })

  it('mouvement en essai : chaque compte se vérifie, même sûr, et peut se refaire', async () => {
    const { user } = await openWorkout()
    const pushups = screen.getByRole('article', { name: 'Pompes' })
    await user.click(within(pushups).getByRole('button', { name: 'Compter à la caméra : Pompes' }))
    const sheet = await screen.findByRole('dialog', { name: 'Pompes, série 1' })
    // Les conseils (première fois pour les pompes) préviennent que le compteur est en essai.
    expect(
      within(sheet).getByText(
        'Ce compteur est encore en essai pour cet exercice : tu vérifieras chaque compte avant de l’enregistrer.',
      ),
    ).toBeInTheDocument()
    expectFrenchSpacing()
    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    setCamera({ kind: 'running' })
    expect(consigne(sheet)).toHaveTextContent('Mets-toi en planche, bras tendus.')

    frame({ status: 'counting', reps: 1 })
    end({ reps: 1, confident: false, reasons: ['fewReps', 'trial'] })
    expect(await within(sheet).findByRole('heading', { name: /^1\srépétition\s\?$/ })).toBeInTheDocument()
    expect(within(sheet).getByText('ce compteur est encore en essai pour cet exercice.')).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : moins' }))
    const save = within(sheet).getByRole('button', { name: 'Enregistrer' })
    expect(save).toBeDisabled()

    // « Ne pas enregistrer » : la série se recompte avec un compteur neuf.
    await user.click(within(sheet).getByRole('button', { name: 'Ne pas enregistrer' }))
    expect(consigne(sheet)).toBeInTheDocument()
    frame({ status: 'counting', reps: 10 })
    // Même un compte sûr attend la vérification : les pompes ne sont pas validées (specs.ts).
    end({ reps: 10, confident: true, reasons: [] })
    expect(await within(sheet).findByRole('heading', { name: /^10\srépétitions\s\?$/ })).toBeInTheDocument()
    expect(counter().created).toHaveLength(2)
    expect((await db.workouts.toArray())[0]?.exercises[1]?.sets[0]).toMatchObject({ done: false })
    await user.click(within(sheet).getByRole('button', { name: /^Enregistrer 10\srépétitions$/ }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect((await db.workouts.toArray())[0]?.exercises[1]?.sets[0]).toMatchObject({ done: true, reps: 10 })
  })

  it('continue la série : le compteur repart du compte vérifié ou enregistré', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 7 })
    end({ reps: 7, confident: false, reasons: ['lost'] })
    await within(sheet).findByRole('heading', { name: /^7\srépétitions\s\?$/ })

    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    expect(consigne(sheet)).toBeInTheDocument()
    frame({ status: 'counting', reps: 9 })
    expect(counter().created.at(-1)?.offset).toBe(7)
    expect(within(sheet).getByRole('status', { name: 'Répétitions comptées' })).toHaveTextContent('9')
    end({ reps: 9 })
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: true, reps: 9 })

    // Après l'enregistrement : la série reprend à 9 ; le repos s'arrête à la première répétition de plus, et la
    // série s'enregistre à nouveau.
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    frame({ status: 'counting' })
    expect(counter().created.at(-1)?.offset).toBe(9)
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toBeInTheDocument()
    frame({ reps: 10 })
    expect(screen.queryByRole('timer', { name: 'Repos restant' })).not.toBeInTheDocument()
    frame({ reps: 12 })
    end({ reps: 12 })
    await waitFor(async () => {
      expect((await squatSets())[1]).toEqual({ done: true, reps: 12 })
    })
    expect(within(sheet).getByRole('heading', { name: /^12\srépétitions$/ })).toBeInTheDocument()
  })
})

describe('compteur caméra : « Continuer la série » sans rien de plus', () => {
  it('le compte vérifié revient, puis s’enregistre', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 7 })
    end({ reps: 7, confident: false, reasons: ['lost'] })
    await within(sheet).findByRole('heading', { name: /^7\srépétitions\s\?$/ })
    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : plus' }))

    // « Terminer la série » tout de suite : le compte vérifié revient tel quel (7 comptées, réglé à 8).
    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    frame({ status: 'counting' })
    expect(within(sheet).getByRole('status', { name: 'Répétitions comptées' })).toHaveTextContent('8')
    await user.click(within(sheet).getByRole('button', { name: 'Terminer la série' }))
    expect(await within(sheet).findByRole('heading', { name: /^7\srépétitions\s\?$/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'Répétitions' })).toHaveTextContent('8')

    // Caméra coupée (appli en arrière-plan) avant toute répétition de plus : pareil.
    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    frame({ status: 'counting' })
    camera().hide()
    expect(await within(sheet).findByRole('heading', { name: /^7\srépétitions\s\?$/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('group', { name: 'Répétitions' })).toHaveTextContent('8')
    expect((await squatSets())[1]).toEqual({ done: false, reps: null })

    await user.click(within(sheet).getByRole('button', { name: /^Enregistrer 8\srépétitions$/ }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: true, reps: 8 })
  })

  it('un problème de caméra ne fait pas perdre le compte vérifié', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 7 })
    end({ reps: 7, confident: false, reasons: ['lost'] })
    await within(sheet).findByRole('heading', { name: /^7\srépétitions\s\?$/ })
    // La caméra s'arrête pendant la vérification : le problème se voit au retour en direct.
    setCamera({ kind: 'problem', problem: 'crashed' })
    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Le compteur s’est arrêté. Réessaie.')

    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(within(sheet).getByText('Fermer sans enregistrer les 7 répétitions ?')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Ne pas fermer' }))
    await user.click(within(sheet).getByRole('button', { name: 'Réessayer' }))
    setCamera({ kind: 'running' })
    frame({ status: 'counting' })
    await user.click(within(sheet).getByRole('button', { name: 'Terminer la série' }))
    expect(await within(sheet).findByRole('heading', { name: /^7\srépétitions\s\?$/ })).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: /^Enregistrer 7\srépétitions$/ }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: true, reps: 7 })
  })

  it('la série enregistrée revient avec son repos, qui enchaîne sur la série suivante', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 10 })
    end({ reps: 10 })
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    frame({ status: 'counting' })
    await user.click(within(sheet).getByRole('button', { name: 'Terminer la série' }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: /^10\srépétitions$/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('timer', { name: 'Repos avant la série suivante' })).toBeInTheDocument()
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toBeInTheDocument()
    expect(await squatSets()).toMatchObject([{ reps: 8 }, { done: true, reps: 10 }, { done: false }])

    // Fin du repos : le compteur repart pour la série 3.
    act(() => {
      skipRest()
    })
    expect(await screen.findByRole('dialog', { name: `${SQUAT}, série 3` })).toBeInTheDocument()
  })
})

describe('compteur caméra : fermeture et problèmes', () => {
  it('demande avant de fermer quand des répétitions ne sont pas enregistrées', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 3 })
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(within(sheet).getByText('Fermer sans enregistrer les 3 répétitions ?')).toBeInTheDocument()
    expectFrenchSpacing()
    await user.click(within(sheet).getByRole('button', { name: 'Continuer à compter' }))
    expect(consigne(sheet)).toBeInTheDocument()

    // Compte à vérifier : la question revient à la vérification (elle le dit), nombre réglé gardé.
    end({ reps: 3, confident: false, reasons: ['lost'] })
    await within(sheet).findByRole('heading', { name: /^3\srépétitions\s\?$/ })
    await user.click(within(sheet).getByRole('button', { name: 'Répétitions : plus' }))
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(within(sheet).getByText('Fermer sans enregistrer les 4 répétitions ?')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'Continuer à compter' })).not.toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Revenir à la vérification' }))
    expect(within(sheet).getByRole('group', { name: 'Répétitions' })).toHaveTextContent('4')

    // Un deuxième toucher sur la croix, ou Échap, ne répond pas à la question à la place de la personne.
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(cancel(sheet).defaultPrevented).toBe(true)
    expect(within(sheet).getByText('Fermer sans enregistrer les 4 répétitions ?')).toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: false, reps: null })

    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await user.click(within(sheet).getByRole('button', { name: 'Fermer sans enregistrer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect((await squatSets())[1]).toEqual({ done: false, reps: null })
  })

  it('fermée pendant l’enregistrement, attend qu’il réussisse ; s’il échoue, demande avant de fermer', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 10 })
    const failing = holdSave({ fail: true })
    end({ reps: 10 })
    expect(await within(sheet).findByText('Enregistrement…')).toBeInTheDocument()
    // Ni question, ni fermeture tant que l'enregistrement n'a pas abouti.
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(within(sheet).getByText('Enregistrement…')).toBeInTheDocument()
    await act(failing.release)
    expect(await within(sheet).findByText('La série n’a pas pu être enregistrée.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: `${SQUAT}, série 2` })).toBe(sheet)

    // Pas enregistrée : fermer demande d'abord.
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(within(sheet).getByText('Fermer sans enregistrer les 10 répétitions ?')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Ne pas fermer' }))
    expect(within(sheet).getByText('La série n’a pas pu être enregistrée.')).toBeInTheDocument()

    // Réessayer, puis fermer pendant l'enregistrement : la feuille se ferme quand il a réussi.
    const saving = holdSave()
    await user.click(within(sheet).getByRole('button', { name: 'Réessayer' }))
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(screen.getByRole('dialog', { name: `${SQUAT}, série 2` })).toBeInTheDocument()
    await act(saving.release)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect((await squatSets())[1]).toEqual({ done: true, reps: 10 })
  })

  it('après « Continuer la série », ne parle que des répétitions de plus', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 10 })
    end({ reps: 10 })
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    frame({ status: 'counting', reps: 12 })

    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(within(sheet).getByText('Fermer sans enregistrer les 2 répétitions de plus ?')).toBeInTheDocument()
    expectFrenchSpacing()
    await user.click(within(sheet).getByRole('button', { name: 'Fermer sans enregistrer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect((await squatSets())[1]).toEqual({ done: true, reps: 10 })
  })

  it('ferme tout de suite une série enregistrée', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 10 })
    end({ reps: 10 })
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('dit ce qui ne va pas avec la caméra, et réessaie', async () => {
    const { user, sheet } = await openCounter()
    setCamera({ kind: 'problem', problem: 'denied' })
    expect(within(sheet).getByRole('alert')).toHaveTextContent(
      'CaliTrack n’a pas accès à la caméra. Autorise-la dans Réglages › Safari › Appareil photo, puis réessaie.',
    )
    expectFrenchSpacing()
    await user.click(within(sheet).getByRole('button', { name: 'Réessayer' }))
    expect(camera().retries).toBe(1)
    expect(within(sheet).getByRole('status')).toHaveTextContent('Préparation du compteur…')
    setCamera({ kind: 'running' })
    expect(consigne(sheet)).toBeInTheDocument()

    // Pas de caméra : réessayer n'y changerait rien.
    setCamera({ kind: 'problem', problem: 'unavailable' })
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Pas de caméra disponible sur cet appareil.')
    expect(within(sheet).queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
  })

  it('rien compté : réessaie avec un compteur neuf', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'arming' })
    end({ reps: 0 })
    expect(
      await within(sheet).findByRole('heading', { name: 'Aucune répétition comptée' }),
    ).toBeInTheDocument()
    expect(
      within(sheet).getByText('Vérifie la place du téléphone et la lumière, puis réessaie.'),
    ).toBeInTheDocument()
    expectFrenchSpacing()
    await user.click(within(sheet).getByRole('button', { name: 'Réessayer' }))
    expect(consigne(sheet)).toBeInTheDocument()
    frame()
    expect(counter().created).toHaveLength(2)
    expect((await squatSets())[1]).toEqual({ done: false, reps: null })
  })

  it('caméra coupée en pleine série : le compte passe à vérifier', async () => {
    const { sheet } = await openLive()
    frame({ status: 'counting', reps: 4 })
    camera().hide()
    expect(await within(sheet).findByRole('heading', { name: /^4\srépétitions\s\?$/ })).toBeInTheDocument()
    expect(within(sheet).getByText('la caméra s’est coupée pendant la série.')).toBeInTheDocument()
    expect((await squatSets())[1]).toEqual({ done: false, reps: null })
  })

  it('caméra figée : le compteur voit le temps passer et finit la série', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'counting', reps: 3 })
    const tick = vi.spyOn(counter().counter, 'tick')
    counter().end({ reps: 3 })
    expect(await within(sheet).findByText('Série enregistrée.', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(tick.mock.calls[0]?.[0]).toBeGreaterThan(t)
    expect((await squatSets())[1]).toEqual({ done: true, reps: 3 })

    // Un compteur neuf qui n'a encore vu aucune image attend la caméra.
    const ticks = tick.mock.calls.length
    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(tick).toHaveBeenCalledTimes(ticks)
    expect(consigne(sheet)).toBeInTheDocument()
  })

  it('caméra coupée avant la première répétition : on peut réessayer', async () => {
    const { user, sheet } = await openLive()
    frame({ status: 'arming' })
    camera().hide()
    expect(within(sheet).getByRole('alert')).toHaveTextContent(
      'La caméra s’est coupée quand l’appli est passée en arrière-plan.',
    )
    await user.click(within(sheet).getByRole('button', { name: 'Réessayer' }))
    expect(camera().retries).toBe(1)
  })
})

describe('compteur caméra : infos de réglage', () => {
  it('se gardent sur le téléphone, et exportent les points de la série', async () => {
    const { user, sheet } = await openLive()
    const debug = within(sheet).getByRole('button', { name: 'Infos de réglage' })
    expect(debug).toHaveAttribute('aria-pressed', 'false')
    expect(within(sheet).queryByRole('region', { name: 'Réglage du compteur' })).not.toBeInTheDocument()
    await user.click(debug)
    expect(debug).toHaveAttribute('aria-pressed', 'true')
    camera().setStats({ fps: 14, msP50: 46, light: 132, frames: 77, detected: 74, delegate: 'CPU' })
    frame({
      status: 'counting',
      reps: 2,
      debug: {
        signal: 152,
        flexed: 120,
        extended: 150,
        phase: 'top',
        side: 'left',
        visibility: 0.92,
        quality: 0.96,
        fps: 14,
        lastReject: 'fast',
      },
    })
    const panel = within(sheet).getByRole('region', { name: 'Réglage du compteur' })
    const lines = within(panel)
      .getAllByRole('listitem')
      .map((item) => item.textContent.replaceAll('\u00a0', ' '))
    expect(lines).toEqual([
      'Images analysées : 14 par seconde',
      'Analyse : 46 ms par image (médiane)',
      'Calcul : processeur',
      'Silhouette trouvée : 74 images sur 77',
      'Lumière : 132 sur 255',
      'Mesure : genou 152° (seuils 120° et 150°)',
      'Phase : en haut',
      'Côté suivi : gauche',
      'Visibilité : 0,92',
      'Dernier refus : trop rapide',
    ])
    expectFrenchSpacing()

    // La puce graphique vaut pour la prochaine ouverture.
    const gpu = within(panel).getByRole('switch', { name: 'Calcul sur la puce graphique (essai)' })
    await user.click(gpu)
    expect(gpu).toBeChecked()
    expect(camera().options?.delegate).toBe('CPU')
    expect(JSON.parse(localStorage.getItem('calitrack.counter') ?? '{}')).toMatchObject({
      debug: true,
      delegate: 'GPU',
    })
    expect(within(panel).queryByRole('button', { name: /^Exporter/ })).not.toBeInTheDocument()

    frame({ reps: 3 })
    await user.click(within(sheet).getByRole('button', { name: 'Terminer la série' }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    await user.click(within(sheet).getByRole('button', { name: 'Exporter les points de la série' }))
    expect(vi.mocked(shareOrDownload)).toHaveBeenCalledTimes(1)
    const file = vi.mocked(shareOrDownload).mock.calls[0]![0]
    expect(file.name).toMatch(/^calitrack-points-squat-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
    expect(file.type).toBe('application/json')
    const parsed = repFixtureSchema.safeParse(JSON.parse(await file.text()))
    expect(parsed.success).toBe(true)
    expect(parsed.data).toMatchObject({
      movement: 'squat',
      exerciseId: 'squat',
      kind: 'set',
      expected: { reps: 3 },
      split: 'check',
      estimator: 'mediapipe-0.10.35-lite-cpu',
      fps: 10,
      width: 640,
      height: 480,
    })
    expect(parsed.data?.frames).toHaveLength(2)
    expect(parsed.data?.frames.every(([, image, world]) => image === 0 && world === 0)).toBe(true)

    // Rouvert : les infos sont toujours là, le calcul choisi s'applique.
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: `Compter à la caméra : ${SQUAT}` }))
    const again = await screen.findByRole('dialog', { name: `${SQUAT}, série 3` })
    expect(camera().options?.delegate).toBe('GPU')
    setCamera({ kind: 'running' })
    expect(within(again).getByRole('button', { name: 'Infos de réglage' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(again).getByRole('region', { name: 'Réglage du compteur' })).toBeInTheDocument()
  })
})
