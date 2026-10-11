// Construit src/data/fedb.json à partir de la base free-exercise-db et des traductions françaises.
// À relancer après chaque modification de scripts/i18n/fr ou de src/content/exercises.
//
// Usage : node scripts/build-exercises.ts
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildFedbExercises,
  serializeExercises,
  translationProblems,
} from '../src/content/exercises/fedb-build.ts'
import { readFedbSources } from './fedb-sources.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { raws, translations, duplicates } = readFedbSources(root)
const problems = [
  ...translationProblems(raws, translations),
  ...duplicates.map((d) => `${d} : traduite deux fois`),
]
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
const list = buildFedbExercises(raws, translations)
writeFileSync(join(root, 'src/data/fedb.json'), serializeExercises(list))
const translated = list.filter((exercise) => Object.hasOwn(translations, exercise.id))
const withSteps = translated.filter((exercise) => translations[exercise.id]?.s)
console.log(
  `${list.length} fiches écrites dans src/data/fedb.json : ${translated.length} noms traduits, ${withSteps.length} explications traduites.`,
)
