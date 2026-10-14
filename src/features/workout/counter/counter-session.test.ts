import type { FixtureFrame } from '@/content/reps/fixture'
import type { PendingSet } from '@/content/workouts/workout'
import type { WorkoutExercise, WorkoutSet } from '@/db/types'
import { counterResult, counterSnapshot } from '@/test/pose'
import {
  cueFor,
  displayChanged,
  expectedReps,
  firstPendingIndex,
  initialSession,
  lastRepAt,
  measuredFps,
  nextInExercise,
  sessionReducer,
  type SessionAction,
  type SessionState,
  type SessionView,
} from './counter-session'

const START = initialSession({ setId: 's1', setIndex: 0, guideSeen: false })

/** Joue les actions l'une après l'autre. */
function play(state: SessionState, ...actions: SessionAction[]): SessionState {
  return actions.reduce(sessionReducer, state)
}

const at = (view: SessionView, patch: Partial<SessionState> = {}): SessionState => ({
  ...START,
  ...patch,
  view,
})

const SURE = counterResult({ reps: 12, repTimes: [1000, 3000] })
const UNSURE = counterResult({ reps: 7, doubtful: 2, confident: false, reasons: ['doubtful'] })
const TRIAL = counterResult({ reps: 3, confident: false, reasons: ['trial'] })
const NEXT = { setId: 's2', index: 1, total: 3 }

