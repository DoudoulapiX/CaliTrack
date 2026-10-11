import { useSyncExternalStore } from 'react'
import { cue, type CueOptions } from './cues'

/*
 * Minuteur de repos entre deux séries. Il vit en dehors des écrans (on peut changer d'onglet
 * pendant le repos) et il est gardé dans le téléphone : rouvrir l'appli retrouve le repos en cours.
 * Les trois dernières secondes font un petit bip, la fin un bip plus long (et une annonce).
 */

export interface RestState {
  workoutId: string
  /** Fin du repos, en millisecondes depuis 1970. */
  endsAt: number
  /** Durée prévue en secondes, pour la barre d'avancement. */
  totalSec: number
  /** Ce qui vient ensuite, à l'écran : « Tractions · série 2 sur 3 ». */
  next: string | null
  /** La même chose, à voix haute : « Tractions, série 2 sur 3 ». */
  announce: string | null
  cues: CueOptions
}

const STORAGE_KEY = 'calitrack.rest'
/** Un signal en retard de plus que ça (appli restée en arrière-plan) n'est pas joué. */
const LATE_MS = 1500
/** Bips du décompte, en secondes avant la fin. */
const COUNTDOWN_SEC = [3, 2, 1]

let state: RestState | null = null
let loaded = false
let timers: ReturnType<typeof setTimeout>[] = []
const listeners = new Set<() => void>()

function read(): RestState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<RestState> | null
    if (
      !value ||
      typeof value.workoutId !== 'string' ||
      typeof value.endsAt !== 'number' ||
      typeof value.totalSec !== 'number'
    ) {
      return null
    }
    return {
      workoutId: value.workoutId,
      endsAt: value.endsAt,
      totalSec: value.totalSec,
      next: typeof value.next === 'string' ? value.next : null,
      announce: typeof value.announce === 'string' ? value.announce : null,
      cues: { sound: value.cues?.sound !== false, voice: value.cues?.voice === true },
    }
  } catch {
    return null
  }
}

function write(next: RestState | null): void {
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Stockage plein ou interdit : le repos continue, sans survivre à une fermeture.
  }
}

/** Joue un signal prévu à `expectedAt`, sauf s'il arrive trop tard. */
function onTime(expectedAt: number, play: () => void): void {
  if (Date.now() - expectedAt <= LATE_MS) play()
}

function schedule(): void {
  for (const timer of timers) clearTimeout(timer)
  timers = []
  const current = state
  if (!current) return
  const remaining = current.endsAt - Date.now()
  if (remaining <= 0) {
    // Repos fini pendant que l'appli était fermée.
    state = null
    write(null)
    return
  }
  for (const sec of COUNTDOWN_SEC) {
    const expectedAt = current.endsAt - sec * 1000
    if (remaining > sec * 1000) {
      timers.push(
        setTimeout(
          () => {
            onTime(expectedAt, () => {
              cue('tick', current.cues)
            })
          },
          remaining - sec * 1000,
        ),
      )
    }
  }
  timers.push(
    setTimeout(() => {
      finish(current)
    }, remaining),
  )
}

function finish(ended: RestState): void {
  if (state !== ended) return
  onTime(ended.endsAt, () => {
    cue('go', ended.cues, ended.announce ? `C’est reparti : ${ended.announce}` : 'C’est reparti')
  })
  update(null)
}

function emit(): void {
  for (const listener of listeners) listener()
}

function update(next: RestState | null): void {
  state = next
  write(next)
  schedule()
  emit()
}

function ensureLoaded(): void {
  if (loaded) return
  loaded = true
  state = read()
  schedule()
}

export interface StartRest {
  workoutId: string
  seconds: number
  next: string | null
  announce: string | null
  cues: CueOptions
}

/** Lance (ou relance) le repos. */
export function startRest({ workoutId, seconds, next, announce, cues }: StartRest): void {
  ensureLoaded()
  if (seconds <= 0) {
    update(null)
    return
  }
  update({ workoutId, endsAt: Date.now() + seconds * 1000, totalSec: seconds, next, announce, cues })
}

/** Ajoute ou retire du temps au repos en cours ; à zéro, le repos s'arrête. */
export function adjustRest(deltaSec: number): void {
  ensureLoaded()
  if (!state) return
  const endsAt = state.endsAt + deltaSec * 1000
  if (endsAt <= Date.now()) {
    update(null)
    return
  }
  update({ ...state, endsAt, totalSec: Math.max(1, state.totalSec + deltaSec) })
}

/** Arrête le repos sans signal. */
export function skipRest(): void {
  ensureLoaded()
  if (state) update(null)
}

/** Secondes restantes (arrondies au-dessus : « 0:01 » jusqu'à la fin). */
export function restRemainingSec(rest: Pick<RestState, 'endsAt'>, nowMs: number): number {
  return Math.max(0, Math.ceil((rest.endsAt - nowMs) / 1000))
}

function subscribe(listener: () => void): () => void {
  ensureLoaded()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): RestState | null {
  ensureLoaded()
  return state
}

/** Le repos en cours, s'il y en a un. */
export function useRest(): RestState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
