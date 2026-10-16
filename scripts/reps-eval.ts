// Justesse du compteur caméra sur les fichiers de points : tableau par mouvement, puis les séries mal comptées.
// Usage : npm run reps:eval -- [dossier=src/test/reps] [--fps 8] [--variant dip:supportRatio]
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  accuracyTable,
  formatAccuracyTable,
  formatMisses,
  runFixtures,
} from '../src/content/reps/evaluate.ts'
import { repFixtureSchema, type RepFixture } from '../src/content/reps/fixture.ts'
import { SPEC_ALTERNATIVES } from '../src/content/reps/specs.ts'

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const options = new Set(['--fps', '--variant'])
const positional = process.argv
  .slice(2)
  .filter((arg, i, all) => !arg.startsWith('--') && !options.has(all[i - 1] ?? ''))
const dir = positional[0] ?? 'src/test/reps'
const fpsText = option('--fps')
const fps = fpsText === undefined ? undefined : Number(fpsText)
if (fps !== undefined && !(fps > 0)) {
  fail(`--fps ${fpsText} : un nombre d'images par seconde, par exemple 8`)
}
const variantName = option('--variant')
const alternative = variantName === undefined ? undefined : SPEC_ALTERNATIVES[variantName]
if (variantName !== undefined && alternative === undefined) {
  fail(`--variant ${variantName} inconnue ; au choix : ${Object.keys(SPEC_ALTERNATIVES).join(', ')}`)
}

const fixtures: RepFixture[] = readdirSync(dir)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => {
    const parsed = repFixtureSchema.safeParse(JSON.parse(readFileSync(join(dir, file), 'utf8')))
    if (!parsed.success) fail(`${file} : ${parsed.error.message}`)
    return parsed.data
  })

const runs = runFixtures(fixtures, {
  ...(fps === undefined ? {} : { fps }),
  ...(alternative === undefined ? {} : { alternative }),
})
console.log(
  `${fixtures.length} fichiers de ${dir}, ${fps === undefined ? 'toutes les images' : `${fps} images par seconde`}` +
    (variantName === undefined ? '' : `, seuils ${variantName}`),
)
console.log('')
console.log(formatAccuracyTable(accuracyTable(runs)))
const misses = formatMisses(runs)
console.log('')
console.log(misses.length === 0 ? 'Aucune série mal comptée.' : `Mal comptées :\n${misses.join('\n')}`)
