import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { format } from 'date-fns'
import { FIXTURE_JOINTS } from '@/content/reps/fixture'
import { createRepCounter, type RepCounter } from '@/content/reps/rep-counter'
import { SPECS } from '@/content/reps/specs'
import type { CounterResult, CounterSnapshot, PoseFrame } from '@/content/reps/types'
import { updateSet } from '@/content/workouts/workout'
import { jsonFile, shareOrDownload } from '@/lib/files'
import { cue } from '../cues'
import { skipRest, useRest, type RestState } from '../rest-timer'
import { useWakeLock, type WakeLockStatus } from '../useWakeLock'
import { readCounterPrefs, writeCounterPrefs, type CounterPrefs } from './counter-prefs'
import {
  cueFor,
  displayChanged,
  expectedReps,
  firstPendingIndex,
  initialSession,
  lastRepAt,
  measuredFps,
  nextInExercise,
  savedOffset,
  sessionReducer,
  unsavedReps,
  type Pause,
  type SessionState,
  type SessionView,
} from './counter-session'
import { CUE_TEXT, exportFileName, targetMin } from './counter-view'
import type { Delegate } from './pose-engine'
import { createRecorder } from './recorder'
import type { RepCounterSheetProps } from './RepCounterSheet'
import { usePoseCamera, type PoseCamera, type PoseCameraState } from './usePoseCamera'

/*
 * Le compteur caméra en marche : la caméra et le moteur (usePoseCamera), un compteur par essai, les écrans
 * (sessionReducer), les bips et la voix, l'enregistrement de la série et le repos, l'écran gardé allumé.
 */

export interface SessionActions {
  /** « Ouvrir la caméra » (les conseils de ce mouvement sont alors vus). */
  readonly openCamera: () => void
  /** « Conseils de placement ». */
  readonly showGuide: () => void
  /** « Terminer la série ». */
  readonly finish: () => void
  /**
   * Croix, Échap ou fond : demande d'abord s'il reste des répétitions pas enregistrées ; pendant un
   * enregistrement, ferme quand il a réussi ; pendant la question, ne fait rien (seuls ses boutons choisissent).
   */
  readonly close: () => void
  /** Garde la feuille ouverte : retour à l'écran d'avant la question. */
  readonly keepCounting: () => void
  /** « Fermer sans enregistrer ». */
  readonly closeNow: () => void
  /** « Réessayer » après un problème ou quand rien n'a été compté. */
  readonly retry: () => void
  readonly adjust: (reps: number) => void
  /** « Ajouter les 2 mouvements » écartés après une pause (une fois). */
  readonly addDoubtful: () => void
  /** « Enregistrer N répétitions », ou « Réessayer » après un enregistrement raté. */
  readonly save: () => void
  /** « Ne pas enregistrer » : la série se recompte. */
  readonly discard: () => void
  readonly continueSet: () => void
  readonly nextSet: () => void
  readonly correct: () => void
  readonly cancelCorrect: () => void
  /** Enregistre le nombre corrigé (la série reste faite) ; faux si l'enregistrement échoue. */
  readonly saveCorrection: (reps: number) => Promise<boolean>
  readonly switchCamera: () => void
  readonly toggleDebug: () => void
  readonly setDelegate: (delegate: Delegate) => void
  /** « Exporter les points de la série ». */
  readonly exportPoints: () => void
}

export interface RepSession {
  readonly state: SessionState
  /** Ce que voit le compteur de l'essai en cours (null avant sa première image). */
  readonly snapshot: CounterSnapshot | null
  readonly camera: PoseCamera
  readonly wakeLock: WakeLockStatus
  readonly prefs: CounterPrefs
  readonly actions: SessionActions
  /** Le repos en cours de cette séance. */
  readonly rest: RestState | null
  /** La caméra a été demandée : elle reste allumée jusqu'à la fermeture. */
  readonly cameraOn: boolean
  /** Une série finie a des points à exporter. */
  readonly canExport: boolean
  /**
   * Mouvement validé (specs.ts) : un compte sûr s'enregistre tout seul. Sinon, « en essai » : chaque compte se
   * vérifie avant d'être enregistré, et les conseils le disent.
   */
  readonly validated: boolean
}

/**
 * Un essai : un compteur neuf, et ce qu'il a rendu en dernier. Le temps passé hors du direct (question de
 * fermeture, conseils) est retiré du temps des images : le compteur ne voit pas ces pauses.
 */
