import { decimate, decodeFixture, type RepFixture } from './fixture.ts'
import { COUNTED_EXERCISES } from './movements.ts'
import { createRepCounter } from './rep-counter.ts'
import { COUNTED_MOVEMENTS, defaultVariant, type MovementSpec } from './specs.ts'
import type { CountedMovement, CountedVariant, CounterParams, CounterResult } from './types.ts'

/*
 * Rejoue les fichiers de points (src/test/reps) dans le compteur et mesure sa justesse : fixtures.test.ts,
 * accuracy.test.ts et `npm run reps:eval`.
 */

/** Temps laissé au compteur après la dernière image pour finir la série tout seul. */
export const AFTER_LAST_FRAME_MS = 25_000

export interface RunOptions {
  /** Variante comptée (sinon celle de l'exercice du fichier, ou celle de base du mouvement). */
  readonly variant?: CountedVariant
  /** Images par seconde gardées (comme un téléphone plus lent) ; sinon toutes. */
  readonly fps?: number
  readonly params?: Partial<CounterParams>
  /** Seuils du mouvement à essayer (SPEC_ALTERNATIVES). */
  readonly spec?: Partial<MovementSpec>
}

/** La variante comptée d'une série filmée : celle de son exercice, sinon celle de base de son mouvement. */
export function fixtureVariant(fixture: RepFixture): CountedVariant {
  const movement = fixture.movement
  if (movement === null) throw new Error(`${fixture.name} : rien n’est compté ici, préciser le mouvement`)
  const id = fixture.exerciseId
  const counted = id !== null && Object.hasOwn(COUNTED_EXERCISES, id) ? COUNTED_EXERCISES[id] : undefined
  return counted?.movement === movement ? counted : defaultVariant(movement)
}

/** Pousse chaque image, puis laisse passer jusqu'à 25 s sans image, puis termine (« Terminer la série »). */
export function runFixture(fixture: RepFixture, options: RunOptions = {}): CounterResult {
  const variant = options.variant ?? fixtureVariant(fixture)
  const decoded = decodeFixture(fixture)
  const frames = options.fps === undefined ? decoded : decimate(decoded, options.fps)
  const counter = createRepCounter({
    variant,
    ...(options.params ? { params: options.params } : {}),
    ...(options.spec ? { spec: options.spec } : {}),
  })
  for (const frame of frames) {
    counter.push(frame)
    if (counter.result) return counter.result
  }
  const last = frames.at(-1)?.t ?? 0
  const step = 1000 / (options.fps ?? fixture.fps)
  for (let t = last + step; t <= last + AFTER_LAST_FRAME_MS; t += step) {
    counter.tick(t)
    if (counter.result) return counter.result
  }
  return counter.finish(last + AFTER_LAST_FRAME_MS, 'manual')
}

export interface FixtureRun {
  readonly fixture: RepFixture
  readonly movement: CountedMovement
  readonly result: CounterResult
}

/**
 * Chaque série avec son mouvement ; chaque fichier négatif avec les cinq mouvements. `alternative` : seuils
 * essayés à la place de ceux d'un mouvement.
 */
export function runFixtures(
  fixtures: readonly RepFixture[],
  options: Omit<RunOptions, 'variant' | 'spec'> & {
    readonly alternative?: { readonly movement: CountedMovement; readonly patch: Partial<MovementSpec> }
  } = {},
): FixtureRun[] {
  const { alternative, ...rest } = options
  const run = (fixture: RepFixture, variant: CountedVariant): FixtureRun => ({
    fixture,
    movement: variant.movement,
    result: runFixture(fixture, {
      ...rest,
      variant,
      ...(alternative?.movement === variant.movement ? { spec: alternative.patch } : {}),
    }),
  })
  return fixtures.flatMap((fixture) =>
    fixture.movement === null
      ? COUNTED_MOVEMENTS.map((movement) => run(fixture, defaultVariant(movement)))
      : [run(fixture, fixtureVariant(fixture))],
  )
}

export interface AccuracyRow {
  readonly movement: CountedMovement
  /** Séries filmées de ce mouvement. */
  readonly sets: number
  readonly exact: number
  readonly within1: number
  /** Erreur absolue moyenne, en répétitions par série (0 sans série). */
  readonly meanAbsError: number
  /** Comptes sûrs (enregistrés tout seuls). */
  readonly confident: number
  /** Comptes sûrs mais faux : les erreurs silencieuses. */
  readonly confidentWrong: number
  /** Les mêmes, sur les fichiers de vérification (split 'check'). */
  readonly confidentWrongCheck: number
  /** Fichiers négatifs rejoués avec ce mouvement, et répétitions comptées à tort sur eux. */
  readonly negatives: number
  readonly falseReps: number
}

export function accuracyTable(runs: readonly FixtureRun[]): AccuracyRow[] {
  return COUNTED_MOVEMENTS.map((movement) => {
    const mine = runs.filter((run) => run.movement === movement)
    const sets = mine.filter((run) => run.fixture.kind === 'set')
    const negatives = mine.filter((run) => run.fixture.kind === 'negative')
    const error = (run: FixtureRun) => Math.abs(run.result.reps - run.fixture.expected.reps)
    const wrongConfident = sets.filter((run) => run.result.confident && error(run) > 0)
    return {
      movement,
      sets: sets.length,
      exact: sets.filter((run) => error(run) === 0).length,
      within1: sets.filter((run) => error(run) <= 1).length,
      meanAbsError: sets.length > 0 ? sets.reduce((sum, run) => sum + error(run), 0) / sets.length : 0,
      confident: sets.filter((run) => run.result.confident).length,
      confidentWrong: wrongConfident.length,
      confidentWrongCheck: wrongConfident.filter((run) => run.fixture.split === 'check').length,
      negatives: negatives.length,
      falseReps: negatives.reduce((sum, run) => sum + run.result.reps, 0),
    }
  })
}

/** Le tableau en texte, colonnes alignées (sortie de `npm run reps:eval`). */
export function formatAccuracyTable(rows: readonly AccuracyRow[]): string {
  const decimal = (value: number) => value.toFixed(2).replace('.', ',')
  const header = [
    'mouvement',
    'séries',
    'exactes',
    'à ±1',
    'erreur moy.',
    'sûres',
    'sûres fausses',
    'négatifs',
    'faux comptes',
  ]
  const lines = rows.map((row) => [
    row.movement,
    String(row.sets),
    `${row.exact}/${row.sets}`,
    `${row.within1}/${row.sets}`,
    decimal(row.meanAbsError),
    String(row.confident),
    `${row.confidentWrong} (vérif. ${row.confidentWrongCheck})`,
    String(row.negatives),
    String(row.falseReps),
  ])
  const table = [header, ...lines]
  const widths = header.map((_, column) => Math.max(...table.map((line) => (line[column] ?? '').length)))
  return table
    .map((line) =>
      line
        .map((cell, column) => cell.padEnd(widths[column] ?? 0))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

/** Les séries mal comptées, une par ligne : nom, compté / attendu, sûr ou non, raisons. */
export function formatMisses(runs: readonly FixtureRun[]): string[] {
  return runs
    .filter((run) => run.result.reps !== run.fixture.expected.reps)
    .map(({ fixture, movement, result }) => {
      const sure = result.confident ? 'sûr' : `à vérifier (${result.reasons.join(', ')})`
      return `${fixture.name} [${movement}] : ${result.reps} / ${fixture.expected.reps}, ${sure}, fin : ${result.endedBy}`
    })
}
