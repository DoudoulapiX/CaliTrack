import type { ActivityLevel, NutritionGoals, NutritionPhase, Profile, Sex } from '@/db/types'

/** Facteurs d'activité appliqués au métabolisme de base. */
export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
}

/** Variation de l'énergie selon la phase : sèche −20 %, maintien, prise de masse +10 %. */
export const PHASE_FACTOR: Record<NutritionPhase, number> = {
  cut: 0.8,
  maintain: 1,
  bulk: 1.1,
}

/** Protéines visées, en grammes par kilo de poids de corps. */
export const PROTEIN_PER_KG: Record<NutritionPhase, number> = {
  cut: 2.2,
  maintain: 1.8,
  bulk: 2,
}

/** Part de l'énergie apportée par les lipides. */
export const FAT_SHARE = 0.25

export interface MacroTargets {
  kcal: number
  proteinG: number
  carbsG: number
  fatG: number
}

export type TargetsResult =
  | {
      ok: true
      targets: MacroTargets
      /** Énergie calculée (métabolisme × activité × phase), même fixée à la main ; null s'il manque des données. */
      computedKcal: number | null
      /** Métabolisme de base estimé ; null s'il manque des données du profil. */
      bmr: number | null
      /** Vrai si le sexe manque : la formule prend alors la moyenne homme-femme. */
      sexUnknown: boolean
      /** Ce qu'il manque au profil pour calculer l'énergie (vide quand le calcul est possible). */
      missing: string[]
    }
  | {
      ok: false
      /** Ce qu'il manque au profil pour calculer l'énergie : « âge », « taille », « poids ». */
      missing: string[]
    }

/** Métabolisme de base de Mifflin-St Jeor, en kcal par jour. */
export function mifflinStJeor(sex: Sex | null, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  if (sex === 'male') return base + 5
  if (sex === 'female') return base - 161
  return base - 78
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step

/**
 * Objectifs du jour : l'énergie vient du profil (âge, taille, poids, sexe), de l'activité et de la phase,
 * sauf si elle est fixée à la main ; les protéines suivent le poids, les lipides font 25 % de l'énergie
 * et les glucides complètent. Chaque valeur fixée à la main remplace la valeur calculée.
 */
export function computeTargets(
  profile: Pick<Profile, 'sex' | 'birthYear' | 'heightCm'>,
  weightKg: number | null,
  goals: Pick<NutritionGoals, 'phase' | 'activity' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>,
  year: number,
): TargetsResult {
  const missing = [
    ...(profile.birthYear === null ? ['âge'] : []),
    ...(profile.heightCm === null ? ['taille'] : []),
    ...(weightKg === null ? ['poids'] : []),
  ]
  const bmr =
    profile.birthYear !== null && profile.heightCm !== null && weightKg !== null
      ? mifflinStJeor(profile.sex, weightKg, profile.heightCm, year - profile.birthYear)
      : null
  const computedKcal =
    bmr === null ? null : roundTo(bmr * ACTIVITY_FACTOR[goals.activity] * PHASE_FACTOR[goals.phase], 10)
  const kcal = goals.kcal ?? computedKcal
  if (kcal === null) return { ok: false, missing }

  // Sans poids connu, les protéines prennent 25 % de l'énergie.
  const proteinG =
    goals.proteinG ??
    (weightKg === null ? roundTo((kcal * 0.25) / 4, 5) : roundTo(weightKg * PROTEIN_PER_KG[goals.phase], 5))
  const fatG = goals.fatG ?? roundTo((kcal * FAT_SHARE) / 9, 5)
  const carbsG = goals.carbsG ?? Math.max(0, roundTo((kcal - 4 * proteinG - 9 * fatG) / 4, 5))
  return {
    ok: true,
    targets: { kcal, proteinG, carbsG, fatG },
    computedKcal,
    bmr: bmr === null ? null : Math.round(bmr),
    sexUnknown: bmr !== null && profile.sex !== 'male' && profile.sex !== 'female',
    missing,
  }
}
