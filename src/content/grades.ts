import type { Grade, GradeScale } from '@/db/types'

export const VERTICAL_ART_SCALE_ID = 'vertical-art'
export const FONTAINEBLEAU_SCALE_ID = 'fontainebleau'

/**
 * Couleurs des salles Vertical’Art, de la plus facile à la plus difficile, avec l'équivalence
 * Fontainebleau observée (table publique de Kaskad Coaching, pas une norme officielle).
 * Modifiable dans l'appli si la salle change ses couleurs.
 */
export const VERTICAL_ART_GRADES: Grade[] = [
  { key: 'orange', label: 'Orange', color: '#f97316', textColor: '#ffffff', font: '4 – 4+' },
  { key: 'vert', label: 'Vert', color: '#16a34a', textColor: '#ffffff', font: '5A – 5C' },
  { key: 'bleu', label: 'Bleu', color: '#2563eb', textColor: '#ffffff', font: '6A – 6B' },
  { key: 'rouge', label: 'Rouge', color: '#dc2626', textColor: '#ffffff', font: '6B+ – 6C+' },
  { key: 'noir', label: 'Noir', color: '#18181b', textColor: '#ffffff', font: '7A – 7B' },
  { key: 'violet', label: 'Violet', color: '#7c3aed', textColor: '#ffffff', font: '7B+ – 7C+' },
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
  const hue = 140 - (index / (total - 1)) * 200
  const h = ((hue % 360) + 360) % 360
  return `hsl(${Math.round(h)} 70% 42%)`
}

export const FONTAINEBLEAU_GRADES: Grade[] = FONT_LABELS.map((label, i) => ({
  key: `f${label.toLowerCase().replace('+', 'plus')}`,
  label,
  color: fontColor(i, FONT_LABELS.length),
  textColor: '#ffffff',
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
