import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { FedbRaw, FedbTranslations } from '../src/content/exercises/fedb-build.ts'

export interface FedbSources {
  raws: FedbRaw[]
  translations: FedbTranslations
  /** Fiches traduites dans plusieurs fichiers. */
  duplicates: string[]
}

/** Lit la base d'origine et toutes les traductions françaises (scripts/i18n/fr/*.json). */
export function readFedbSources(root: string): FedbSources {
  const raws = JSON.parse(
    readFileSync(join(root, 'scripts/source/free-exercise-db.json'), 'utf8'),
  ) as FedbRaw[]
  const dir = join(root, 'scripts/i18n/fr')
  const translations: FedbTranslations = {}
  const duplicates: string[] = []
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()) {
    const part = JSON.parse(readFileSync(join(dir, file), 'utf8')) as FedbTranslations
    for (const [id, value] of Object.entries(part)) {
      if (Object.hasOwn(translations, id)) duplicates.push(`${id} (${file})`)
      translations[id] = value
    }
  }
  return { raws, translations, duplicates }
}
