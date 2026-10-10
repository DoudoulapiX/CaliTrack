import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { exerciseSchema } from '@/db/schema'
import type { Exercise } from '@/db/types'
import { FIGURES, figureFor } from '@/content/figures/library'
import { readFedbSources } from '../../../scripts/fedb-sources.ts'
import { CALITRACK_EXERCISES, FEDB_MERGED_INTO } from './calisthenics'
import { buildFedbExercises, serializeExercises, translationProblems } from './fedb-build'
import { normalizeText } from './catalog'

const root = process.cwd()
const committed = readFileSync(join(root, 'src/data/fedb.json'), 'utf8')
const FEDB = JSON.parse(committed) as Exercise[]
const ALL: Exercise[] = [...CALITRACK_EXERCISES, ...FEDB]

/** Défauts de rédaction : apostrophe droite, espaces, ponctuation française. */
function textProblems(text: string, isName: boolean): string[] {
  const problems: string[] = []
  if (text.includes("'")) problems.push('apostrophe droite')
  if (text !== text.trim() || /\s{2,}/.test(text)) problems.push('espaces en trop')
  if (/ [:;!?%»]/.test(text)) problems.push('espace normale avant : ; ! ? % » (insécable attendue)')
  if (/[^\s\u00a0][;!?]/.test(text)) problems.push('espace manquante avant ; ! ?')
  if (/[^\s\u00a0\d]:/.test(text)) problems.push('espace manquante avant :')
  if (!isName && !/[.!?:)…]$/.test(text)) problems.push('ponctuation finale manquante')
  return problems
}

function exerciseTextProblems(list: readonly Exercise[]): string[] {
  return list.flatMap((exercise) =>
    [
      ...textProblems(exercise.name, true).map((p) => `${p} (nom)`),
      ...[...exercise.instructions, ...exercise.tips].flatMap((t) =>
        textProblems(t, false).map((p) => `${p} : ${t.slice(0, 60)}`),
      ),
    ].map((p) => `${exercise.id} : ${p}`),
  )
}

function missingFrames(list: readonly Exercise[]): string[] {
  return list.flatMap((exercise) =>
    exercise.frames
      .filter((frame) => !existsSync(join(root, 'public/ex', frame)))
      .map((f) => `${exercise.id} : ${f}`),
  )
}

function schemaErrors(list: readonly Exercise[]): string[] {
  return list.flatMap((exercise) => {
    const result = exerciseSchema.safeParse(exercise)
    return result.success ? [] : [`${exercise.id} : ${result.error.message}`]
  })
}

describe('exercices CaliTrack', () => {
  it('ont des identifiants uniques et lisibles', () => {
    const ids = CALITRACK_EXERCISES.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('respectent le schéma des exercices', () => {
    expect(schemaErrors(CALITRACK_EXERCISES)).toEqual([])
  })

  it('ont une animation qui existe', () => {
    const missing = CALITRACK_EXERCISES.filter((e) => e.figure !== null && !figureFor(e.figure)).map(
      (e) => e.id,
    )
    expect(missing).toEqual([])
  })

  it('utilisent toutes les animations dessinées', () => {
    const used = new Set(CALITRACK_EXERCISES.map((e) => e.figure))
    expect(Object.keys(FIGURES).filter((id) => !used.has(id))).toEqual([])
  })

  it('ont des explications complètes', () => {
    for (const e of CALITRACK_EXERCISES) {
      expect(e.instructions.length, e.id).toBeGreaterThanOrEqual(2)
      expect(e.primaryMuscles.length, e.id).toBeGreaterThan(0)
      expect(
        e.primaryMuscles.filter((m) => e.secondaryMuscles.includes(m)),
        e.id,
      ).toEqual([])
    }
  })

  it('fusionnent des fiches qui existent dans la base générale', () => {
    const { raws } = readFedbSources(root)
    const ids = new Set(raws.map((raw) => raw.id))
    expect(Object.keys(FEDB_MERGED_INTO).filter((id) => !ids.has(id))).toEqual([])
  })
})

describe('base générale (src/data/fedb.json)', () => {
  const { raws, translations, duplicates } = readFedbSources(root)

  it('est à jour (sinon : npm run data:exercises)', () => {
    expect(serializeExercises(buildFedbExercises(raws, translations))).toBe(committed)
  })

  it('est entièrement traduite, sans doublon', () => {
    expect(translationProblems(raws, translations)).toEqual([])
    expect(duplicates).toEqual([])
    const untranslated = FEDB.filter((e) => !translations[e.id]?.s).map((e) => e.id)
    expect(untranslated).toEqual([])
  })

  it('respecte le schéma des exercices', () => {
    expect(schemaErrors(FEDB)).toEqual([])
  })

  it('ne réutilise aucun identifiant CaliTrack', () => {
    const caliIds = new Set(CALITRACK_EXERCISES.map((e) => e.id))
    expect(FEDB.filter((e) => caliIds.has(e.id)).map((e) => e.id)).toEqual([])
  })
})

describe('toutes les fiches', () => {
  it('ont un nom unique (accents et ponctuation ignorés)', () => {
    const seen = new Map<string, string>()
    const duplicates: string[] = []
    for (const e of ALL) {
      const key = normalizeText(e.name)
      const other = seen.get(key)
      if (other) duplicates.push(`${other} / ${e.id}`)
      else seen.set(key, e.id)
    }
    expect(duplicates).toEqual([])
  })

  it('ont des noms courts (lisibles sur iPhone)', () => {
    expect(ALL.filter((e) => e.name.length > 60).map((e) => e.id)).toEqual([])
  })

  it('suivent la typographie française', () => {
    expect(exerciseTextProblems(ALL)).toEqual([])
  })

  it('ont leurs photos dans public/ex', () => {
    expect(missingFrames(ALL)).toEqual([])
  })

  it('décrivent le matériel sans liste vide', () => {
    expect(ALL.filter((e) => e.equipment.some((group) => group.length === 0)).map((e) => e.id)).toEqual([])
  })
})
