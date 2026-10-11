import type { ExperienceLevel, GoalFocus, Sex } from '@/db/types'
import { frenchSpacing } from '@/lib/typography'

export const GOAL_FOCUS_ORDER: readonly GoalFocus[] = [
  'strength',
  'muscle',
  'skills',
  'fatLoss',
  'climbing',
  'endurance',
  'mobility',
]

export const GOAL_FOCUS_LABEL: Record<GoalFocus, string> = {
  strength: 'Force',
  muscle: 'Prise de muscle',
  skills: 'Figures',
  fatLoss: 'Perte de gras',
  climbing: 'Escalade',
  endurance: 'Endurance',
  mobility: 'Mobilité',
}

export const EXPERIENCE_ORDER: readonly ExperienceLevel[] = ['beginner', 'intermediate', 'advanced']

export const EXPERIENCE_LABEL: Record<ExperienceLevel, string> = {
  beginner: 'Débutant',
  intermediate: 'Intermédiaire',
  advanced: 'Avancé',
}

export const EXPERIENCE_DESCRIPTION: Record<ExperienceLevel, string> = {
  beginner: frenchSpacing('Tu débutes ou tu reprends : moins de 4 tractions ou de 15 pompes.'),
  intermediate: 'Tu enchaînes 4 à 11 tractions et 15 à 39 pompes.',
  advanced: frenchSpacing('Au moins 12 tractions et 40 pompes : tu travailles des figures.'),
}

export const SEX_LABEL: Record<Sex, string> = {
  male: 'Homme',
  female: 'Femme',
  other: 'Autre',
}

/** Durées de séance proposées, en minutes. */
export const SESSION_LENGTHS = [30, 45, 60, 75, 90] as const

/** Bornes acceptées pour les mesures du profil (en unités de stockage : cm et kg). */
export const PROFILE_LIMITS = {
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 25, max: 300 },
  birthYear: { min: 1920 },
} as const
