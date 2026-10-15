import type { FixtureFrame } from '@/content/reps/fixture'
import type { CounterResult, CounterSnapshot } from '@/content/reps/types'
import type { PendingSet } from '@/content/workouts/workout'
import type { WorkoutExercise } from '@/db/types'
import type { Tone } from '../cues'
import { CUE_TEXT, MAX_REPS } from './counter-view'
import type { PoseCameraProblem } from './usePoseCamera'

/*
 * Ce que montre la feuille du compteur caméra, et comment elle passe d'un écran à l'autre (sans effet de bord :
 * la caméra, le compteur et l'enregistrement sont dans useRepSession).
 *
 * conseils ─ouvrir─▶ préparation ─prête─▶ direct ─fin─▶ enregistrement (compte sûr) ─▶ enregistrée (repos)
 *                                                  ├──▶ à vérifier ─enregistrer─▶ enregistrement …
 *                                                  └──▶ rien compté ─réessayer─▶ direct
 * Fin du repos ou « Série suivante » : direct pour la série suivante du même exercice.
 * « Continuer la série » (enregistrée ou à vérifier) : direct, et retour à cet écran si rien de plus n'est compté.
 */

/** La série suivante du même exercice : rang (à partir de 0) et nombre de séries de l'exercice. */
export interface NextSet {
  readonly setId: string
  readonly index: number
  readonly total: number
}

/** Les écrans de la feuille, hors question de fermeture. */
export type ScreenView =
  | { readonly kind: 'guide' }
  | { readonly kind: 'starting' }
  | { readonly kind: 'live' }
  | { readonly kind: 'empty' }
  /**
   * Compte à vérifier ; `reps` suit le réglage − / + ; `addedDoubtful` : « Ajouter les 2 mouvements » déjà
   * touché (il ne revient pas).
   */
  | {
      readonly kind: 'review'
      readonly result: CounterResult
      readonly reps: number
      readonly addedDoubtful: boolean
    }
  | { readonly kind: 'saving'; readonly reps: number }
  | {
      readonly kind: 'saved'
      readonly reps: number
      readonly next: NextSet | null
      readonly error: boolean
      readonly correcting: boolean
      readonly corrected: boolean
    }
  | { readonly kind: 'problem'; readonly problem: PoseCameraProblem }

export type SessionView =
  | ScreenView
  /** « Fermer sans enregistrer les 7 répétitions ? », puis retour tel quel à l'écran d'avant (`back`). */
  | { readonly kind: 'confirmClose'; readonly reps: number; readonly back: ScreenView }

/** Un écran d'où « Continuer la série » peut partir. */
export type ResumeView = Extract<SessionView, { kind: 'review' | 'saved' }>

export interface SessionState {
  readonly view: SessionView
  readonly setId: string
  readonly setIndex: number
  /**
   * Répétitions déjà comptées pour cette série, d'où repart le compteur : celles enregistrées, ou celles
   * vérifiées avant « Continuer la série ».
   */
  readonly offset: number
  /**
   * L'écran d'où « Continuer la série » est parti (série enregistrée, ou compte vérifié pas encore enregistré) :
   * si l'essai ne compte rien de plus, on y revient, sans rien perdre.
   */
  readonly resume: ResumeView | null
  /** Résultat de la dernière série comptée (pour l'export des points). */
  readonly result: CounterResult | null
  /** Numéro de l'essai : chaque nouveau numéro veut un compteur neuf. */
  readonly attempt: number
}

export type SessionAction =
  | { type: 'openCamera' }
  /** « Conseils de placement » pendant le direct. */
  | { type: 'showGuide' }
  | { type: 'ready' }
  | { type: 'problem'; problem: PoseCameraProblem }
  | { type: 'retry' }
  | { type: 'ended'; result: CounterResult; validated: boolean }
  | { type: 'askClose'; reps: number }
  | { type: 'keepCounting' }
  | { type: 'adjust'; reps: number }
  /** « Ajouter les 2 mouvements » écartés après une pause. */
  | { type: 'addDoubtful' }
  | { type: 'save' }
  | { type: 'saved'; next: NextSet | null }
  | { type: 'saveFailed' }
  | { type: 'correct' }
  | { type: 'cancelCorrect' }
  | { type: 'corrected' }
  | { type: 'continueSet' }
  | { type: 'nextSet' }
  | { type: 'restOver' }
  | { type: 'discard' }

/** Conseils la première fois pour ce mouvement ; sinon la caméra s'ouvre tout de suite. */
export function initialSession(args: { setId: string; setIndex: number; guideSeen: boolean }): SessionState {
  return {
    view: args.guideSeen ? { kind: 'starting' } : { kind: 'guide' },
    setId: args.setId,
    setIndex: args.setIndex,
    offset: 0,
    resume: null,
    result: null,
    attempt: 1,
  }
}

