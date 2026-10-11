import type { Grade, GradeScale } from '@/db/types'
import { hslToHex } from '@/lib/color'

export const VERTICAL_ART_SCALE_ID = 'vertical-art'
export const FONTAINEBLEAU_SCALE_ID = 'fontainebleau'

/**
 * Couleurs des salles Vertical’Art, de la plus facile à la plus difficile, avec l'équivalence
 * Fontainebleau observée (table publique de Kaskad Coaching, pas une norme officielle).
 * Modifiable dans l'appli si la salle change ses couleurs.
 */
export const VERTICAL_ART_GRADES: Grade[] = [
  { key: 'orange', label: 'Orange', color: '#f97316', font: '4 – 4+' },
  { key: 'vert', label: 'Vert', color: '#16a34a', font: '5A – 5C' },
  { key: 'bleu', label: 'Bleu', color: '#2563eb', font: '6A – 6B' },
  { key: 'rouge', label: 'Rouge', color: '#dc2626', font: '6B+ – 6C+' },
  { key: 'noir', label: 'Noir', color: '#18181b', font: '7A – 7B' },
  { key: 'violet', label: 'Violet', color: '#7c3aed', font: '7B+ – 7C+' },
]

const FONT_LABELS = [
  '3',
  '4',
  '4+',
  '5A',
  '5B',
  '5C',
  '6A',
  '6A+',
  '6B',
  '6B+',
  '6C',
  '6C+',
  '7A',
  '7A+',
  '7B',
  '7B+',
  '7C',
  '7C+',
  '8A',
  '8A+',
  '8B',
  '8B+',
  '8C',
] as const

function fontColor(index: number, total: number): string {
  // Dégradé du vert (facile) au rouge puis violet (difficile).
  return hslToHex(140 - (index / (total - 1)) * 200, 70, 42)
}

export const FONTAINEBLEAU_GRADES: Grade[] = FONT_LABELS.map((label, i) => ({
  key: `f${label.toLowerCase().replace('+', 'plus')}`,
  label,
  color: fontColor(i, FONT_LABELS.length),
  font: label,
}))

export function defaultGradeScales(): GradeScale[] {
  return [
    { id: VERTICAL_ART_SCALE_ID, name: 'Vertical’Art', grades: VERTICAL_ART_GRADES, builtIn: true },
    { id: FONTAINEBLEAU_SCALE_ID, name: 'Fontainebleau', grades: FONTAINEBLEAU_GRADES, builtIn: true },
  ]
}

/** Rang d'un niveau dans son échelle (0 = le plus facile), -1 si inconnu. */
export function gradeIndex(scale: GradeScale, key: string): number {
  return scale.grades.findIndex((g) => g.key === key)
}

export function findGrade(scale: GradeScale, key: string): Grade | undefined {
  return scale.grades.find((g) => g.key === key)
}

/** L'échelle d'origine d'une échelle fournie avec l'appli (pour revenir à ses couleurs). */
export function builtInScale(id: string): GradeScale | undefined {
  return defaultGradeScales().find((scale) => scale.id === id)
}

/* ------------------------------------------------------------------ */
/* Modification des échelles                                           */
/* ------------------------------------------------------------------ */

/** Couleurs proposées pour un niveau (les couleurs de prises les plus courantes). */
export const GRADE_COLORS: readonly { name: string; color: string }[] = [
  { name: 'Blanc', color: '#f4f4f5' },
  { name: 'Jaune', color: '#facc15' },
  { name: 'Orange', color: '#f97316' },
  { name: 'Vert clair', color: '#84cc16' },
  { name: 'Vert', color: '#16a34a' },
  { name: 'Turquoise', color: '#14b8a6' },
  { name: 'Bleu clair', color: '#38bdf8' },
  { name: 'Bleu', color: '#2563eb' },
  { name: 'Violet', color: '#7c3aed' },
  { name: 'Rose', color: '#ec4899' },
  { name: 'Rouge', color: '#dc2626' },
  { name: 'Marron', color: '#92400e' },
  { name: 'Gris', color: '#71717a' },
  { name: 'Noir', color: '#18181b' },
]

