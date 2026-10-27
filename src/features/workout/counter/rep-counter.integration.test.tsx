import { act, screen, waitFor, within } from '@testing-library/react'
import { runFixture } from '@/content/reps/evaluate'
import { repFixtureSchema, type RepFixture } from '@/content/reps/fixture'
import { addExercise, freeWorkout } from '@/content/workouts/workout'
import { db } from '@/db/db'
import { shareOrDownload } from '@/lib/files'
import { startWorkout } from '@/db/workouts'
import { sequentialIds } from '@/test/fixtures'
import {
  fakeMediaDevices,
  manualScheduler,
  stubCanvas2d,
  stubVideo,
  type FakeMediaDevices,
  type ManualScheduler,
} from '@/test/pose'
import { loadRepFixture } from '@/test/reps-fixtures'
import { renderApp } from '@/test/render-app'
import { skipRest } from '../rest-timer'
import type { FrameScheduler } from './frame-loop'

/*
 * Le compteur caméra d'un bout à l'autre dans jsdom : la vraie feuille, la vraie séance, le vrai compteur, la
 * vraie caméra du compteur (usePoseCamera, boucle d'images comprise) et le moteur qui rejoue un fichier de
 * points, comme les tests de bout en bout (window.__calitrackPoseReplay). Seules changent la cadence des images,
 * que le test fait passer une à une, et l'horloge des images, qui avance de 66 ms à chaque image.
 */

vi.mock('@/lib/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/files')>()),
  shareOrDownload: vi.fn(() => Promise.resolve('downloaded' as const)),
}))

const loop = vi.hoisted(() => ({ scheduler: null as FrameScheduler | null }))
vi.mock('./frame-loop', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./frame-loop')>()),
  videoFrameScheduler: {
    request(video: HTMLVideoElement, callback: () => void) {
      if (!loop.scheduler) throw new Error('cadence des images du test absente')
      return loop.scheduler.request(video, callback)
    },
  } satisfies FrameScheduler,
}))

/** Une image toutes les 66 ms : 15 images par seconde, la cadence maximale de l'analyse. */
const FRAME_MS = 66
/** Plus d'images que n'en demande une série rejouée (11 s, puis 6 s d'arrêt avant la fin de série). */
const MAX_FRAMES = 400

let clock = 0
let scheduler: ManualScheduler
let camera: FakeMediaDevices

beforeEach(() => {
  scheduler = manualScheduler()
  loop.scheduler = scheduler
  clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  camera = fakeMediaDevices()
  stubVideo()
  stubCanvas2d()
})

afterEach(() => {
  skipRest()
  camera.restore()
  loop.scheduler = null
  Reflect.deleteProperty(globalThis, '__calitrackPoseReplay')
})

/** Le moteur de l'appli rejouera ce fichier de points (de src/test/reps, ou fait à partir de l'un d'eux). */
function replay(fixture: string | RepFixture): void {
  ;(globalThis as { __calitrackPoseReplay?: unknown }).__calitrackPoseReplay =
    typeof fixture === 'string' ? loadRepFixture(fixture) : fixture
}

/** Le fichier de points deux fois de suite, la personne restant immobile `ms` entre les deux. */
function twice(fixture: RepFixture, ms: number): RepFixture {
  const end = fixture.frames.at(-1)?.[0] ?? 0
  const first = withStill(fixture, end, ms)
  const second = fixture.frames.map(([t, image, world]) => [t + end + ms, image, world] as const)
  return { ...first, frames: [...first.frames, ...second] }
}

/** Le même fichier de points, où la personne reste immobile pendant `ms` à partir de `at` (en ms). */
function withStill(fixture: RepFixture, at: number, ms: number): RepFixture {
  const before = fixture.frames.filter(([t]) => t <= at)
  const still = before.at(-1)
  if (!still) throw new Error('rien avant ce moment')
  const hold = Array.from(
    { length: Math.floor(ms / FRAME_MS) },
    (_, index) => [still[0] + (index + 1) * FRAME_MS, still[1], still[2]] as const,
  )
  const after = fixture.frames
    .filter(([t]) => t > at)
    .map(([t, image, world]) => [t + ms, image, world] as const)
  return { ...fixture, frames: [...before, ...hold, ...after] }
}

