import type {
  CounterParams,
  CounterResult,
  CounterSnapshot,
  CountedVariant,
  PoseFrame,
  UnsureReason,
} from './types.ts'

/*
 * Compteur d'une série : reçoit les images analysées, arme, compte, termine.
 * Version d'attente : il cherche sans fin (statut « searching ») et ne compte rien. Le vrai compteur la
 * remplace en gardant ces signatures.
 */

export interface RepCounterOptions {
  readonly variant: CountedVariant
  /** Répétitions déjà comptées pour cette série (« Continuer la série »). */
  readonly offset?: number
  readonly params?: Partial<CounterParams>
}

export interface RepCounter {
  /** light : lumière moyenne 0..255 de l'image, si mesurée. */
  push(frame: PoseFrame, light?: number | null): CounterSnapshot
  /** Pas d'image depuis un moment (caméra figée) : laisse passer le temps. */
  tick(t: number): CounterSnapshot
  /** Termine maintenant et rend le résultat ; un second appel rend le même. */
  finish(t: number, why: 'manual' | 'interrupted'): CounterResult
  /** Le résultat une fois la série terminée, sinon null. */
  readonly result: CounterResult | null
  readonly snapshot: CounterSnapshot
}

export function createRepCounter(options: RepCounterOptions): RepCounter {
  const reps = options.offset ?? 0
  let snapshot: CounterSnapshot = {
    status: 'searching',
    reps,
    partials: 0,
    hint: { kind: 'noPerson' },
    event: null,
    debug: {
      signal: null,
      flexed: 0,
      extended: 0,
      phase: 'unknown',
      side: null,
      visibility: 0,
      quality: 0,
      fps: 0,
      lastReject: null,
    },
    slow: false,
  }
  let result: CounterResult | null = null

  return {
    push(frame) {
      if (result === null) snapshot = { ...snapshot, hint: frame.image ? null : { kind: 'noPerson' } }
      return snapshot
    },
    tick() {
      return snapshot
    },
    finish(_t, why) {
      if (result) return result
      const reasons: UnsureReason[] = why === 'interrupted' ? ['fewReps', 'interrupted'] : ['fewReps']
      result = {
        reps,
        doubtful: 0,
        partials: 0,
        rejected: 0,
        confident: false,
        reasons,
        endedBy: why,
        repTimes: [],
      }
      snapshot = { ...snapshot, status: 'ended', hint: null }
      return result
    },
    get result() {
      return result
    },
    get snapshot() {
      return snapshot
    },
  }
}