const clampReps = (reps: number) => Math.min(MAX_REPS, Math.max(0, Math.round(reps)))

/** Un nouvel essai en direct : compteur neuf, qui repart de `offset`. */
function fresh(
  state: SessionState,
  patch: Partial<Pick<SessionState, 'setId' | 'setIndex' | 'offset' | 'resume'>>,
) {
  return { ...state, ...patch, view: { kind: 'live' as const }, result: null, attempt: state.attempt + 1 }
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  const { view } = state
  switch (action.type) {
    case 'openCamera':
      return view.kind === 'guide' ? { ...state, view: { kind: 'starting' } } : state
    case 'showGuide':
      return view.kind === 'live' ? { ...state, view: { kind: 'guide' } } : state
    case 'ready':
      return view.kind === 'starting' ? { ...state, view: { kind: 'live' } } : state
    case 'problem':
      return view.kind === 'starting' || view.kind === 'live'
        ? { ...state, view: { kind: 'problem', problem: action.problem } }
        : state
    case 'retry':
      if (view.kind === 'problem') {
        return { ...state, view: { kind: 'starting' }, result: null, attempt: state.attempt + 1 }
      }
      return view.kind === 'empty' ? fresh(state, {}) : state
    case 'ended': {
      // Fin automatique en direct, ou caméra coupée pendant les conseils ou la question de fermeture.
      const counting =
        view.kind === 'live' ||
        view.kind === 'guide' ||
        (view.kind === 'confirmClose' && view.back.kind === 'live')
      if (!counting) return state
      const { result } = action
      // Rien de plus que le compte d'où l'essai est parti : retour à la série enregistrée ou vérifiée.
      if (result.reps + result.doubtful <= state.offset) {
        return { ...state, view: state.resume ?? { kind: 'empty' }, result }
      }
      if (result.confident && action.validated) {
        return { ...state, view: { kind: 'saving', reps: result.reps }, result }
      }
      return { ...state, view: { kind: 'review', result, reps: result.reps, addedDoubtful: false }, result }
    }
    case 'askClose':
      if (action.reps <= 0) return state
      // Depuis les conseils (remontrés pendant le direct), on revient au direct.
      if (view.kind === 'live' || view.kind === 'guide') {
        return { ...state, view: { kind: 'confirmClose', reps: action.reps, back: { kind: 'live' } } }
      }
      return view.kind === 'review'
        ? { ...state, view: { kind: 'confirmClose', reps: action.reps, back: view } }
        : state
    case 'keepCounting':
      return view.kind === 'confirmClose' ? { ...state, view: view.back } : state
    case 'adjust':
      if (view.kind === 'review') return { ...state, view: { ...view, reps: clampReps(action.reps) } }
      // Correction enregistrée : la série compte désormais ce nombre.
      return view.kind === 'saved' && view.correcting
        ? { ...state, view: { ...view, reps: clampReps(action.reps) } }
        : state
    case 'addDoubtful':
      if (view.kind !== 'review' || view.addedDoubtful || view.result.doubtful <= 0) return state
      return {
        ...state,
        view: { ...view, reps: clampReps(view.reps + view.result.doubtful), addedDoubtful: true },
      }
    case 'save':
      if ((view.kind === 'review' && view.reps > 0) || (view.kind === 'saved' && view.error)) {
        return { ...state, view: { kind: 'saving', reps: view.reps } }
      }
      return state
    case 'saved':
      if (view.kind !== 'saving') return state
      return {
        ...state,
        offset: view.reps,
        resume: null,
        view: {
          kind: 'saved',
          reps: view.reps,
          next: action.next,
          error: false,
          correcting: false,
          corrected: false,
        },
      }
    case 'saveFailed':
      if (view.kind !== 'saving') return state
      return {
        ...state,
        view: {
          kind: 'saved',
          reps: view.reps,
          next: null,
          error: true,
          correcting: false,
          corrected: false,
        },
      }
    case 'correct':
      return view.kind === 'saved' && !view.error
        ? { ...state, view: { ...view, correcting: true, corrected: false } }
        : state
    case 'cancelCorrect':
      return view.kind === 'saved' ? { ...state, view: { ...view, correcting: false } } : state
    case 'corrected':
      return view.kind === 'saved' && view.correcting
        ? { ...state, offset: view.reps, view: { ...view, correcting: false, corrected: true } }
        : state
    case 'continueSet':
      if (view.kind === 'saved' && !view.error) {
        return fresh(state, { offset: view.reps, resume: { ...view, correcting: false } })
      }
      return view.kind === 'review' ? fresh(state, { offset: view.reps, resume: view }) : state
    case 'nextSet':
    case 'restOver':
      if (view.kind !== 'saved' || view.error || !view.next) return state
      // La fin du repos n'interrompt pas une correction en cours : « Série suivante » reste là.
      if (action.type === 'restOver' && view.correcting) return state
      return fresh(state, { setId: view.next.setId, setIndex: view.next.index, offset: 0, resume: null })
    case 'discard':
      return view.kind === 'review' ? fresh(state, {}) : state
  }
}

