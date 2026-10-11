import { describe, expect, it } from 'vitest'
import type { EquipmentItem, EquipmentKind, Exercise } from '@/db/types'
import {
  EMPTY_FILTER,
  activeFilterCount,
  buildCatalog,
  canDoWith,
  equipmentSummary,
  exerciseName,
  filterExercises,
  initialOf,
  isBodyweightOnly,
  kindsAt,
  loadFedbExercises,
  normalizeText,
  queryTokens,
  searchScore,
  type FilterContext,
} from './catalog'
import { CALITRACK_EXERCISES } from './calisthenics'

function exercise(partial: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise {
  return {
    nameEn: null,
    aliases: [],
    category: 'strength',
    level: 'beginner',
    mechanic: 'compound',
    force: null,
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    equipment: [],
    instructions: ['Fais ceci.', 'Puis cela.'],
    tips: [],
    figure: null,
    frames: [],
    measure: 'reps',
    unilateral: false,
    source: 'custom',
    ...partial,
  }
}

function item(kind: EquipmentKind, locationIds: string[] = []): EquipmentItem {
  return {
    id: `${kind}-${locationIds.join('-')}`,
    kind,
    name: kind,
    weightsKg: [],
    bandLevels: [],
    note: '',
    locationIds,
    createdAt: '2026-10-10T10:00:00.000Z',
  }
}

const NO_CONTEXT: FilterContext = { available: new Set(['floor', 'wall']), favoriteIds: new Set() }

describe('normalizeText et queryTokens', () => {
  it('ignore accents, majuscules, ligatures et ponctuation', () => {
    expect(normalizeText('Élévation latérale – Épaules')).toBe('elevation laterale epaules')
    expect(normalizeText('Muscle-up : cœur’s')).toBe('muscle up coeur s')
  })

  it('ignore le « s » final des mots de plus de trois lettres', () => {
    expect(queryTokens('Pompes  abdos dips')).toEqual(['pompe', 'abdo', 'dip'])
    expect(queryTokens('bas')).toEqual(['bas'])
    expect(queryTokens('  ')).toEqual([])
  })
})

describe('buildCatalog', () => {
  it('réunit toutes les sources, trie par nom et ignore un identifiant déjà pris', () => {
    const first = CALITRACK_EXERCISES[0]
    if (!first) throw new Error('aucun exercice CaliTrack')
    const fedb = [exercise({ id: 'fedb-1', name: 'Zébu', source: 'fedb' })]
    const custom = [
      exercise({ id: 'perso-1', name: 'Écart facial' }),
      exercise({ id: first.id, name: 'Copie qui ne doit pas remplacer' }),
    ]
    const catalog = buildCatalog(fedb, custom)
    expect(catalog.all).toHaveLength(CALITRACK_EXERCISES.length + 2)
    expect(catalog.byId.get(first.id)?.name).toBe(first.name)
    const names = catalog.all.map((e) => e.name)
    expect(names.indexOf('Écart facial')).toBeLessThan(names.indexOf('Zébu'))
    expect(names.at(-1)).toBe('Zébu')
    expect(exerciseName(catalog, 'perso-1')).toBe('Écart facial')
    expect(exerciseName(catalog, 'inconnu')).toBe('Exercice supprimé')
  })
})

describe('matériel', () => {
  it('liste le matériel d’un lieu, plus le sol et le mur', () => {
    const items = [item('dumbbells', ['home']), item('pullupBar', ['gym']), item('bands')]
    expect([...kindsAt(items, 'home')].sort()).toEqual(['bands', 'dumbbells', 'floor', 'wall'])
    expect([...kindsAt(items, null)].sort()).toEqual(['bands', 'dumbbells', 'floor', 'pullupBar', 'wall'])
  })

  it('accepte une alternative complète, pas une alternative partielle', () => {
    const rowing = exercise({ id: 'r', name: 'Rowing', equipment: [['dumbbells', 'bench'], ['trx']] })
    expect(canDoWith(rowing, new Set(['dumbbells']))).toBe(false)
    expect(canDoWith(rowing, new Set(['dumbbells', 'bench']))).toBe(true)
    expect(canDoWith(rowing, new Set(['trx']))).toBe(true)
    expect(canDoWith(exercise({ id: 'p', name: 'Pompe' }), new Set())).toBe(true)
  })

  it('reconnaît les exercices sans matériel', () => {
    expect(isBodyweightOnly(exercise({ id: 'a', name: 'A', equipment: [['wall']] }))).toBe(true)
    expect(isBodyweightOnly(exercise({ id: 'b', name: 'B', equipment: [['mat']] }))).toBe(true)
    expect(isBodyweightOnly(exercise({ id: 'c', name: 'C', equipment: [['pullupBar']] }))).toBe(false)
  })

  it('résume le matériel en français', () => {
    expect(equipmentSummary([])).toBe('Sans matériel')
    expect(equipmentSummary([['pullupBar'], ['rings']])).toBe('Barre de traction ou Anneaux')
    expect(equipmentSummary([['dumbbells', 'bench']])).toBe('Haltères + Banc')
    expect(equipmentSummary([['barbell'], ['dumbbells'], ['kettlebell']])).toBe(
      'Barre de musculation ou Haltères…',
    )
  })
})

describe('recherche et filtres', () => {
  const list = [
    exercise({
      id: 'pull',
      name: 'Traction',
      nameEn: 'Pull-up',
      primaryMuscles: ['lats'],
      equipment: [['pullupBar']],
      source: 'calitrack',
    }),
    exercise({ id: 'aus', name: 'Traction australienne', primaryMuscles: ['middle back'], source: 'fedb' }),
    exercise({ id: 'row', name: 'Rowing haltère', primaryMuscles: ['lats'], equipment: [['dumbbells']] }),
    exercise({ id: 'lat', name: 'Élévation latérale', primaryMuscles: ['shoulders'], level: 'intermediate' }),
    exercise({
      id: 'stretch',
      name: 'Étirement des épaules',
      category: 'stretching',
      primaryMuscles: ['shoulders'],
    }),
  ]

  it('classe le nom exact en premier', () => {
    const result = filterExercises(list, { ...EMPTY_FILTER, query: 'traction' }, NO_CONTEXT)
    expect(result.map((e) => e.id)).toEqual(['pull', 'aus'])
  })

  it('trouve par nom anglais, muscle ou matériel, sans tenir compte des accents', () => {
    expect(filterExercises(list, { ...EMPTY_FILTER, query: 'pull up' }, NO_CONTEXT).map((e) => e.id)).toEqual(
      ['pull'],
    )
    expect(filterExercises(list, { ...EMPTY_FILTER, query: 'epaules' }, NO_CONTEXT).map((e) => e.id)).toEqual(
      ['stretch', 'lat'],
    )
    expect(filterExercises(list, { ...EMPTY_FILTER, query: 'haltere' }, NO_CONTEXT).map((e) => e.id)).toEqual(
      ['row'],
    )
    expect(filterExercises(list, { ...EMPTY_FILTER, query: 'xyz' }, NO_CONTEXT)).toEqual([])
  })

  it('met le nom exact (au pluriel près) devant, puis les variantes les plus accessibles', () => {
    const pulls = [
      exercise({ id: 'one', name: 'Traction à un bras', level: 'expert' }),
      exercise({ id: 'neg', name: 'Tractions négatives', level: 'beginner' }),
      exercise({ id: 'std', name: 'Tractions', level: 'intermediate' }),
    ]
    expect(
      filterExercises(pulls, { ...EMPTY_FILTER, query: 'traction' }, NO_CONTEXT).map((e) => e.id),
    ).toEqual(['std', 'neg', 'one'])
  })

  it('garde l’ordre d’origine sans recherche', () => {
    expect(filterExercises(list, EMPTY_FILTER, NO_CONTEXT).map((e) => e.id)).toEqual(list.map((e) => e.id))
  })

  it('combine les filtres', () => {
    const context: FilterContext = {
      available: new Set(['floor', 'wall', 'dumbbells']),
      favoriteIds: new Set(['row', 'lat']),
    }
    const ids = (filter: Partial<typeof EMPTY_FILTER>) =>
      filterExercises(list, { ...EMPTY_FILTER, ...filter }, context).map((e) => e.id)
    expect(ids({ muscles: ['lats'] })).toEqual(['pull', 'row'])
    expect(ids({ equipment: 'mine' })).toEqual(['aus', 'row', 'lat', 'stretch'])
    expect(ids({ equipment: 'none' })).toEqual(['aus', 'lat', 'stretch'])
    expect(ids({ favorites: true })).toEqual(['row', 'lat'])
    expect(ids({ categories: ['stretching'] })).toEqual(['stretch'])
    expect(ids({ levels: ['intermediate'] })).toEqual(['lat'])
    expect(ids({ sources: ['calitrack', 'fedb'] })).toEqual(['pull', 'aus'])
    expect(ids({ muscles: ['lats'], equipment: 'mine', query: 'rowing' })).toEqual(['row'])
  })

  it('compte les filtres actifs', () => {
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0)
    expect(
      activeFilterCount({ ...EMPTY_FILTER, query: 'x', muscles: ['lats', 'chest'], favorites: true }),
    ).toBe(2)
  })

  it('donne une pertinence nulle quand un mot manque', () => {
    const pull = list[0]
    if (!pull) throw new Error('liste vide')
    expect(searchScore(pull, ['traction', 'zzz'])).toBe(0)
    expect(searchScore(pull, [])).toBe(1)
  })

  it('regroupe par initiale', () => {
    expect(initialOf('Élévation')).toBe('E')
    expect(initialOf('3/4 relevé')).toBe('#')
  })
})

describe('loadFedbExercises', () => {
  it('charge la base générale une seule fois', async () => {
    const promise = loadFedbExercises()
    expect(loadFedbExercises()).toBe(promise)
    const list = await promise
    expect(list.length).toBeGreaterThan(800)
    expect(await loadFedbExercises()).toBe(list)
  })
})
