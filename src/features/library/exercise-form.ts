import type {
  EquipmentKind,
  Exercise,
  ExerciseCategory,
  ExerciseLevel,
  ExerciseMeasure,
  Muscle,
} from '@/db/types'
import { MUSCLE_ORDER } from '@/content/exercises/labels'
import { frenchSpacing } from '@/lib/typography'

export const NAME_MAX = 60

export interface ExerciseForm {
  name: string
  category: ExerciseCategory
  level: ExerciseLevel
  measure: ExerciseMeasure
  unilateral: boolean
  primary: Muscle[]
  secondary: Muscle[]
  equipment: EquipmentKind[][]
  steps: string
  tips: string
}

export const EMPTY_FORM: ExerciseForm = {
  name: '',
  category: 'strength',
  level: 'beginner',
  measure: 'reps',
  unilateral: false,
  primary: [],
  secondary: [],
  equipment: [],
  steps: '',
  tips: '',
}

/** Remet les espaces normales pour l'édition (les insécables sont recalculées à l'enregistrement). */
function plain(text: string): string {
  return text.replace(/\u00a0/g, ' ')
}

export function formFromExercise(exercise: Exercise, copy: boolean): ExerciseForm {
  const name = plain(exercise.name)
  const suffix = ' (ma version)'
  return {
    name: copy ? `${name.slice(0, NAME_MAX - suffix.length)}${suffix}` : name,
    category: exercise.category,
    level: exercise.level,
    measure: exercise.measure,
    unilateral: exercise.unilateral,
    primary: [...exercise.primaryMuscles],
    secondary: [...exercise.secondaryMuscles],
    equipment: exercise.equipment.map((group) => [...group]),
    steps: exercise.instructions.map(plain).join('\n'),
    tips: exercise.tips.map(plain).join('\n'),
  }
}

/** Une ligne par étape ; les numéros ou tirets tapés en début de ligne sont retirés. */
export function textLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) =>
      line
        .trim()
        .replace(/^(\d+\s*[.)-]|[-•*])\s*/, '')
        .trim(),
    )
    .filter((line) => line !== '')
    .map(frenchSpacing)
}

export function validateForm(form: ExerciseForm): string | null {
  const name = form.name.trim()
  if (name.length < 2) return 'Donne un nom à l’exercice.'
  if (name.length > NAME_MAX) return `Le nom ne doit pas dépasser ${NAME_MAX} caractères.`
  return null
}

/** Construit l'exercice personnel à enregistrer. `base` : l'exercice modifié ou copié. */
export function exerciseFromForm(form: ExerciseForm, id: string, base: Exercise | null): Exercise {
  return {
    id,
    name: frenchSpacing(form.name.trim().replace(/\s+/g, ' ')),
    nameEn: base?.nameEn ?? null,
    aliases: base ? [...base.aliases] : [],
    category: form.category,
    level: form.level,
    mechanic: base?.mechanic ?? null,
    force: base?.force ?? null,
    primaryMuscles: MUSCLE_ORDER.filter((m) => form.primary.includes(m)),
    secondaryMuscles: MUSCLE_ORDER.filter((m) => form.secondary.includes(m) && !form.primary.includes(m)),
    equipment: form.equipment.filter((group) => group.length > 0),
    instructions: textLines(form.steps),
    tips: textLines(form.tips),
    // Une copie garde l'animation et les photos de l'exercice d'origine.
    figure: base?.figure ?? null,
    frames: base ? [...base.frames] : [],
    measure: form.measure,
    unilateral: form.unilateral,
    source: 'custom',
  }
}
