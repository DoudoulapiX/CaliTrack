import { project, SYNTH_CAMERAS, SYNTH_FIXTURES, synthPose } from '@/test/pose-synth'
import {
  accuracyTable,
  AFTER_LAST_FRAME_MS,
  fixtureVariant,
  formatAccuracyTable,
  formatMisses,
  runFixture,
  runFixtures,
  type FixtureRun,
} from './evaluate'
import { encodeFixture, type FixtureMeta, type RepFixture } from './fixture'
import { COUNTED_MOVEMENTS } from './specs'
import type { CountedMovement, CounterResult } from './types'

const META: FixtureMeta = {
  name: 'essai',
  movement: 'squat',
  exerciseId: 'squat',
  kind: 'set',
  expected: { reps: 3 },
  split: 'tune',
  source: 'Fabriqué pour ce test',
  licence: 'Aucune',
  estimator: 'synthetic',
  fps: 15,
  width: 480,
  height: 640,
}

const fixture = (meta: Partial<FixtureMeta> = {}): RepFixture => encodeFixture({ ...META, ...meta }, [])

/** Debout immobile 6 s : rien à compter. */
const STANDING = encodeFixture(
  { ...META, name: 'debout', movement: null, exerciseId: null, kind: 'negative', expected: { reps: 0 } },
  Array.from({ length: 90 }, (_, i) =>
    project(synthPose('squat', 175), Math.round((i * 1000) / 15), { camera: SYNTH_CAMERAS.squat }),
  ),
)

const SQUATS = SYNTH_FIXTURES['synth-squat-3']!()
const PULLUPS = SYNTH_FIXTURES['synth-pullup-3']!()

describe('fixtureVariant', () => {
  it('prend la variante de l’exercice filmé, sinon celle de base du mouvement', () => {
    expect(fixtureVariant(fixture({ movement: 'curl', exerciseId: 'Barbell_Curl' }))).toEqual({
      movement: 'curl',
      overrides: { bothArms: true },
    })
    expect(fixtureVariant(fixture({ movement: 'pushup', exerciseId: 'pushup-knee' })).overrides).toEqual({
      bodyLine: 'knee',
    })
    for (const exerciseId of [null, 'Barbell_Curl', 'inconnu', 'constructor']) {
      expect(fixtureVariant(fixture({ exerciseId }))).toEqual({ movement: 'squat', overrides: {} })
    }
  })

  it('refuse un fichier où rien n’est compté', () => {
    expect(() => fixtureVariant(STANDING)).toThrow('debout : rien n’est compté ici')
  })
})

describe('runFixture', () => {
  it('rejoue la série et laisse le compteur finir', () => {
    expect(runFixture(SQUATS)).toMatchObject({ reps: 3, confident: true, endedBy: 'gone' })
    expect(runFixture(SQUATS, { fps: 8 })).toMatchObject({ reps: 3, endedBy: 'gone' })
    expect(runFixture(PULLUPS)).toMatchObject({ reps: 3, confident: false, reasons: ['trial'] })
  })

  it('termine à la main 25 s après la dernière image si la série ne finit pas seule', () => {
    expect(AFTER_LAST_FRAME_MS).toBe(25_000)
    expect(runFixture(SQUATS, { params: { armMs: 60_000 } })).toMatchObject({ reps: 0, endedBy: 'manual' })
    expect(runFixture(fixture())).toMatchObject({ reps: 0, endedBy: 'manual' })
  })

  it('essaie une autre variante ou d’autres seuils', () => {
    expect(runFixture(SQUATS, { spec: { flexed: 60 } })).toMatchObject({ reps: 0, partials: 3 })
    expect(runFixture(STANDING, { variant: { movement: 'curl', overrides: {} } }).reps).toBe(0)
  })
})

