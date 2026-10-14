import { judge, type JudgeInput } from './confidence'

const SURE: JudgeInput = {
  reps: 10,
  doubtful: 0,
  rejected: 0,
  quality: 0.95,
  fps: 14,
  endedBy: 'idle',
  validated: true,
}

describe('judge', () => {
  it('rend un compte sûr quand tout va bien', () => {
    expect(judge(SURE)).toEqual({ confident: true, reasons: [] })
    expect(judge({ ...SURE, reps: 2, quality: 0.85, fps: 8, endedBy: 'manual' }).confident).toBe(true)
    expect(judge({ ...SURE, fps: null }).confident).toBe(true)
  })

  it.each([
    [{ quality: 0.84 }, 'lost'],
    [{ doubtful: 2 }, 'doubtful'],
    [{ rejected: 1 }, 'rejected'],
    [{ reps: 1 }, 'fewReps'],
    [{ fps: 7.9 }, 'slow'],
    [{ endedBy: 'interrupted' }, 'interrupted'],
    [{ validated: false }, 'trial'],
  ] as const)('%o : à vérifier (%s)', (patch, reason) => {
    expect(judge({ ...SURE, ...patch })).toEqual({ confident: false, reasons: [reason] })
  })

  it('donne toutes les raisons, dans l’ordre de l’écran', () => {
    const input: JudgeInput = {
      reps: 1,
      doubtful: 1,
      rejected: 1,
      quality: 0.5,
      fps: 5,
      endedBy: 'interrupted',
      validated: false,
    }
    expect(judge(input).reasons).toEqual([
      'lost',
      'doubtful',
      'rejected',
      'fewReps',
      'slow',
      'interrupted',
      'trial',
    ])
  })
})
