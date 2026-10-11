import { gradeScaleSchema } from '@/db/schema'
import type { GradeScale } from '@/db/types'
import {
  builtInScale,
  copyScale,
  defaultGradeScales,
  findGrade,
  GRADE_COLORS,
  GRADE_LABEL_MAX,
  gradeDraftError,
  gradeDraftOf,
  gradeIndex,
  MAX_GRADES,
  newGradeKey,
  SCALE_NAME_MAX,
  scaleNameError,
  VERTICAL_ART_SCALE_ID,
  withGradeAdded,
  withGradeChanged,
  withGradeMoved,
  withoutGrade,
} from './grades'

function verticalArt(): GradeScale {
  const scale = builtInScale(VERTICAL_ART_SCALE_ID)
  if (!scale) throw new Error('échelle')
  return scale
}

describe('échelles fournies', () => {
  it('sont valides, Vertical’Art avec la table confirmée', () => {
    for (const scale of defaultGradeScales()) expect(gradeScaleSchema.safeParse(scale).success).toBe(true)
    expect(verticalArt().grades.map((g) => `${g.label} ${g.font}`)).toEqual([
      'Orange 4 – 4+',
      'Vert 5A – 5C',
      'Bleu 6A – 6B',
      'Rouge 6B+ – 6C+',
      'Noir 7A – 7B',
      'Violet 7B+ – 7C+',
    ])
    const font = defaultGradeScales().find((s) => s.id === 'fontainebleau')
    expect(font?.grades.slice(0, 4).map((g) => g.key)).toEqual(['f3', 'f4', 'f4plus', 'f5a'])
  })

  it('propose des couleurs valides et toutes différentes', () => {
    const colors = GRADE_COLORS.map((c) => c.color)
    expect(new Set(colors).size).toBe(colors.length)
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('modification des niveaux', () => {
  it('vérifie le nom, la couleur et le nombre de niveaux', () => {
    const scale = verticalArt()
    const draft = { label: 'Jaune', color: '#facc15', font: '' }
    expect(gradeDraftError(scale, draft, null)).toBeNull()
    expect(gradeDraftError(scale, { ...draft, label: '   ' }, null)).toBe('Donne un nom au niveau.')
    expect(gradeDraftError(scale, { ...draft, label: 'x'.repeat(GRADE_LABEL_MAX + 1) }, null)).toMatch(
      /au plus 20 caractères/,
    )
    expect(gradeDraftError(scale, { ...draft, label: ' bleu ' }, null)).toBe(
      'Ce nom existe déjà dans cette échelle.',
    )
    // Le niveau que l'on modifie peut garder son nom.
    expect(gradeDraftError(scale, { ...draft, label: 'Bleu' }, 'bleu')).toBeNull()
    expect(gradeDraftError(scale, { ...draft, color: 'jaune' }, null)).toBe('Choisis une couleur.')
    const full = {
      ...scale,
      grades: Array.from({ length: MAX_GRADES }, (_, i) => ({
        key: `n${String(i)}`,
        label: `N${String(i)}`,
        color: '#71717a',
        font: '',
      })),
    }
    expect(gradeDraftError(full, draft, null)).toMatch(/au plus 40 niveaux/)
    expect(gradeDraftError(full, { ...draft, label: 'N0 bis' }, 'n0')).toBeNull()
  })

  it('crée un identifiant lisible et unique', () => {
    const scale = verticalArt()
    expect(newGradeKey(scale, 'Vert clair')).toBe('vert-clair')
    expect(newGradeKey(scale, '6A+')).toBe('6aplus')
    expect(newGradeKey(scale, 'Bleu')).toBe('bleu-2')
    const extra = { key: 'bleu-2', label: 'Bleu 2', color: '#2563eb', font: '' }
    expect(newGradeKey({ ...scale, grades: [...scale.grades, extra] }, 'Bleu')).toBe('bleu-3')
    expect(newGradeKey(scale, 'Été')).toBe('ete')
    expect(newGradeKey(scale, '!!!')).toBe('niveau')
  })

  it('ajoute un niveau en haut de l’échelle, propre', () => {
    const next = withGradeAdded(verticalArt(), { label: '  Blanc ', color: '#F4F4F5', font: ' 8A ' })
    expect(next.grades.at(-1)).toEqual({ key: 'blanc', label: 'Blanc', color: '#f4f4f5', font: '8A' })
    expect(gradeScaleSchema.safeParse(next).success).toBe(true)
  })

  it('modifie un niveau sans changer son identifiant', () => {
    const scale = verticalArt()
    const blue = findGrade(scale, 'bleu')
    if (!blue) throw new Error('bleu')
    const next = withGradeChanged(scale, 'bleu', {
      ...gradeDraftOf(blue),
      label: 'Bleu ciel',
      color: '#38BDF8',
    })
    expect(findGrade(next, 'bleu')).toEqual({
      key: 'bleu',
      label: 'Bleu ciel',
      color: '#38bdf8',
      font: '6A – 6B',
    })
    expect(gradeIndex(next, 'bleu')).toBe(2)
  })

  it('déplace un niveau d’un cran, sans sortir de l’échelle', () => {
    const scale = verticalArt()
    const keys = (s: GradeScale) => s.grades.map((g) => g.key)
    expect(keys(withGradeMoved(scale, 'bleu', 1))).toEqual([
      'orange',
      'vert',
      'rouge',
      'bleu',
      'noir',
      'violet',
    ])
    expect(keys(withGradeMoved(scale, 'bleu', -1))).toEqual([
      'orange',
      'bleu',
      'vert',
      'rouge',
      'noir',
      'violet',
    ])
    expect(withGradeMoved(scale, 'orange', -1)).toBe(scale)
    expect(withGradeMoved(scale, 'violet', 1)).toBe(scale)
    expect(withGradeMoved(scale, 'inconnu', 1)).toBe(scale)
    expect(keys(withoutGrade(scale, 'noir'))).toEqual(['orange', 'vert', 'bleu', 'rouge', 'violet'])
  })
})

describe('échelles créées', () => {
  it('vérifie le nom d’une échelle', () => {
    expect(scaleNameError('Arkose')).toBeNull()
    expect(scaleNameError('  ')).toBe('Donne un nom à l’échelle.')
    expect(scaleNameError('x'.repeat(SCALE_NAME_MAX + 1))).toMatch(/au plus 30 caractères/)
  })

  it('copie les niveaux d’une échelle existante', () => {
    const from = verticalArt()
    const copy = copyScale(from, '  Arkose  ', 'arkose-1')
    expect(copy).toMatchObject({ id: 'arkose-1', name: 'Arkose', builtIn: false })
    expect(copy.grades).toEqual(from.grades)
    expect(copy.grades[0]).not.toBe(from.grades[0])
    expect(gradeScaleSchema.safeParse(copy).success).toBe(true)
  })

  it('refuse une échelle vide ou avec deux niveaux identiques', () => {
    const scale = verticalArt()
    expect(gradeScaleSchema.safeParse({ ...scale, grades: [] }).success).toBe(false)
    const twice = { ...scale, grades: [...scale.grades, { ...scale.grades[0], key: 'orange' }] }
    expect(gradeScaleSchema.safeParse(twice).success).toBe(false)
  })
})