describe('runFixtures', () => {
  it('rejoue une série avec son mouvement, un fichier négatif avec les cinq', () => {
    const runs = runFixtures([SQUATS, STANDING, PULLUPS])
    expect(runs.map((run) => [run.fixture.name, run.movement, run.result.reps])).toEqual([
      ['synth-squat-3', 'squat', 3],
      ...COUNTED_MOVEMENTS.map((movement) => ['debout', movement, 0]),
      ['synth-pullup-3', 'pullup', 3],
    ])
  })

  it('applique les seuils essayés à leur seul mouvement, à la cadence demandée', () => {
    const runs = runFixtures([SQUATS, PULLUPS], {
      fps: 10,
      alternative: { movement: 'squat', patch: { flexed: 60 } },
    })
    expect(runs.map((run) => run.result.reps)).toEqual([0, 3])
  })
})

/** Une série rejouée, faite à la main. */
function run(
  movement: CountedMovement,
  expected: number,
  reps: number,
  confident: boolean,
  { kind = 'set', split = 'tune' }: { kind?: 'set' | 'negative'; split?: 'tune' | 'check' } = {},
): FixtureRun {
  const result: CounterResult = {
    reps,
    doubtful: 0,
    partials: 0,
    rejected: 0,
    confident,
    reasons: confident ? [] : ['doubtful'],
    endedBy: 'idle',
    repTimes: [],
  }
  return {
    fixture: fixture({
      name: `${movement}-${expected}-${reps}`,
      movement: kind === 'set' ? movement : null,
      kind,
      split,
      expected: { reps: expected },
    }),
    movement,
    result,
  }
}

const RUNS = [
  run('squat', 10, 10, true),
  run('squat', 8, 9, true),
  run('squat', 12, 14, false),
  run('squat', 5, 4, true, { split: 'check' }),
  run('squat', 0, 0, false, { kind: 'negative' }),
  run('squat', 0, 2, false, { kind: 'negative' }),
  run('curl', 10, 10, true),
  run('curl', 0, 0, false, { kind: 'negative' }),
]

describe('accuracyTable', () => {
  it('compte séries exactes, à une près, erreur moyenne et comptes sûrs mais faux', () => {
    const rows = accuracyTable(RUNS)
    expect(rows.map((row) => row.movement)).toEqual([...COUNTED_MOVEMENTS])
    expect(rows[0]).toEqual({
      movement: 'squat',
      sets: 4,
      exact: 1,
      within1: 3,
      meanAbsError: (0 + 1 + 2 + 1) / 4,
      confident: 3,
      confidentWrong: 2,
      confidentWrongCheck: 1,
      negatives: 2,
      falseReps: 2,
    })
    expect(rows.find((row) => row.movement === 'curl')).toMatchObject({
      sets: 1,
      exact: 1,
      meanAbsError: 0,
      negatives: 1,
      falseReps: 0,
    })
    expect(rows.find((row) => row.movement === 'dip')).toEqual({
      movement: 'dip',
      sets: 0,
      exact: 0,
      within1: 0,
      meanAbsError: 0,
      confident: 0,
      confidentWrong: 0,
      confidentWrongCheck: 0,
      negatives: 0,
      falseReps: 0,
    })
  })
})

describe('formatAccuracyTable', () => {
  it('aligne les colonnes, virgule décimale', () => {
    const rows = accuracyTable(RUNS).filter((row) => row.movement === 'squat' || row.movement === 'curl')
    expect(formatAccuracyTable(rows).split('\n')).toEqual([
      'mouvement  séries  exactes  à ±1  erreur moy.  sûres  sûres fausses  négatifs  faux comptes',
      'squat      4       1/4      3/4   1,00         3      2 (vérif. 1)   2         2',
      'curl       1       1/1      1/1   0,00         1      0 (vérif. 0)   1         0',
    ])
  })
})

describe('formatMisses', () => {
  it('liste les séries mal comptées', () => {
    expect(formatMisses(RUNS)).toEqual([
      'squat-8-9 [squat] : 9 / 8, sûr, fin : idle',
      'squat-12-14 [squat] : 14 / 12, à vérifier (doubtful), fin : idle',
      'squat-5-4 [squat] : 4 / 5, sûr, fin : idle',
      'squat-0-2 [squat] : 2 / 0, à vérifier (doubtful), fin : idle',
    ])
  })
})
