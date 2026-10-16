/** Les fichiers de points des vraies séries (src/test/reps), lus et validés pour les tests. */
import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { repFixtureSchema, type RepFixture } from '@/content/reps/fixture'

export const REP_FIXTURES_DIR = join(process.cwd(), 'src/test/reps')

/** Un fichier de points validé ; son nom (`name`) doit être celui du fichier. */
export function readRepFixture(path: string): RepFixture {
  const result = repFixtureSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
  if (!result.success) throw new Error(`${basename(path)} : ${result.error.message}`)
  if (`${result.data.name}.json` !== basename(path)) {
    throw new Error(`${basename(path)} : le nom dans le fichier est « ${result.data.name} »`)
  }
  return result.data
}

/** Le fichier `<name>.json` du dossier. */
export function loadRepFixture(name: string, dir = REP_FIXTURES_DIR): RepFixture {
  return readRepFixture(join(dir, `${name}.json`))
}

/** Tous les fichiers .json du dossier, triés par nom : un nouveau fichier est pris sans changer le code. */
export function loadRepFixtures(dir = REP_FIXTURES_DIR): RepFixture[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => readRepFixture(join(dir, file)))
}