export const MAX_GRADES = 40
export const GRADE_LABEL_MAX = 20
export const SCALE_NAME_MAX = 30

export interface GradeDraft {
  label: string
  color: string
  font: string
}

export function gradeDraftOf(grade: Grade): GradeDraft {
  return { label: grade.label, color: grade.color, font: grade.font }
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Ce qui empêche d'enregistrer le niveau (key : celui que l'on modifie, null pour un nouveau). */
export function gradeDraftError(scale: GradeScale, draft: GradeDraft, key: string | null): string | null {
  const label = draft.label.trim()
  if (label === '') return 'Donne un nom au niveau.'
  if (label.length > GRADE_LABEL_MAX) return `Le nom fait au plus ${String(GRADE_LABEL_MAX)} caractères.`
  const same = label.toLocaleLowerCase('fr')
  if (scale.grades.some((g) => g.key !== key && g.label.trim().toLocaleLowerCase('fr') === same)) {
    return 'Ce nom existe déjà dans cette échelle.'
  }
  if (!HEX_COLOR.test(draft.color)) return 'Choisis une couleur.'
  if (key === null && scale.grades.length >= MAX_GRADES) {
    return `Une échelle compte au plus ${String(MAX_GRADES)} niveaux.`
  }
  return null
}

/** Identifiant d'un nouveau niveau, tiré de son nom et unique dans l'échelle. */
export function newGradeKey(scale: GradeScale, label: string): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/\+/g, 'plus')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'niveau'
  const taken = new Set(scale.grades.map((g) => g.key))
  let key = base
  for (let n = 2; taken.has(key); n++) key = `${base}-${String(n)}`
  return key
}

function cleanDraft(draft: GradeDraft): GradeDraft {
  return { label: draft.label.trim(), color: draft.color.toLowerCase(), font: draft.font.trim() }
}

/** Ajoute un niveau, le plus dur de l'échelle. */
export function withGradeAdded(scale: GradeScale, draft: GradeDraft): GradeScale {
  const clean = cleanDraft(draft)
  return { ...scale, grades: [...scale.grades, { key: newGradeKey(scale, clean.label), ...clean }] }
}

/** Renomme ou recolore un niveau : il garde son identifiant (les blocs déjà notés le suivent). */
export function withGradeChanged(scale: GradeScale, key: string, draft: GradeDraft): GradeScale {
  return {
    ...scale,
    grades: scale.grades.map((g) => (g.key === key ? { ...g, ...cleanDraft(draft) } : g)),
  }
}

/** Déplace un niveau d'un cran : vers les plus faciles (-1) ou les plus durs (+1). */
export function withGradeMoved(scale: GradeScale, key: string, delta: -1 | 1): GradeScale {
  const from = gradeIndex(scale, key)
  const to = from + delta
  if (from < 0 || to < 0 || to >= scale.grades.length) return scale
  const grades = [...scale.grades]
  const [moved] = grades.splice(from, 1)
  if (moved) grades.splice(to, 0, moved)
  return { ...scale, grades }
}

export function withoutGrade(scale: GradeScale, key: string): GradeScale {
  return { ...scale, grades: scale.grades.filter((g) => g.key !== key) }
}

export function scaleNameError(name: string): string | null {
  const clean = name.trim()
  if (clean === '') return 'Donne un nom à l’échelle.'
  if (clean.length > SCALE_NAME_MAX) return `Le nom fait au plus ${String(SCALE_NAME_MAX)} caractères.`
  return null
}

/** Nouvelle échelle (une autre salle, par exemple), partant des niveaux d'une échelle existante. */
export function copyScale(from: GradeScale, name: string, id: string): GradeScale {
  return { id, name: name.trim(), grades: from.grades.map((g) => ({ ...g })), builtIn: false }
}
