import type { ProgressionChange } from '@/db/types'
import { describeChange, formatPrescription, formatRest, formatTarget } from './format'

const NAMES: Record<string, string> = { pullup: 'Tractions', 'pullup-band': 'Tractions avec élastique' }
const nameOf = (id: string) => NAMES[id] ?? id

const change = (patch: Partial<ProgressionChange>): ProgressionChange => ({
  slotId: 's',
  fromExerciseId: 'pullup',
  toExerciseId: 'pullup',
  fromTarget: { kind: 'reps', min: 5, max: 8 },
  toTarget: { kind: 'reps', min: 5, max: 8 },
  fromLoadKg: null,
  toLoadKg: null,
  kind: 'keep',
  ...patch,
})

describe('textes du programme', () => {
  it('écrit les fourchettes', () => {
    expect(formatTarget({ kind: 'reps', min: 5, max: 8 })).toBe('5 à 8 rép.')
    expect(formatTarget({ kind: 'reps', min: 10, max: 10 })).toBe('10 rép.')
    expect(formatTarget({ kind: 'time', min: 20, max: 40 })).toBe('20 à 40 s')
    expect(formatTarget({ kind: 'time', min: 60, max: 90 })).toBe('1 min à 1 min 30 s')
  })

  it('écrit une prescription complète', () => {
    const slot = { sets: 3, target: { kind: 'reps' as const, min: 5, max: 8 }, loadKg: 10 }
    expect(formatPrescription(slot, { unilateral: true }, 'kg')).toBe('3 × 5 à 8 rép. par côté · 10 kg')
    expect(formatPrescription({ ...slot, sets: 1, loadKg: null }, undefined, 'kg')).toBe('5 à 8 rép.')
    expect(formatRest(90)).toBe('repos 1 min 30 s')
    expect(formatRest(0)).toBe('')
  })

  it('explique chaque changement en une phrase', () => {
    const text = (patch: Partial<ProgressionChange>) => describeChange(change(patch), nameOf, 'kg')
    expect(text({ kind: 'levelUp', toExerciseId: 'pullup-band' })).toBe(
      'Objectif atteint\u00a0: la prochaine fois, Tractions avec élastique (5 à 8 rép.).',
    )
    expect(text({ kind: 'moreLoad', fromLoadKg: 5, toLoadKg: 7.5 })).toBe(
      'Objectif atteint\u00a0: la prochaine fois, 7,5 kg.',
    )
    expect(text({ kind: 'moreLoad', toLoadKg: 5 })).toBe(
      'Objectif atteint\u00a0: la prochaine fois, avec 5 kg de lest.',
    )
    expect(text({ kind: 'moreReps', toTarget: { kind: 'reps', min: 6, max: 9 } })).toBe(
      'Objectif atteint\u00a0: la prochaine fois, 6 à 9 rép.',
    )
    expect(text({ kind: 'levelDown', toExerciseId: 'pullup-band' })).toBe(
      'Deux séances difficiles\u00a0: retour à Tractions avec élastique (5 à 8 rép.) pour consolider.',
    )
    expect(text({ kind: 'lessLoad', fromLoadKg: 5, toLoadKg: null })).toBe(
      'Deux séances difficiles\u00a0: sans lest la prochaine fois, pour consolider.',
    )
    expect(text({ kind: 'lessLoad', fromLoadKg: 10, toLoadKg: 8 })).toBe(
      'Deux séances difficiles\u00a0: 8 kg la prochaine fois, pour consolider.',
    )
    expect(text({ kind: 'lessReps', toTarget: { kind: 'reps', min: 4, max: 7 } })).toBe(
      'Deux séances difficiles\u00a0: nouvel objectif, 4 à 7 rép.',
    )
    expect(text({ kind: 'keep' })).toMatch(/^Objectif atteint\u00a0: c’est le plus dur prévu ici/)
  })
})
