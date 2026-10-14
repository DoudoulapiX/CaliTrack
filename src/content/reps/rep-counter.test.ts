import { createRepCounter } from './rep-counter'
import type { PoseFrame } from './types'

const SQUAT = { movement: 'squat', overrides: {} } as const

const nobody = (t: number): PoseFrame => ({ t, width: 480, height: 640, image: null, world: null })
const someone = (t: number): PoseFrame => ({
  t,
  width: 480,
  height: 640,
  image: Array.from({ length: 33 }, () => [0.5, 0.5, 0.9] as const),
  world: Array.from({ length: 33 }, () => [0, 0, 0] as const),
})

describe('compteur (version d’attente)', () => {
  it('cherche sans jamais compter', () => {
    const counter = createRepCounter({ variant: SQUAT })
    expect(counter.snapshot).toMatchObject({ status: 'searching', reps: 0, hint: { kind: 'noPerson' } })
    expect(counter.push(someone(0))).toMatchObject({ status: 'searching', reps: 0, hint: null, event: null })
    expect(counter.push(nobody(66), 120).hint).toEqual({ kind: 'noPerson' })
    expect(counter.tick(5000).status).toBe('searching')
    expect(counter.result).toBeNull()
  })

  it('part des répétitions déjà comptées', () => {
    const counter = createRepCounter({ variant: SQUAT, offset: 7, params: { armMs: 500 } })
    expect(counter.push(someone(0)).reps).toBe(7)
    expect(counter.finish(100, 'manual').reps).toBe(7)
  })

  it('termine une seule fois, sans compte sûr', () => {
    const counter = createRepCounter({ variant: SQUAT })
    const result = counter.finish(1000, 'interrupted')
    expect(result).toEqual({
      reps: 0,
      doubtful: 0,
      partials: 0,
      rejected: 0,
      confident: false,
      reasons: ['fewReps', 'interrupted'],
      endedBy: 'interrupted',
      repTimes: [],
    })
    expect(counter.finish(2000, 'manual')).toBe(result)
    expect(counter.result).toBe(result)
    expect(counter.snapshot.status).toBe('ended')
    expect(counter.push(nobody(3000)).status).toBe('ended')
    expect(createRepCounter({ variant: SQUAT }).finish(0, 'manual').reasons).toEqual(['fewReps'])
  })
})