/**
 * Le compte retenu pour la série (fichier de points exporté) : enregistré, en cours d'enregistrement ou
 * vérifié ; sinon celui d'où repart le compteur.
 */
export function expectedReps(state: SessionState): number {
  const { view } = state
  if (view.kind === 'saved' || view.kind === 'saving' || view.kind === 'review') return view.reps
  return state.offset
}

/** La série comptée à l'ouverture : la première à faire, sinon la dernière. */
export function firstPendingIndex(exercise: Pick<WorkoutExercise, 'sets'>): number {
  const pending = exercise.sets.findIndex((set) => !set.done)
  return pending === -1 ? Math.max(0, exercise.sets.length - 1) : pending
}

/** La série suivante de la séance, si elle est dans le même exercice (sinon le compteur s'arrête là). */
export function nextInExercise(next: PendingSet | null, exerciseRowId: string): NextSet | null {
  if (!next || next.exercise.id !== exerciseRowId) return null
  return { setId: next.set.id, index: next.index, total: next.exercise.sets.length }
}

/** Ce qui se voit à l'écran a changé (le reste, comme la mesure, ne se rafraîchit que 4 fois par seconde). */
export function displayChanged(before: CounterSnapshot | null, after: CounterSnapshot): boolean {
  if (!before) return true
  const hint = (snapshot: CounterSnapshot) =>
    snapshot.hint ? `${snapshot.hint.kind}:${snapshot.hint.kind === 'out' ? snapshot.hint.part : ''}` : ''
  return (
    before.status !== after.status ||
    before.reps !== after.reps ||
    before.partials !== after.partials ||
    before.slow !== after.slow ||
    hint(before) !== hint(after) ||
    (before.event?.id ?? null) !== (after.event?.id ?? null)
  )
}

/**
 * Le bip et la phrase à jouer entre deux images : « C'est parti » quand le compte démarre, le nombre à chaque
 * répétition, « objectif atteint » une fois. Un seul signal par image (la voix couperait le précédent).
 */
export function cueFor(
  before: CounterSnapshot,
  after: CounterSnapshot,
  target: number | null,
): { tone: Tone; text: string } | null {
  const parts: string[] = []
  let tone: Tone = 'tick'
  if (before.status !== 'counting' && after.status === 'counting') {
    tone = 'go'
    parts.push(CUE_TEXT.armed)
  }
  if (after.reps > before.reps) {
    parts.push(String(after.reps))
    if (target !== null && before.reps < target && after.reps >= target) {
      tone = 'go'
      parts.push(CUE_TEXT.target.toLowerCase())
    }
  }
  return parts.length > 0 ? { tone, text: parts.join(', ') } : null
}

/** Une pause de l'essai (hors du direct) : temps du compteur où elle a commencé, et sa durée en ms. */
export interface Pause {
  readonly t: number
  readonly ms: number
}

/**
 * Heure (ms depuis 1970) de la dernière répétition, d'après l'heure de la dernière image analysée : le repos
 * se compte depuis là, pauses comprises (le temps du compteur ne les compte pas). Sans répétition : rien.
 */
export function lastRepAt(
  repTimes: readonly number[],
  lastFrame: { readonly t: number; readonly at: number } | null,
  pauses: readonly Pause[] = [],
): number | undefined {
  const last = repTimes.at(-1)
  if (last === undefined || !lastFrame) return undefined
  const paused = pauses.filter((pause) => pause.t >= last).reduce((sum, pause) => sum + pause.ms, 0)
  return lastFrame.at - Math.max(0, lastFrame.t - last) - paused
}

/** Images par seconde d'un fichier de points, d'après les temps des images (15 sans assez d'images). */
export function measuredFps(frames: readonly FixtureFrame[]): number {
  const first = frames[0]?.[0]
  const last = frames.at(-1)?.[0]
  if (first === undefined || last === undefined || last <= first) return 15
  return Math.round(((frames.length - 1) * 1000 * 10) / (last - first)) / 10
}