/** Séance libre en cours : 3 séries de l'exercice, 90 s de repos. */
async function openWorkout(exerciseId: string, name: string) {
  const newId = sequentialIds('i')
  const workout = addExercise(
    freeWorkout({ date: '2026-10-21', now: new Date().toISOString(), newId }),
    exerciseId,
    { restSec: 90, newId, sets: 3, block: 'strength' },
  )
  const app = await renderApp(`/workout/${workout.id}`, { setup: () => startWorkout(workout) })
  const card = await screen.findByRole('article', { name })
  return { ...app, card }
}

/** La première série de la séance, en base (lue dans waitFor : la séance à l'écran suit la base). */
async function firstSet() {
  const [workout] = await db.workouts.toArray()
  const set = workout?.exercises[0]?.sets[0]
  return { done: set?.done, reps: set?.reps }
}

/**
 * Fait passer les images, 66 ms chacune, tant que la série est en direct ; rend chaque compte affiché
 * (« 2 répétitions »).
 */
function playSet(sheet: HTMLElement, frames = MAX_FRAMES): string[] {
  const counts: string[] = []
  for (let frame = 0; frame < frames; frame++) {
    if (!sheet.querySelector('[aria-label="Consigne"]')) break
    clock += FRAME_MS
    act(() => {
      scheduler.step()
    })
    const count = sheet.querySelector('[aria-label="Répétitions comptées"]')?.textContent
    if (count) counts.push(count.replace(/\s+/g, ' '))
  }
  return counts
}

