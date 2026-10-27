import { loadRepFixtures } from '@/test/reps-fixtures'
import { accuracyTable, formatMisses, runFixture, runFixtures, type FixtureRun } from './evaluate'
import { COUNTED_EXERCISES } from './movements'
import { COUNTED_MOVEMENTS, defaultVariant, SPECS, specFor } from './specs'

/*
 * Cibles de justesse (conception, 6.5), jamais assouplies : changer un seuil de specs.ts doit les garder toutes.
 * Pour chaque mouvement validé, sur toutes ses séries, à 15 images par seconde puis 10 et 8 (téléphone lent) :
 * au moins 90 % de comptes exacts, tous à une répétition près, erreur moyenne d'au plus 0,15, au plus 2 % de
 * comptes sûrs mais faux, et aucun sur les fichiers de vérification. Aucun fichier négatif ne compte quoi que ce
 * soit. Un mouvement en essai n'est jamais sûr de lui.
 */

const FIXTURES = loadRepFixtures()
const VALIDATED = COUNTED_MOVEMENTS.filter((movement) => SPECS[movement].validated)
const TRIAL = COUNTED_MOVEMENTS.filter((movement) => !SPECS[movement].validated)
/** Les variantes de COUNTED_EXERCISES en essai alors que leur mouvement est validé, chacune une fois. */
const TRIAL_VARIANTS = [
  ...new Map(
    Object.values(COUNTED_EXERCISES)
      .filter((variant) => SPECS[variant.movement].validated && !specFor(variant).validated)
      .map((variant) => [JSON.stringify(variant), variant]),
  ).values(),
]

const cache = new Map<number, FixtureRun[]>()
/** Toutes les séries rejouées à cette cadence (15 : toutes les images des fichiers). */
function runsAt(fps: number): FixtureRun[] {
  let runs = cache.get(fps)
  if (!runs) {
    runs = runFixtures(FIXTURES, fps === 15 ? {} : { fps })
    cache.set(fps, runs)
  }
  return runs
}

describe.each([15, 10, 8])('à %d images par seconde', (fps) => {
  it.each(VALIDATED)('%s : atteint les cibles de justesse', (movement) => {
    const runs = runsAt(fps).filter((run) => run.movement === movement)
    const row = accuracyTable(runs).find((line) => line.movement === movement)!
    const misses = formatMisses(runs.filter((run) => run.fixture.kind === 'set')).join('\n')
    expect(row.sets).toBeGreaterThan(0)
    expect(row.exact / row.sets, misses).toBeGreaterThanOrEqual(0.9)
    expect(row.within1, misses).toBe(row.sets)
    expect(row.meanAbsError, misses).toBeLessThanOrEqual(0.15)
    expect(row.confidentWrong / row.sets, misses).toBeLessThanOrEqual(0.02)
    expect(row.confidentWrongCheck, misses).toBe(0)
  })

  it.each(VALIDATED)('%s : aucune série jugée trop lente pour être sûre', (movement) => {
    // Sinon la cible des comptes sûrs mais faux ne verrait qu'une partie des séries.
    const slow = runsAt(fps)
      .filter((run) => run.movement === movement && run.fixture.kind === 'set')
      .filter((run) => run.result.reasons.includes('slow'))
    expect(slow.map((run) => run.fixture.name)).toEqual([])
  })

  it('ne compte rien sur les fichiers négatifs, quel que soit le mouvement', () => {
    const negatives = runsAt(fps).filter((run) => run.fixture.kind === 'negative')
    expect(negatives.length).toBe(
      FIXTURES.filter((f) => f.kind === 'negative').length * COUNTED_MOVEMENTS.length,
    )
    expect(formatMisses(negatives)).toEqual([])
  })
})

describe('mouvements en essai', () => {
  it.each(TRIAL)('%s : jamais sûr, sur aucun fichier', (movement) => {
    const sure = FIXTURES.filter(
      (fixture) => runFixture(fixture, { variant: defaultVariant(movement) }).confident,
    ).map((fixture) => fixture.name)
    expect(sure).toEqual([])
  })

  it.each(TRIAL_VARIANTS)(
    'variante en essai d’un mouvement validé %j : jamais sûre, sur aucun fichier',
    (variant) => {
      const sure = FIXTURES.filter((fixture) => runFixture(fixture, { variant }).confident).map(
        (fixture) => fixture.name,
      )
      expect(sure).toEqual([])
    },
  )

  it('les curls sauf l’alterné aux haltères : même compte, à vérifier', () => {
    expect(TRIAL_VARIANTS).toEqual([
      { movement: 'curl', overrides: { trial: true } },
      { movement: 'curl', overrides: { trial: true, armPairs: true } },
      { movement: 'curl', overrides: { bothArms: true } },
    ])
    const curls = FIXTURES.filter((fixture) => fixture.movement === 'curl')
    expect(curls.length).toBeGreaterThan(0)
    for (const fixture of curls) {
      const result = runFixture(fixture, { variant: TRIAL_VARIANTS[0] })
      expect(result).toMatchObject({ reps: fixture.expected.reps, confident: false, reasons: ['trial'] })
    }
  })

  it('le curl marteau alterné compte par paire : la moitié des bras des séries alternées, à vérifier', () => {
    const curls = FIXTURES.filter((fixture) => fixture.movement === 'curl')
    for (const fixture of curls) {
      const result = runFixture(fixture, {
        variant: { movement: 'curl', overrides: { trial: true, armPairs: true } },
      })
      expect(result, fixture.name).toMatchObject({
        reps: fixture.expected.reps / 2,
        confident: false,
        reasons: ['trial'],
      })
    }
  })
})
