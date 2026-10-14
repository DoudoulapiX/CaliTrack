import { clamp, median } from './geometry.ts'
import { COUNTER_PARAMS } from './specs.ts'
import type { CounterParams } from './types.ts'

/*
 * Cadence d'une série : les répétitions loin du groupe principal (se mettre en place, reposer les haltères) sont
 * douteuses, et une pause bien plus longue que l'intervalle habituel termine la série.
 */

export type CadenceParams = Pick<CounterParams, 'cadenceGapFactor' | 'cadenceGapMs'>
export type IdleParams = Pick<CounterParams, 'idleBefore3Ms' | 'idleFactor' | 'idleMinMs' | 'idleMaxMs'>

/** Intervalles entre répétitions successives. */
function intervals(times: readonly number[]): number[] {
  return times.slice(1).map((t, i) => t - (times[i] ?? t))
}

/**
 * Coupe la série aux pauses plus longues que max(facteur × intervalle médian, médiane + marge). Le plus grand
 * groupe est la série ; les autres groupes de moins de 3 répétitions sont douteux (ceux de 3 ou plus restent :
 * séries avec pause). Rien n'est touché sous 4 répétitions.
 */
export function trimByCadence(
  times: readonly number[],
  params: CadenceParams = COUNTER_PARAMS,
): { kept: number[]; doubtful: number[] } {
  if (times.length < 4) return { kept: [...times], doubtful: [] }
  const usual = median(intervals(times))
  const cut = Math.max(params.cadenceGapFactor * usual, usual + params.cadenceGapMs)
  const groups: number[][] = []
  let group: number[] = []
  for (const [i, t] of times.entries()) {
    if (i > 0 && t - (times[i - 1] ?? t) > cut) {
      groups.push(group)
      group = []
    }
    group.push(t)
  }
  groups.push(group)
  // Le plus grand groupe ; à égalité, le premier.
  const main = groups.reduce((a, b) => (b.length > a.length ? b : a))
  const kept: number[] = []
  const doubtful: number[] = []
  for (const g of groups) (g === main || g.length >= 3 ? kept : doubtful).push(...g)
  return { kept, doubtful }
}

/**
 * Temps sans répétition qui termine la série : idleBefore3Ms avant la troisième répétition, ensuite
 * idleFactor × l'intervalle médian, borné entre idleMinMs et idleMaxMs.
 */
export function idleLimit(times: readonly number[], params: IdleParams = COUNTER_PARAMS): number {
  if (times.length < 3) return params.idleBefore3Ms
  return clamp(params.idleFactor * median(intervals(times)), params.idleMinMs, params.idleMaxMs)
}
