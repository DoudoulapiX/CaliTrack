import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { loadRepFixture, loadRepFixtures, REP_FIXTURES_DIR } from '@/test/reps-fixtures'
import { runFixture } from './evaluate'
import { COUNTED_MOVEMENTS, defaultVariant } from './specs'

/*
 * Chaque fichier de src/test/reps donne ce qu'il attend : un nouveau fichier est pris sans changer ce test.
 * `expected.confident: false` : le compteur ne doit pas être sûr de lui (son compte, alors à vérifier par la
 * personne, est mesuré par accuracy.test.ts et npm run reps:eval).
 */

const FIXTURES = loadRepFixtures()
const SETS = FIXTURES.filter((fixture) => fixture.kind === 'set').map(
  (fixture) => [fixture.name, fixture] as const,
)
const NEGATIVES = FIXTURES.filter((fixture) => fixture.kind === 'negative').map(
  (fixture) => [fixture.name, fixture] as const,
)

describe('fichiers de points (src/test/reps)', () => {
  it('couvrent séries réelles, négatifs et séries fabriquées, dans 3 Mo au plus', () => {
    const names = FIXTURES.map((fixture) => fixture.name)
    const count = (prefix: string) => names.filter((name) => name.startsWith(prefix)).length
    expect(count('mmfit-squats-')).toBeGreaterThanOrEqual(8)
    expect(count('mmfit-curls-')).toBeGreaterThanOrEqual(8)
    expect(count('mmfit-pushups-front-')).toBeGreaterThanOrEqual(3)
    expect(count('mmfit-negative-')).toBeGreaterThanOrEqual(4)
    expect(names).toEqual(expect.arrayContaining(['sports2d-walk', 'synth-squat-3', 'synth-pullup-3']))
    const bytes = readdirSync(REP_FIXTURES_DIR).reduce(
      (sum, file) => sum + statSync(join(REP_FIXTURES_DIR, file)).size,
      0,
    )
    expect(bytes).toBeLessThanOrEqual(3_000_000)
  })

  it('disent d’où ils viennent et sous quelle licence', () => {
    for (const fixture of FIXTURES) {
      expect(fixture.source.length, fixture.name).toBeGreaterThan(10)
      expect(fixture.licence.length, fixture.name).toBeGreaterThan(5)
      if (fixture.name.startsWith('mmfit-')) {
        expect(fixture.licence).toContain('CC BY 4.0')
        expect(fixture.fps).toBe(15)
      }
      if (fixture.name.startsWith('sports2d-')) {
        expect(fixture.licence).toContain('BSD-3-Clause')
      }
    }
    // Les crédits complets sont dans le README du dossier (licence BSD entière pour Sports2D).
    const readme = readFileSync(join(REP_FIXTURES_DIR, 'README.md'), 'utf8')
    for (const credit of [
      'Strömbäck, Sheng Huang et Valentin Radu',
      'CC BY 4.0',
      'Copyright (c) 2022, perfanalytics',
      'EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.',
      'npm run reps:add',
    ]) {
      expect(readme).toContain(credit)
    }
  })

  it.each(SETS)('%s : compte attendu', (_, fixture) => {
    const result = runFixture(fixture)
    if (fixture.expected.confident === false) {
      expect(result.confident).toBe(false)
      return
    }
    expect(result.reps).toBe(fixture.expected.reps)
    if (fixture.expected.confident !== undefined) expect(result.confident).toBe(fixture.expected.confident)
  })

  it.each(NEGATIVES)('%s : rien n’est compté, quel que soit le mouvement', (_, fixture) => {
    const counts = COUNTED_MOVEMENTS.map((movement) => [
      movement,
      runFixture(fixture, { variant: defaultVariant(movement) }).reps,
    ])
    expect(counts).toEqual(COUNTED_MOVEMENTS.map((movement) => [movement, 0]))
  })

  it('synth-pullup-3 : 3 tractions, à vérifier car en essai (rejoué par les tests de l’écran)', () => {
    expect(runFixture(loadRepFixture('synth-pullup-3'))).toMatchObject({
      reps: 3,
      confident: false,
      reasons: ['trial'],
    })
  })
})