describe('compteur caméra, tout branché', () => {
  it('3 squats rejoués : comptés un à un, série enregistrée toute seule, repos lancé', async () => {
    replay('synth-squat-3')
    const name = 'Squat au poids du corps'
    const { user, card } = await openWorkout('squat', name)
    await user.click(within(card).getByRole('button', { name: `Compter à la caméra : ${name}` }))
    const sheet = await screen.findByRole('dialog', { name: `${name}, série 1` })
    // Squats validés : les conseils ne parlent pas d'essai ; la caméra attend le toucher.
    expect(within(sheet).queryByText(/en essai/)).not.toBeInTheDocument()
    expect(camera.getUserMedia).not.toHaveBeenCalled()

    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    await within(sheet).findByRole('status', { name: 'Consigne' })
    expect(camera.getUserMedia).toHaveBeenCalledTimes(1)
    const counts = playSet(sheet)
    expect([...new Set(counts)]).toEqual(['0 répétition', '1 répétition', '2 répétitions', '3 répétitions'])

    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: /^3\srépétitions$/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('timer', { name: 'Repos avant la série suivante' })).toBeInTheDocument()
    expect(within(sheet).getByText(/^Ensuite : série 2 sur 3\./)).toBeInTheDocument()
    await waitFor(async () => {
      expect(await firstSet()).toEqual({ done: true, reps: 3 })
    })
    // La caméra reste ouverte pendant le repos ; plus aucune image n'est analysée.
    expect(camera.stopped()).toBe(false)
    expect(scheduler.pending).toBe(0)

    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(camera.stopped()).toBe(true)
    expect(within(card).getByRole('button', { name: `${name}, série 1 faite` })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(card).getByRole('textbox', { name: `${name}, série 1 : répétitions` })).toHaveValue('3')
    expect(screen.getByRole('timer', { name: 'Repos restant' })).toBeInTheDocument()
  })

  it('le temps passé sur la question de fermeture ne compte pas : la série reprend où elle en était', async () => {
    // Arrêtée en haut après la 2e répétition, la personne lit la question 15 s, puis repart.
    replay(withStill(loadRepFixture('synth-squat-3'), 6000, 16_000))
    const name = 'Squat au poids du corps'
    const { user, card } = await openWorkout('squat', name)
    await user.click(within(card).getByRole('button', { name: `Compter à la caméra : ${name}` }))
    const sheet = await screen.findByRole('dialog', { name: `${name}, série 1` })
    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    await within(sheet).findByRole('status', { name: 'Consigne' })
    // Un peu plus de 6 s de série.
    expect(playSet(sheet, 92).at(-1)).toBe('2 répétitions')

    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    expect(within(sheet).getByText('Fermer sans enregistrer les 2 répétitions ?')).toBeInTheDocument()
    clock += 15_000
    await user.click(within(sheet).getByRole('button', { name: 'Continuer à compter' }))
    await within(sheet).findByRole('status', { name: 'Consigne' })

    // Ni arrêt, ni image trop saccadée : la 3e répétition compte, et la série s'enregistre toute seule.
    expect(playSet(sheet).at(-1)).toBe('3 répétitions')
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    expect(within(sheet).getByRole('heading', { name: /^3\srépétitions$/ })).toBeInTheDocument()
    await waitFor(async () => {
      expect(await firstSet()).toEqual({ done: true, reps: 3 })
    })
  })

  it('« Continuer la série » : les points exportés sont ceux de l’essai, qui se rejouent au bon compte', async () => {
    replay(twice(loadRepFixture('synth-squat-3'), 15_000))
    const name = 'Squat au poids du corps'
    const { user, card } = await openWorkout('squat', name)
    await user.click(within(card).getByRole('button', { name: `Compter à la caméra : ${name}` }))
    const sheet = await screen.findByRole('dialog', { name: `${name}, série 1` })
    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    await within(sheet).findByRole('status', { name: 'Consigne' })
    await user.click(within(sheet).getByRole('button', { name: 'Infos de réglage' }))
    expect(playSet(sheet).at(-1)).toBe('3 répétitions')
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()

    // Trois de plus : la série passe à 6.
    await user.click(within(sheet).getByRole('button', { name: 'Continuer la série' }))
    await within(sheet).findByRole('status', { name: 'Consigne' })
    expect(playSet(sheet).at(-1)).toBe('6 répétitions')
    expect(await within(sheet).findByRole('heading', { name: /^6\srépétitions$/ })).toBeInTheDocument()
    await waitFor(async () => {
      expect(await firstSet()).toEqual({ done: true, reps: 6 })
    })

    await user.click(within(sheet).getByRole('button', { name: 'Exporter les points de la série' }))
    const file = vi.mocked(shareOrDownload).mock.calls[0]![0]
    const exported = repFixtureSchema.parse(JSON.parse(await file.text()))
    // Les 3 répétitions de cet essai, que le compteur retrouve en rejouant le fichier depuis le début.
    expect(exported.expected).toEqual({ reps: 3 })
    expect(runFixture(exported)).toMatchObject({ reps: 3, confident: true })
  })

  it('3 tractions rejouées : en essai, rien d’enregistré avant « Enregistrer 3 répétitions »', async () => {
    replay('synth-pullup-3')
    const { user, card } = await openWorkout('pullup', 'Tractions')
    await user.click(within(card).getByRole('button', { name: 'Compter à la caméra : Tractions' }))
    const sheet = await screen.findByRole('dialog', { name: 'Tractions, série 1' })
    expect(within(sheet).getByText(/^Ce compteur est encore en essai pour cet exercice/)).toBeInTheDocument()

    await user.click(within(sheet).getByRole('button', { name: 'Ouvrir la caméra' }))
    await within(sheet).findByRole('status', { name: 'Consigne' })
    const counts = playSet(sheet)
    expect(counts.at(-1)).toBe('3 répétitions')

    expect(await within(sheet).findByRole('heading', { name: /^3\srépétitions\s\?$/ })).toBeInTheDocument()
    expect(within(sheet).getByText('ce compteur est encore en essai pour cet exercice.')).toBeInTheDocument()
    expect(await firstSet()).toEqual({ done: false, reps: null })

    await user.click(within(sheet).getByRole('button', { name: /^Enregistrer 3\srépétitions$/ }))
    expect(await within(sheet).findByText('Série enregistrée.')).toBeInTheDocument()
    await waitFor(async () => {
      expect(await firstSet()).toEqual({ done: true, reps: 3 })
    })
    await user.click(within(sheet).getByRole('button', { name: 'Fermer' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(camera.stopped()).toBe(true)
    expect(within(card).getByRole('textbox', { name: 'Tractions, série 1 : répétitions' })).toHaveValue('3')
  })
})