describe('séance du compteur caméra', () => {
  it('commence par les conseils la première fois, sinon par la caméra', () => {
    expect(START).toEqual({
      view: { kind: 'guide' },
      setId: 's1',
      setIndex: 0,
      offset: 0,
      result: null,
      attempt: 1,
    })
    expect(initialSession({ setId: 's3', setIndex: 2, guideSeen: true }).view).toEqual({ kind: 'starting' })
  })

  it('ouvre la caméra, puis passe en direct quand elle tourne', () => {
    const live = play(START, { type: 'openCamera' }, { type: 'ready' })
    expect(live.view).toEqual({ kind: 'live' })
    expect(live.attempt).toBe(1)
    // Sans effet ailleurs.
    expect(play(live, { type: 'openCamera' }, { type: 'ready' })).toBe(live)
    expect(sessionReducer(START, { type: 'ready' })).toBe(START)
  })

  it('remontre les conseils pendant le direct, puis y revient avec le même compteur', () => {
    const live = at({ kind: 'live' }, { attempt: 4 })
    const guide = sessionReducer(live, { type: 'showGuide' })
    expect(guide.view).toEqual({ kind: 'guide' })
    const back = play(guide, { type: 'openCamera' }, { type: 'ready' })
    expect(back).toEqual({ ...live, view: { kind: 'live' } })
    expect(sessionReducer(at({ kind: 'empty' }), { type: 'showGuide' }).view).toEqual({ kind: 'empty' })
  })

  it('montre un problème de la caméra pendant la préparation ou le direct, et réessaie avec un compteur neuf', () => {
    const problem = sessionReducer(at({ kind: 'starting' }), { type: 'problem', problem: 'denied' })
    expect(problem.view).toEqual({ kind: 'problem', problem: 'denied' })
    expect(sessionReducer(at({ kind: 'live' }), { type: 'problem', problem: 'crashed' }).view).toEqual({
      kind: 'problem',
      problem: 'crashed',
    })
    // Pendant le repos ou la vérification, la caméra peut attendre : le problème se verra au retour en direct.
    for (const view of [
      { kind: 'review', result: UNSURE, reps: 7 },
      { kind: 'saving', reps: 3 },
      { kind: 'empty' },
      { kind: 'guide' },
    ] as const) {
      const state = at(view)
      expect(sessionReducer(state, { type: 'problem', problem: 'stopped' })).toBe(state)
    }
    const retried = sessionReducer({ ...problem, offset: 5 }, { type: 'retry' })
    expect(retried).toMatchObject({ view: { kind: 'starting' }, offset: 5, attempt: 2, result: null })
    expect(sessionReducer(at({ kind: 'live' }), { type: 'retry' }).view).toEqual({ kind: 'live' })
  })

  it('enregistre tout de suite un compte sûr d’un mouvement validé', () => {
    const saving = sessionReducer(at({ kind: 'live' }), { type: 'ended', result: SURE, validated: true })
    expect(saving).toMatchObject({ view: { kind: 'saving', reps: 12 }, result: SURE, attempt: 1 })
    const saved = sessionReducer(saving, { type: 'saved', next: NEXT })
    expect(saved).toMatchObject({
      offset: 12,
      view: { kind: 'saved', reps: 12, next: NEXT, error: false, correcting: false, corrected: false },
    })
  })

  it('fait vérifier un compte douteux, ou d’un mouvement en essai', () => {
    const review = sessionReducer(at({ kind: 'live' }), { type: 'ended', result: UNSURE, validated: true })
    expect(review.view).toEqual({ kind: 'review', result: UNSURE, reps: 7 })
    expect(
      sessionReducer(at({ kind: 'live' }), { type: 'ended', result: TRIAL, validated: false }).view,
    ).toMatchObject({ kind: 'review', reps: 3 })
    // Même sûr, un mouvement pas validé attend la vérification.
    expect(
      sessionReducer(at({ kind: 'live' }), { type: 'ended', result: SURE, validated: false }).view.kind,
    ).toBe('review')

    // Réglé, puis enregistré : jamais 0, jamais plus de 500.
    const adjusted = play(review, { type: 'adjust', reps: 9 })
    expect(adjusted.view).toMatchObject({ reps: 9 })
    expect(play(review, { type: 'adjust', reps: -3 }).view).toMatchObject({ reps: 0 })
    expect(play(review, { type: 'adjust', reps: 900 }).view).toMatchObject({ reps: 500 })
    const zero = play(review, { type: 'adjust', reps: 0 })
    expect(sessionReducer(zero, { type: 'save' })).toBe(zero)
    expect(play(adjusted, { type: 'save' }).view).toEqual({ kind: 'saving', reps: 9 })
    expect(play(adjusted, { type: 'save' }, { type: 'saved', next: null })).toMatchObject({
      offset: 9,
      view: { kind: 'saved', reps: 9, next: null },
    })
  })

  it('ne propose rien quand aucune nouvelle répétition n’a été comptée', () => {
    const empty = sessionReducer(at({ kind: 'live' }), {
      type: 'ended',
      result: counterResult({ reps: 0, endedBy: 'manual' }),
      validated: true,
    })
    expect(empty.view).toEqual({ kind: 'empty' })
    // « Continuer la série » sans rien de plus : rien à enregistrer non plus.
    const continued = at({ kind: 'live' }, { offset: 8 })
    expect(
      sessionReducer(continued, { type: 'ended', result: counterResult({ reps: 8 }), validated: true }).view,
    ).toEqual({ kind: 'empty' })
    const retried = sessionReducer({ ...empty, attempt: 3 }, { type: 'retry' })
    expect(retried).toMatchObject({ view: { kind: 'live' }, attempt: 4, result: null, offset: 0 })
  })

  it('arrête le compte quand la caméra se coupe pendant les conseils ou la question de fermeture', () => {
    const interrupted = counterResult({ reps: 4, confident: false, reasons: ['interrupted'] })
    for (const view of [{ kind: 'guide' }, { kind: 'confirmClose', reps: 4, back: 'live' }] as const) {
      expect(
        sessionReducer(at(view), { type: 'ended', result: interrupted, validated: true }).view,
      ).toMatchObject({ kind: 'review', reps: 4 })
    }
    const saved = at({ kind: 'saving', reps: 2 })
    expect(sessionReducer(saved, { type: 'ended', result: SURE, validated: true })).toBe(saved)
  })

  it('montre une erreur d’enregistrement, puis réessaie', () => {
    const failed = play(at({ kind: 'saving', reps: 6 }), { type: 'saveFailed' })
    expect(failed.view).toEqual({
      kind: 'saved',
      reps: 6,
      next: null,
      error: true,
      correcting: false,
      corrected: false,
    })
    // Pas de correction ni de suite tant que la série n'est pas enregistrée.
    for (const type of ['correct', 'continueSet', 'nextSet', 'restOver'] as const) {
      expect(sessionReducer(failed, { type })).toBe(failed)
    }
    expect(play(failed, { type: 'save' }).view).toEqual({ kind: 'saving', reps: 6 })
    expect(sessionReducer(at({ kind: 'live' }), { type: 'saveFailed' }).view).toEqual({ kind: 'live' })
    expect(sessionReducer(at({ kind: 'live' }), { type: 'saved', next: null }).view).toEqual({ kind: 'live' })
  })

  it('corrige une série enregistrée, ou annule la correction', () => {
    const saved = play(at({ kind: 'saving', reps: 12 }), { type: 'saved', next: NEXT })
    const correcting = sessionReducer(saved, { type: 'correct' })
    expect(correcting.view).toMatchObject({ correcting: true, corrected: false })
    expect(sessionReducer(correcting, { type: 'cancelCorrect' }).view).toEqual(saved.view)
    const corrected = play(correcting, { type: 'adjust', reps: 11 }, { type: 'corrected' })
    expect(corrected).toMatchObject({ offset: 11, view: { reps: 11, correcting: false, corrected: true } })
    // Hors correction, le nombre enregistré ne bouge pas.
    expect(sessionReducer(saved, { type: 'adjust', reps: 3 })).toBe(saved)
    expect(sessionReducer(saved, { type: 'corrected' })).toBe(saved)
    expect(sessionReducer(at({ kind: 'live' }), { type: 'cancelCorrect' }).view).toEqual({ kind: 'live' })
  })

  it('continue la série enregistrée, ou celle à vérifier, en repartant de son compte', () => {
    const saved = play(at({ kind: 'saving', reps: 8 }, { attempt: 2 }), { type: 'saved', next: NEXT })
    expect(sessionReducer(saved, { type: 'continueSet' })).toMatchObject({
      view: { kind: 'live' },
      setId: 's1',
      offset: 8,
      attempt: 3,
      result: null,
    })
    const review = at({ kind: 'review', result: UNSURE, reps: 9 }, { attempt: 5 })
    expect(sessionReducer(review, { type: 'continueSet' })).toMatchObject({ offset: 9, attempt: 6 })
    expect(sessionReducer(at({ kind: 'empty' }), { type: 'continueSet' }).view).toEqual({ kind: 'empty' })
  })

  it('passe à la série suivante à la fin du repos ou sur « Série suivante »', () => {
    const saved = play(at({ kind: 'saving', reps: 12 }, { attempt: 2 }), { type: 'saved', next: NEXT })
    for (const type of ['nextSet', 'restOver'] as const) {
      expect(sessionReducer(saved, { type })).toEqual({
        view: { kind: 'live' },
        setId: 's2',
        setIndex: 1,
        offset: 0,
        result: null,
        attempt: 3,
      })
    }
    // Dernière série de l'exercice : on reste sur le résultat.
    const last = play(at({ kind: 'saving', reps: 12 }), { type: 'saved', next: null })
    expect(sessionReducer(last, { type: 'restOver' })).toBe(last)
    // Une correction en cours n'est pas interrompue par la fin du repos.
    const correcting = sessionReducer(saved, { type: 'correct' })
    expect(sessionReducer(correcting, { type: 'restOver' })).toBe(correcting)
    expect(sessionReducer(correcting, { type: 'nextSet' }).setId).toBe('s2')
  })

  it('demande avant de fermer seulement quand des répétitions ne sont pas enregistrées', () => {
    const live = at({ kind: 'live' })
    expect(sessionReducer(live, { type: 'askClose', reps: 0 })).toBe(live)
    const confirm = sessionReducer(live, { type: 'askClose', reps: 7 })
    expect(confirm.view).toEqual({ kind: 'confirmClose', reps: 7, back: 'live' })
    expect(sessionReducer(confirm, { type: 'keepCounting' }).view).toEqual({ kind: 'live' })
    expect(sessionReducer(at({ kind: 'guide' }), { type: 'askClose', reps: 2 }).view).toMatchObject({
      back: 'live',
    })

    const review = at({ kind: 'review', result: UNSURE, reps: 9 }, { result: UNSURE })
    const fromReview = sessionReducer(review, { type: 'askClose', reps: 9 })
    expect(fromReview.view).toEqual({ kind: 'confirmClose', reps: 9, back: 'review' })
    expect(sessionReducer(fromReview, { type: 'keepCounting' }).view).toEqual(review.view)

    for (const view of [
      { kind: 'empty' },
      { kind: 'saving', reps: 3 },
      { kind: 'problem', problem: 'error' },
    ] as const) {
      expect(sessionReducer(at(view), { type: 'askClose', reps: 3 }).view).toEqual(view)
    }
    expect(sessionReducer(live, { type: 'keepCounting' })).toBe(live)
  })

  it('oublie un compte à vérifier pour recompter la série', () => {
    const review = at({ kind: 'review', result: UNSURE, reps: 7 }, { offset: 0, result: UNSURE, attempt: 2 })
    expect(sessionReducer(review, { type: 'discard' })).toMatchObject({
      view: { kind: 'live' },
      offset: 0,
      result: null,
      attempt: 3,
    })
    expect(sessionReducer(at({ kind: 'live' }), { type: 'discard' }).view).toEqual({ kind: 'live' })
  })
})

