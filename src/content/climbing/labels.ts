import type { BoulderAttempt, BoulderResult, ClimbStyle, Grade } from '@/db/types'

/** Résultat d'un bloc, tel qu'on le lit. */
export const RESULT_LABEL: Record<BoulderResult, string> = {
  flash: 'Flash',
  sent: 'Réussi',
  project: 'En projet',
  failed: 'Pas réussi',
}

/** Styles de bloc, dans l'ordre où on les propose. */
export const STYLE_LABEL: Record<ClimbStyle, string> = {
  slab: 'Dalle',
  vertical: 'Vertical',
  overhang: 'Dévers',
  roof: 'Toit',
  crimps: 'Réglettes',
  slopers: 'Plats',
  pinches: 'Pinces',
  pockets: 'Trous',
  jugs: 'Bacs',
  dyno: 'Jeté',
  coordination: 'Coordination',
  compression: 'Compression',
  technical: 'Technique',
  endurance: 'Résistance',
}

export const CLIMB_STYLES = Object.keys(STYLE_LABEL) as ClimbStyle[]

function tries(count: number): string {
  return `${String(count)} essai${count > 1 ? 's' : ''}`
}

/** « Flash », « Réussi en 3 essais », « En projet · 4 essais », « Pas réussi · 1 essai ». */
export function boulderLine(boulder: Pick<BoulderAttempt, 'result' | 'attempts'>): string {
  switch (boulder.result) {
    case 'flash':
      return 'Flash'
    case 'sent':
      return `Réussi en ${tries(boulder.attempts)}`
    case 'project':
      return `En projet · ${tries(boulder.attempts)}`
    case 'failed':
      return `Pas réussi · ${tries(boulder.attempts)}`
  }
}

/** Couleurs de prises au pluriel (« orange », « marron » et les couleurs composées ne s'accordent pas). */
const COLOR_PLURAL: Partial<Record<string, string>> = {
  orange: 'orange',
  vert: 'verts',
  'vert clair': 'vert clair',
  bleu: 'bleus',
  'bleu clair': 'bleu clair',
  turquoise: 'turquoise',
  rouge: 'rouges',
  noir: 'noirs',
  violet: 'violets',
  jaune: 'jaunes',
  blanc: 'blancs',
  rose: 'roses',
  gris: 'gris',
  marron: 'marron',
}

/** « 1 bloc noir », « 5 blocs bleus », « 3 blocs en 6A ». */
export function bouldersOf(count: number, grade: Pick<Grade, 'label'>): string {
  const noun = count > 1 ? 'blocs' : 'bloc'
  const color = grade.label.trim().toLowerCase()
  const plural = COLOR_PLURAL[color]
  if (plural === undefined) return `${String(count)} ${noun} en ${grade.label.trim()}`
  return `${String(count)} ${noun} ${count > 1 ? plural : color}`
}

/** Équivalence Fontainebleau à montrer à côté du niveau (rien si c'est déjà son nom). */
export function fontOf(grade: Pick<Grade, 'label' | 'font'>): string | null {
  const font = grade.font.trim()
  return font === '' || font === grade.label.trim() ? null : font
}
