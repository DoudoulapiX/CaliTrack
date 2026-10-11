import type { Exercise, ExerciseCategory, ExerciseLevel, ExerciseMeasure, Muscle } from '@/db/types'

export const MUSCLE_LABEL: Record<Muscle, string> = {
  abdominals: 'Abdominaux',
  abductors: 'Abducteurs',
  adductors: 'Adducteurs',
  biceps: 'Biceps',
  calves: 'Mollets',
  chest: 'Pectoraux',
  forearms: 'Avant-bras',
  glutes: 'Fessiers',
  hamstrings: 'Ischio-jambiers',
  lats: 'Grands dorsaux',
  'lower back': 'Lombaires',
  'middle back': 'Milieu du dos',
  neck: 'Cou',
  quadriceps: 'Quadriceps',
  shoulders: 'Épaules',
  traps: 'Trapèzes',
  triceps: 'Triceps',
}

/** Muscles dans l'ordre d'affichage des filtres : du haut du corps vers le bas. */
export const MUSCLE_ORDER: readonly Muscle[] = [
  'chest',
  'shoulders',
  'triceps',
  'biceps',
  'forearms',
  'lats',
  'middle back',
  'traps',
  'lower back',
  'abdominals',
  'glutes',
  'quadriceps',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'neck',
]

/** Catégorie d'un exercice (au singulier, pour une fiche). */
export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  strength: 'Renforcement',
  skill: 'Figure',
  stretching: 'Étirement',
  mobility: 'Mobilité',
  plyometrics: 'Pliométrie',
  cardio: 'Cardio',
  powerlifting: 'Force athlétique',
  'olympic weightlifting': 'Haltérophilie',
  strongman: 'Strongman',
}

/** Catégories au pluriel, pour les filtres. */
export const CATEGORY_PLURAL: Record<ExerciseCategory, string> = {
  strength: 'Renforcement',
  skill: 'Figures',
  stretching: 'Étirements',
  mobility: 'Mobilité',
  plyometrics: 'Pliométrie',
  cardio: 'Cardio',
  powerlifting: 'Force athlétique',
  'olympic weightlifting': 'Haltérophilie',
  strongman: 'Strongman',
}

export const CATEGORY_ORDER: readonly ExerciseCategory[] = [
  'strength',
  'skill',
  'stretching',
  'mobility',
  'plyometrics',
  'cardio',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
]

export const LEVEL_LABEL: Record<ExerciseLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  expert: 'Avancé',
}

export const LEVEL_ORDER: readonly ExerciseLevel[] = ['beginner', 'intermediate', 'expert']

export const MEASURE_LABEL: Record<ExerciseMeasure, string> = {
  reps: 'En répétitions',
  time: 'Au chrono',
}

export const SOURCE_LABEL: Record<Exercise['source'], string> = {
  calitrack: 'Calisthénie CaliTrack',
  fedb: 'Base générale',
  custom: 'Mes exercices',
}

export const SOURCE_ORDER: readonly Exercise['source'][] = ['calitrack', 'custom', 'fedb']

export const FORCE_LABEL: Record<NonNullable<Exercise['force']>, string> = {
  push: 'Poussée',
  pull: 'Tirage',
  static: 'Gainage / statique',
}