interface Attempt {
  readonly number: number
  /** Le compte d'où l'essai part (« Continuer la série »). */
  readonly offset: number
  readonly counter: RepCounter
  last: CounterSnapshot
  /** Temps de la dernière image donnée au compteur (temps du compteur). */
  lastT: number
  /** Millisecondes de pause retirées du temps des images. */
  shift: number
  /** Début de la pause en cours (performance.now()), sinon null. */
  pausedAt: number | null
  /** Les pauses finies : temps du compteur où chacune a commencé, et sa durée. */
  readonly pauses: Pause[]
}

/** La dernière image analysée : son essai, son temps (celui du compteur), l'heure, et sa taille. */
interface LastFrame {
  readonly attempt: number
  readonly t: number
  readonly at: number
  readonly perf: number
  readonly width: number
  readonly height: number
}

/** Les valeurs d'infos de réglage se rafraîchissent 4 fois par seconde. */
const DEBUG_REFRESH_MS = 250
/** Plus d'image depuis aussi longtemps (caméra figée) : on laisse passer le temps du compteur. */
const STALL_MS = 1000

export function useRepSession(props: RepCounterSheetProps): RepSession {
  const { workout, exercise, exerciseName, variant, save, onClose } = props
  const movement = variant.movement
  const [opened] = useState(readCounterPrefs)
  const [prefs, setPrefs] = useState(opened)
  const [state, dispatch] = useReducer(sessionReducer, null, () => {
    const setIndex = firstPendingIndex(exercise)
    return initialSession({
      setId: exercise.sets[setIndex]?.id ?? '',
      setIndex,
      guideSeen: opened.guides.includes(movement),
    })
  })
  const [cameraOn, setCameraOn] = useState(state.view.kind !== 'guide')
  const [shown, setShown] = useState<{ attempt: number; snapshot: CounterSnapshot } | null>(null)
  const [recorder] = useState(() => createRecorder())
  const wakeLock = useWakeLock(true)
  const anyRest = useRest()
  const rest = anyRest?.workoutId === workout.id ? anyRest : null

  // Les rappels de la caméra et des minuteries lisent toujours l'état et les props du dernier rendu.
  const latest = useRef({ state, props, prefs })
  useLayoutEffect(() => {
    latest.current = { state, props, prefs }
  })
  const attemptRef = useRef<Attempt | null>(null)
  const settledRef = useRef(0)
  const lastFrameRef = useRef<LastFrame | null>(null)
  const shownRef = useRef<{ attempt: number; snapshot: CounterSnapshot; at: number } | null>(null)

  /** Le compteur de l'essai en cours, créé à l'entrée en direct (sinon à sa première image). */
  const currentAttempt = useCallback((): Attempt => {
    const { state: current, props: currentProps } = latest.current
    const existing = attemptRef.current
    if (existing?.number === current.attempt) return existing
    // Les points gardés sont ceux de l'essai : un compteur neuf les rejoue depuis le début (« Continuer la
    // série » compris, son compte attendu étant ce qu'il ajoute).
    recorder.clear()
    const counter = createRepCounter({ variant: currentProps.variant, offset: current.offset })
    const attempt: Attempt = {
      number: current.attempt,
      offset: current.offset,
      counter,
      last: counter.snapshot,
      lastT: Number.NEGATIVE_INFINITY,
      shift: 0,
      pausedAt: null,
      pauses: [],
    }
    attemptRef.current = attempt
    return attempt
  }, [recorder])

  /** Temps du compteur maintenant : celui de la dernière image, plus le temps passé depuis (hors pause). */
  const counterNow = useCallback((): number => {
    const frame = lastFrameRef.current
    if (!frame) return Math.round(performance.now())
    const attempt = attemptRef.current
    const now = (attempt?.number === frame.attempt ? attempt.pausedAt : null) ?? performance.now()
    return Math.round(frame.t + Math.max(1, now - frame.perf))
  }, [])

  /** Fin de l'essai (automatique, « Terminer la série », caméra coupée) : une seule fois par essai. */
  const settle = useCallback((attempt: Attempt, result: CounterResult) => {
    if (settledRef.current === attempt.number) return
    settledRef.current = attempt.number
    // Le compteur rend déjà un compte jamais sûr (raison « trial ») pour un mouvement en essai ; la feuille
    // s'en tient en plus à specs.ts, pour que ce mouvement ne s'enregistre jamais sans vérification.
    const validated = SPECS[latest.current.props.variant.movement].validated
    dispatch({ type: 'ended', result, validated })
  }, [])

  /** Ce que le compteur vient de rendre : signal sonore, écran, fin de série. */
  const publish = useCallback(
    (attempt: Attempt, snapshot: CounterSnapshot) => {
      const before = attempt.last
      attempt.last = snapshot
      const { props: currentProps, prefs: currentPrefs } = latest.current
      if (snapshot !== before) {
        const signal = cueFor(before, snapshot, targetMin(currentProps.exercise.target))
        if (signal) cue(signal.tone, currentProps.cues, signal.text)
        // « Continuer la série » après l'enregistrement : le repos de la série s'arrête à la première répétition
        // de plus (sans elle, la série reste comme elle était, repos compris).
        if (
          latest.current.state.resume?.kind === 'saved' &&
          before.reps <= attempt.offset &&
          snapshot.reps > attempt.offset
        ) {
          skipRest()
        }
      }
      const now = Date.now()
      const previous = shownRef.current
      if (
        previous?.attempt !== attempt.number ||
        displayChanged(previous.snapshot, snapshot) ||
        (currentPrefs.debug && now - previous.at >= DEBUG_REFRESH_MS)
      ) {
        shownRef.current = { attempt: attempt.number, snapshot, at: now }
        setShown({ attempt: attempt.number, snapshot })
      }
      const result = attempt.counter.result
      if (result) settle(attempt, result)
    },
    [settle],
  )

  const onFrame = useCallback(
    (frame: PoseFrame, light: number | null) => {
      if (latest.current.state.view.kind !== 'live') return
      const attempt = currentAttempt()
      const ended = attempt.counter.result
      if (ended) {
        settle(attempt, ended)
        return
      }
      // Le temps du compteur, pauses retirées (toujours croissant).
      const t = Math.max(attempt.lastT + 1, frame.t - attempt.shift)
      attempt.lastT = t
      const counted = t === frame.t ? frame : { ...frame, t }
      recorder.add(counted)
      lastFrameRef.current = {
        attempt: attempt.number,
        t,
        at: Date.now(),
        perf: performance.now(),
        width: frame.width,
        height: frame.height,
      }
      publish(attempt, attempt.counter.push(counted, light))
    },
    [currentAttempt, publish, recorder, settle],
  )

  /**
   * La caméra s'est coupée (appli en arrière-plan, plantage) pendant une série : avec des répétitions pas
   * enregistrées, la série s'arrête et passe à vérifier. Rend vrai dans ce cas.
   */
  const interrupt = useCallback((): boolean => {
    const { view, attempt: number } = latest.current.state
    const attempt = attemptRef.current
    if (view.kind !== 'live' && view.kind !== 'guide' && view.kind !== 'confirmClose') return false
    if (attempt?.number !== number || attempt.counter.result) return false
    if (attempt.last.reps <= savedOffset(latest.current.state)) return false
    settle(attempt, attempt.counter.finish(counterNow(), 'interrupted'))
    return true
  }, [counterNow, settle])

  const onHidden = useCallback(() => {
    interrupt()
  }, [interrupt])

  const camera = usePoseCamera({
    open: true,
    cameraOn,
    analysing: state.view.kind === 'live',
    facing: prefs.facing,
    // Le calcul choisi vaut à l'ouverture du compteur : le changer sert à la prochaine fois.
    delegate: opened.delegate,
    joints: FIXTURE_JOINTS,
    onFrame,
    onHidden,
  })

  // La caméra tourne : la préparation laisse place au direct.
  const running = camera.state.kind === 'running'
  useEffect(() => {
    if (running && state.view.kind === 'starting') dispatch({ type: 'ready' })
  }, [running, state.view.kind])

  // Un problème de caméra se montre en préparation ou en direct (pas pendant le repos ni la vérification :
  // il se verra au retour en direct). Après « Réessayer », on attend que la caméra change d'état.
  const retriedFrom = useRef<PoseCameraState | null>(null)
  useEffect(() => {
    const cameraState = camera.state
    if (cameraState.kind !== 'problem') {
      retriedFrom.current = null
      return
    }
    if (retriedFrom.current === cameraState) return
    if (!interrupt()) dispatch({ type: 'problem', problem: cameraState.problem })
  }, [camera.state, state.view.kind, interrupt])

  // Un compteur neuf dès l'entrée en direct d'un nouvel essai (il repart du compte déjà fait).
  const isLive = state.view.kind === 'live'
  useEffect(() => {
    if (isLive) currentAttempt()
  }, [isLive, state.attempt, currentAttempt])

  // Hors du direct (question de fermeture, conseils), l'essai attend : au retour, ce temps est retiré du temps
  // du compteur, qui n'y voit ni un arrêt (fin de série) ni une image saccadée.
  useEffect(() => {
    const attempt = attemptRef.current
    if (attempt?.number !== state.attempt) return
    const now = performance.now()
    if (!isLive) {
      attempt.pausedAt ??= now
      return
    }
    const { pausedAt } = attempt
    attempt.pausedAt = null
    // Pas encore d'image : rien à décaler.
    if (pausedAt === null || attempt.lastT === Number.NEGATIVE_INFINITY) return
    const ms = Math.round(now - pausedAt)
    attempt.shift += ms
    attempt.pauses.push({ t: attempt.lastT, ms })
    const frame = lastFrameRef.current
    if (frame?.attempt === attempt.number) lastFrameRef.current = { ...frame, perf: frame.perf + ms }
  }, [isLive, state.attempt])

  // Caméra figée en direct : le compteur voit quand même le temps passer (et peut finir la série).
  useEffect(() => {
    if (!isLive) return
    const timer = setInterval(() => {
      const frame = lastFrameRef.current
      const attempt = attemptRef.current
      // Seulement un compteur qui a déjà vu une image : un compteur neuf attend la caméra.
      if (attempt?.number !== latest.current.state.attempt || frame?.attempt !== attempt.number) return
      if (performance.now() - frame.perf < STALL_MS) return
      publish(attempt, attempt.counter.tick(counterNow()))
    }, STALL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [isLive, counterNow, publish])

  // Enregistrement de la série : une fois par entrée dans l'écran « enregistrement ». Fermée pendant ce temps, la
  // feuille se ferme quand il a réussi ; s'il échoue, elle reste ouverte sur l'erreur.
  const savingFor = useRef<SessionView | null>(null)
  const closeWhenSaved = useRef(false)
  useEffect(() => {
    const { view } = state
    if (view.kind !== 'saving' || savingFor.current === view) return
    savingFor.current = view
    const { exercise: row, onComplete, cues: options } = latest.current.props
    const set = row.sets.find((s) => s.id === state.setId)
    const auto = state.result?.confident === true
    const restFrom = lastRepAt(
      state.result?.repTimes ?? [],
      lastFrameRef.current,
      attemptRef.current?.pauses ?? [],
    )
    const saving = set
      ? onComplete(set, { reps: view.reps }, restFrom)
      : Promise.reject(new Error('Série introuvable'))
    saving.then(
      (next) => {
        dispatch({ type: 'saved', next: nextInExercise(next, row.id) })
        if (auto) cue('go', options, CUE_TEXT.saved(view.reps))
        if (closeWhenSaved.current) latest.current.props.onClose()
      },
      () => {
        closeWhenSaved.current = false
        dispatch({ type: 'saveFailed' })
      },
    )
  }, [state])

  // Compte à vérifier : un bip (et « Compte à vérifier ») une fois par essai.
  const unsureCued = useRef(0)
  useEffect(() => {
    if (state.view.kind !== 'review' || unsureCued.current === state.attempt) return
    unsureCued.current = state.attempt
    cue('tick', latest.current.props.cues, CUE_TEXT.unsure)
  }, [state])

  // Fin du repos après une série enregistrée : le compteur repart pour la série suivante.
  const resting = rest !== null
  const restSeen = useRef(false)
  useEffect(() => {
    if (state.view.kind !== 'saved') {
      restSeen.current = false
      return
    }
    if (resting) {
      restSeen.current = true
      return
    }
    if (restSeen.current) {
      restSeen.current = false
      dispatch({ type: 'restOver' })
    }
  }, [state.view, resting])

  /** Le compte de l'essai en cours, s'il a commencé. */
  const liveReps = (): number | null => {
    const attempt = attemptRef.current
    return attempt?.number === latest.current.state.attempt ? attempt.last.reps : null
  }

  const actions: SessionActions = {
    openCamera: () => {
      dispatch({ type: 'openCamera' })
      setCameraOn(true)
      if (!prefs.guides.includes(movement)) {
        setPrefs(writeCounterPrefs({ guides: [...prefs.guides, movement] }))
      }
    },
    showGuide: () => {
      dispatch({ type: 'showGuide' })
    },
    finish: () => {
      if (latest.current.state.view.kind !== 'live') return
      const attempt = currentAttempt()
      settle(attempt, attempt.counter.finish(counterNow(), 'manual'))
    },
    close: () => {
      const { state: current } = latest.current
      // Un deuxième toucher sur la croix ou le fond ne répond pas à la question à la place de la personne.
      if (current.view.kind === 'confirmClose') return
      if (current.view.kind === 'saving') {
        closeWhenSaved.current = true
        return
      }
      const unsaved = unsavedReps(current, liveReps())
      if (unsaved.reps > 0) dispatch({ type: 'askClose', ...unsaved })
      else onClose()
    },
    keepCounting: () => {
      dispatch({ type: 'keepCounting' })
    },
    closeNow: onClose,
    retry: () => {
      if (latest.current.state.view.kind === 'problem') {
        retriedFrom.current = camera.state
        camera.retry()
      }
      dispatch({ type: 'retry' })
    },
    adjust: (reps) => {
      dispatch({ type: 'adjust', reps })
    },
    addDoubtful: () => {
      dispatch({ type: 'addDoubtful' })
    },
    save: () => {
      dispatch({ type: 'save' })
    },
    discard: () => {
      dispatch({ type: 'discard' })
    },
    continueSet: () => {
      dispatch({ type: 'continueSet' })
    },
    nextSet: () => {
      dispatch({ type: 'nextSet' })
      skipRest()
    },
    correct: () => {
      dispatch({ type: 'correct' })
    },
    cancelCorrect: () => {
      dispatch({ type: 'cancelCorrect' })
    },
    saveCorrection: async (reps) => {
      const setId = latest.current.state.setId
      try {
        await save((w) => updateSet(w, exercise.id, setId, { reps }))
      } catch {
        return false
      }
      dispatch({ type: 'adjust', reps })
      dispatch({ type: 'corrected' })
      return true
    },
    switchCamera: () => {
      setPrefs(writeCounterPrefs({ facing: prefs.facing === 'user' ? 'environment' : 'user' }))
    },
    toggleDebug: () => {
      setPrefs(writeCounterPrefs({ debug: !prefs.debug }))
    },
    setDelegate: (delegate) => {
      setPrefs(writeCounterPrefs({ delegate }))
    },
    exportPoints: () => {
      const { result } = state
      if (!result) return
      const from = attemptRef.current?.offset ?? 0
      const at = new Date()
      const name = exportFileName(movement, at)
      const frame = lastFrameRef.current
      const delegate = camera.stats.delegate ?? opened.delegate
      const fixture = recorder.toFixture({
        name: name.replace(/\.json$/, ''),
        movement,
        exerciseId: exercise.exerciseId,
        kind: 'set',
        // Le compte attendu : celui enregistré (ou vérifié), pas celui du compteur, moins celui d'où l'essai part.
        expected: { reps: expectedReps(state, from) },
        split: 'check',
        source: `Compteur caméra de CaliTrack, ${exerciseName}, ${format(at, 'yyyy-MM-dd HH:mm')}`,
        licence: 'À préciser avant d’ajouter le fichier au dépôt',
        estimator: `mediapipe-0.10.35-lite-${delegate.toLowerCase()}`,
        notes: `Compté par l’appli : ${String(result.reps - from)}${from > 0 ? ` de plus que ${String(from)}` : ''}, ${result.confident ? 'sûr' : `à vérifier (${result.reasons.join(', ')})`}, fin : ${result.endedBy}`,
        fps: 15,
        width: frame?.width ?? 640,
        height: frame?.height ?? 480,
      })
      void shareOrDownload(jsonFile(name, JSON.stringify({ ...fixture, fps: measuredFps(fixture.frames) })))
    },
  }

  const view = state.view.kind
  return {
    state,
    snapshot: shown?.attempt === state.attempt ? shown.snapshot : null,
    camera,
    wakeLock,
    prefs,
    actions,
    rest,
    cameraOn,
    canExport:
      state.result !== null &&
      (view === 'saved' || view === 'saving' || view === 'review' || view === 'empty'),
    validated: SPECS[movement].validated,
  }
}
