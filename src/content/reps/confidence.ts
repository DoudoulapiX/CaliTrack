import { COUNTER_PARAMS } from './specs.ts'
import type { CounterParams, EndReason, UnsureReason } from './types.ts'

/*
 * Un compte n'est enregistré tout seul que s'il est sûr : sinon l'écran demande de le vérifier, avec les raisons
 * (dans cet ordre, celui de UNSURE_TEXT).
 */

export interface JudgeInput {
  /** Répétitions vues pendant ce passage devant la caméra (sans celles déjà enregistrées, sans les douteuses). */
  readonly reps: number
  readonly doubtful: number
  /** Mouvements allés jusqu'en bas mais refusés, entre le départ et la dernière répétition. */
  readonly rejected: number
  /** Part des images utilisables et en position entre le départ et la dernière répétition. */
  readonly quality: number
  /** Images analysées par seconde depuis le départ (null : pas assez d'images pour le dire). */
  readonly fps: number | null
  readonly endedBy: EndReason
  /** Le mouvement est validé (sinon « en essai »). */
  readonly validated: boolean
}

export function judge(
  input: JudgeInput,
  params: Pick<CounterParams, 'confidentShare' | 'minFps'> = COUNTER_PARAMS,
): { confident: boolean; reasons: UnsureReason[] } {
  const reasons: UnsureReason[] = []
  if (input.quality < params.confidentShare) reasons.push('lost')
  if (input.doubtful > 0) reasons.push('doubtful')
  if (input.rejected > 0) reasons.push('rejected')
  if (input.reps < 2) reasons.push('fewReps')
  if (input.fps !== null && input.fps < params.minFps) reasons.push('slow')
  if (input.endedBy === 'interrupted') reasons.push('interrupted')
  if (!input.validated) reasons.push('trial')
  return { confident: reasons.length === 0, reasons }
}