const set = (id: string, done: boolean): WorkoutSet => ({
  id,
  reps: done ? 8 : null,
  durationSec: null,
  loadKg: null,
  assistance: null,
  rpe: null,
  done,
  completedAt: done ? '2026-10-21T09:00:00.000Z' : null,
})

describe('aides du compteur', () => {
  it('trouvent la série à compter et la suivante du même exercice', () => {
    expect(firstPendingIndex({ sets: [set('a', true), set('b', false), set('c', false)] })).toBe(1)
    expect(firstPendingIndex({ sets: [set('a', true), set('b', true)] })).toBe(1)
    expect(firstPendingIndex({ sets: [] })).toBe(0)

    const exercise = {
      id: 'row',
      sets: [set('a', true), set('b', false), set('c', false)],
    } as WorkoutExercise
    const pending = (row: WorkoutExercise, index: number): PendingSet => ({
      exercise: row,
      set: row.sets[index]!,
      index,
    })
    expect(nextInExercise(pending(exercise, 2), 'row')).toEqual({ setId: 'c', index: 2, total: 3 })
    expect(nextInExercise(pending({ ...exercise, id: 'other' }, 1), 'row')).toBeNull()
    expect(nextInExercise(null, 'row')).toBeNull()
  })

  it('retiennent le compte de la série pour l’export des points', () => {
    expect(
      expectedReps(
        at({ kind: 'saved', reps: 11, next: null, error: false, correcting: false, corrected: true }),
      ),
    ).toBe(11)
    expect(expectedReps(at({ kind: 'saving', reps: 4 }))).toBe(4)
    expect(expectedReps(at({ kind: 'review', result: UNSURE, reps: 9 }))).toBe(9)
    expect(expectedReps(at({ kind: 'empty' }, { offset: 8 }))).toBe(8)
    expect(expectedReps(at({ kind: 'empty' }))).toBe(0)
  })

  it('ne rafraîchissent l’écran que quand ce qui s’y voit change', () => {
    const base = counterSnapshot({ status: 'counting', reps: 3, hint: { kind: 'out', part: 'feet' } })
    expect(displayChanged(null, base)).toBe(true)
    expect(displayChanged(base, { ...base, debug: { ...base.debug, signal: 120 } })).toBe(false)
    expect(displayChanged(base, { ...base })).toBe(false)
    for (const patch of [
      { status: 'ended' as const },
      { reps: 4 },
      { partials: 1 },
      { slow: true },
      { hint: { kind: 'out' as const, part: 'hands' as const } },
      { hint: null },
      { event: { kind: 'partial' as const, t: 5, id: 1 } },
    ]) {
      expect(displayChanged(base, { ...base, ...patch })).toBe(true)
    }
  })

  it('choisissent le signal : départ, répétition, objectif atteint', () => {
    const arming = counterSnapshot({ status: 'arming' })
    const counting = counterSnapshot({ status: 'counting' })
    expect(cueFor(counterSnapshot(), arming, 8)).toBeNull()
    expect(cueFor(arming, counting, 8)).toEqual({ tone: 'go', text: 'C’est parti' })
    expect(cueFor(arming, { ...counting, reps: 1 }, 8)).toEqual({ tone: 'go', text: 'C’est parti, 1' })
    expect(cueFor({ ...counting, reps: 6 }, { ...counting, reps: 7 }, 8)).toEqual({ tone: 'tick', text: '7' })
    expect(cueFor({ ...counting, reps: 7 }, { ...counting, reps: 8 }, 8)).toEqual({
      tone: 'go',
      text: '8, objectif atteint',
    })
    // Une seule fois : au-delà, ou en continuant une série déjà au-dessus de l'objectif.
    expect(cueFor({ ...counting, reps: 8 }, { ...counting, reps: 9 }, 8)).toEqual({ tone: 'tick', text: '9' })
    expect(cueFor({ ...counting, reps: 9 }, { ...counting, reps: 10 }, null)).toEqual({
      tone: 'tick',
      text: '10',
    })
    expect(cueFor({ ...counting, reps: 9 }, { ...counting, reps: 9, partials: 1 }, 8)).toBeNull()
  })

  it('datent la dernière répétition d’après la dernière image', () => {
    expect(lastRepAt([1000, 4000], { t: 10_000, at: 1_700_000_000_000 })).toBe(1_699_999_994_000)
    expect(lastRepAt([12_000], { t: 10_000, at: 50_000 })).toBe(50_000)
    expect(lastRepAt([], { t: 10_000, at: 50_000 })).toBeUndefined()
    expect(lastRepAt([1000], null)).toBeUndefined()
  })

  it('mesurent les images par seconde d’un fichier de points', () => {
    const frames = (times: number[]): FixtureFrame[] => times.map((t) => [t, 0, 0])
    expect(measuredFps(frames([0, 100, 200, 300]))).toBe(10)
    expect(measuredFps(frames([0, 66, 133, 200]))).toBe(15)
    expect(measuredFps(frames([500]))).toBe(15)
    expect(measuredFps([])).toBe(15)
  })
})
