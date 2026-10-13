import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { z } from 'zod'
import { choice } from '@/content/ai/structured'
import { computeTargets, type MacroTargets } from '@/content/nutrition/targets'
import type { BodyReview, NutritionGoals, NutritionPhase, Profile, Sex } from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { buildCoachContext, type CoachData, type ContextSection } from './context'
import { COACH_RULES, promptText } from './prompt'

/*
 * Coach physique : Claude regarde des photos et propose une phase (sèche, maintien, prise de masse) avec
 * une fourchette de masse grasse. Les objectifs chiffrés viennent toujours de computeTargets, jamais de
 * Claude, et une phase risquée est ramenée au maintien (guardedPhase).
 */

/** Les phases, dans l'ordre de l'écran des objectifs. */
export const PHASES = ['cut', 'maintain', 'bulk'] as const satisfies readonly NutritionPhase[]

/** Âge minimum : le coach physique est réservé aux adultes. */
export const BODY_COACH_MIN_AGE = 18

/** Côté le plus long des photos envoyées : assez pour voir la silhouette, sans coût inutile. */
export const BODY_PHOTO_MAX_SIDE = 1024

/** Photos envoyées au plus (de face, de profil, de dos). */
export const BODY_PHOTO_MAX = 3

/* ------------------------------------------------------------------ */
/* Accès                                                               */
/* ------------------------------------------------------------------ */

/** Ce qui empêche d'utiliser le coach physique (null : rien). */
export type BodyGate = 'noKey' | 'noBirthYear' | 'minor' | 'noHeight' | 'noWeight' | null

/**
 * Le coach physique demande une clé Claude et un adulte dont on connaît la taille et le poids. Avec la
 * seule année de naissance, l'âge atteint cette année peut ne pas l'être encore : on retire un an, pour
 * être sûr que la personne a 18 ans.
 */
export function bodyCoachGate(args: {
  hasKey: boolean
  profile: Pick<Profile, 'birthYear' | 'heightCm'>
  weightKg: number | null
  year: number
}): BodyGate {
  if (!args.hasKey) return 'noKey'
  if (args.profile.birthYear === null) return 'noBirthYear'
  if (args.year - args.profile.birthYear - 1 < BODY_COACH_MIN_AGE) return 'minor'
  if (args.profile.heightCm === null) return 'noHeight'
  if (args.weightKg === null) return 'noWeight'
  return null
}

/* ------------------------------------------------------------------ */
/* Réponse de Claude                                                   */
/* ------------------------------------------------------------------ */

/**
 * Ce que Claude renvoie (forme SOUPLE : l'API ne contrôle ni les choix ni les bornes, ramenés ensuite par
 * cleanBodyReview). Les descriptions sont les consignes de chaque champ.
 */
export const bodyReviewOutput = z.object({
  readable: z
    .boolean()
    .describe('Faux si les photos ne montrent pas un corps humain, ou pas assez nettement pour l’analyser.'),
  problem: z
    .string()
    .describe('Si readable est faux : pourquoi, en une phrase courte, en tutoyant. Sinon vide.'),
  phase: z
    .string()
    .describe('La phase conseillée : cut (sèche), maintain (maintien) ou bulk (prise de masse).'),
  bodyFatLow: z
    .number()
    .nullable()
    .describe('Bas de la fourchette de masse grasse estimée, en %. null si tu ne peux pas l’estimer.'),
  bodyFatHigh: z
    .number()
    .nullable()
    .describe('Haut de la fourchette de masse grasse estimée, en %. null si tu ne peux pas l’estimer.'),
  summary: z
    .string()
    .describe('Le bilan en deux ou trois phrases, en tutoyant : la phase conseillée et pourquoi.'),
  observations: z
    .array(z.string())
    .describe('Ce que tu observes, 4 au plus, en phrases courtes et neutres, sans jugement sur l’apparence.'),
  advice: z
    .array(z.string())
    .describe('Des conseils concrets pour cette phase, 4 au plus, en phrases courtes.'),
})

export type BodyReviewOutput = z.infer<typeof bodyReviewOutput>

/** Bornes plausibles d'une masse grasse, en % (celles du schéma des analyses). */
const BODY_FAT = { min: 3, max: 60 } as const
/** Longueurs gardées (celles du schéma des analyses). */
const SUMMARY_MAX = 600
const LINE_MAX = 200
const LINES_MAX = 4

/** Un texte de Claude sans espaces autour, coupé à `max` caractères (sans couper un caractère en deux). */
export function cutText(text: string, max: number): string {
  let cut = text.trim().slice(0, max)
  if (/[\ud800-\udbff]$/.test(cut)) cut = cut.slice(0, -1)
  return cut.trimEnd()
}

const lines = (items: readonly string[]) =>
  items
    .map((item) => cutText(item, LINE_MAX))
    .filter((item) => item !== '')
    .slice(0, LINES_MAX)

const bodyFatBound = (value: number) => Math.round(Math.min(BODY_FAT.max, Math.max(BODY_FAT.min, value)))

/** La réponse de Claude ramenée à des valeurs sûres. */
export interface CleanBodyReview {
  suggestedPhase: NutritionPhase
  /** Masse grasse estimée, en % entiers ; null si Claude ne l'a pas estimée. */
  bodyFat: { low: number; high: number } | null
  summary: string
  observations: string[]
  advice: string[]
}

/**
 * Une phase inconnue devient le maintien ; la masse grasse est ramenée entre 3 et 60 %, en entiers, ses
 * bornes remises dans l'ordre (null s'il en manque une) ; les textes sont coupés aux longueurs gardées.
 */
export function cleanBodyReview(raw: BodyReviewOutput): CleanBodyReview {
  const { bodyFatLow: low, bodyFatHigh: high } = raw
  const bodyFat =
    low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high)
      ? null
      : {
          low: bodyFatBound(Math.min(low, high)),
          high: bodyFatBound(Math.max(low, high)),
        }
  return {
    suggestedPhase: choice(raw.phase.trim().toLowerCase(), PHASES, 'maintain'),
    bodyFat,
    summary: cutText(raw.summary, SUMMARY_MAX),
    observations: lines(raw.observations),
    advice: lines(raw.advice),
  }
}

/* ------------------------------------------------------------------ */
/* Garde-fous et objectifs                                             */
/* ------------------------------------------------------------------ */

/** Sous cette masse grasse (en %), pas de sèche : déjà sec. Sexe inconnu : entre les deux. */
export const LEAN_BODY_FAT: Record<Sex | 'unknown', number> = { male: 10, female: 18, other: 14, unknown: 14 }

/** Indice de masse corporelle (kg / m²). */
export function bmiOf(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100
  return weightKg / (meters * meters)
}

/**
 * La phase que CaliTrack conseille vraiment : pas de sèche pour une personne maigre (IMC sous 18,5) ou
 * déjà sèche, pas de prise de masse en obésité (IMC de 30 et plus). Elle devient alors le maintien.
 */
export function guardedPhase(
  phase: NutritionPhase,
  body: { sex: Sex | null; bmi: number; bodyFatLow: number | null },
): NutritionPhase {
  if (phase === 'cut') {
    const lean = body.bodyFatLow !== null && body.bodyFatLow < LEAN_BODY_FAT[body.sex ?? 'unknown']
    return body.bmi < 18.5 || lean ? 'maintain' : 'cut'
  }
  if (phase === 'bulk' && body.bmi >= 30) return 'maintain'
  return phase
}

/**
 * Les objectifs calculés par CaliTrack pour une phase, sans les valeurs fixées à la main (ce que donnera
 * la phase une fois appliquée avec ces valeurs effacées). null quand le profil ne permet pas le calcul.
 */
export function reviewTargets(
  profile: Pick<Profile, 'sex' | 'birthYear' | 'heightCm'>,
  weightKg: number,
  goals: Pick<NutritionGoals, 'activity'>,
  phase: NutritionPhase,
  year: number,
): MacroTargets | null {
  const result = computeTargets(
    profile,
    weightKg,
    { activity: goals.activity, phase, kcal: null, proteinG: null, carbsG: null, fatG: null },
    year,
  )
  return result.ok ? result.targets : null
}

/**
 * L'analyse à enregistrer : la réponse nettoyée, la phase passée par les garde-fous et les objectifs de
 * cette phase. null quand le profil ne permet pas de calculer les objectifs.
 */
export function bodyReviewFrom(args: {
  raw: BodyReviewOutput
  profile: Pick<Profile, 'sex' | 'birthYear' | 'heightCm'>
  weightKg: number
  goals: Pick<NutritionGoals, 'activity'>
  date: ISODate
  model: string
  now: string
}): BodyReview | null {
  const { profile, weightKg } = args
  if (profile.heightCm === null) return null
  const clean = cleanBodyReview(args.raw)
  const phase = guardedPhase(clean.suggestedPhase, {
    sex: profile.sex,
    bmi: bmiOf(weightKg, profile.heightCm),
    bodyFatLow: clean.bodyFat?.low ?? null,
  })
  const targets = reviewTargets(profile, weightKg, args.goals, phase, Number(args.date.slice(0, 4)))
  if (targets === null) return null
  return {
    date: args.date,
    model: args.model,
    suggestedPhase: clean.suggestedPhase,
    phase,
    bodyFat: clean.bodyFat,
    weightKg,
    targets,
    summary: clean.summary,
    observations: clean.observations,
    advice: clean.advice,
    appliedAt: null,
    createdAt: args.now,
    updatedAt: args.now,
  }
}

/* ------------------------------------------------------------------ */
/* Demande                                                             */
/* ------------------------------------------------------------------ */

/** Les angles de prise de vue proposés, dans l'ordre de l'écran. */
export type PhotoView = 'front' | 'side' | 'back'

/** Une photo prête à partir : un JPEG en base64, sans le préfixe « data: ». */
export interface BodyPhoto {
  view: PhotoView
  base64: string
}

const VIEW_TEXT: Record<PhotoView, string> = { front: 'de face', side: 'de profil', back: 'de dos' }

const PHASE_TEXT: Record<NutritionPhase, string> = {
  cut: 'sèche',
  maintain: 'maintien',
  bulk: 'prise de masse',
}

/** Les parties du contexte utiles à l'analyse. */
export const BODY_SECTIONS: readonly ContextSection[] = ['profile', 'weights', 'nutrition', 'program']

const BODY_RULES = `Analyse physique :
- Tu reçois de 1 à 3 photos de l'utilisateur (de face, de profil, de dos) et ses données. Appuie-toi sur ce que tu vois, sans rien inventer.
- Estime sa masse grasse sous forme de fourchette (par exemple 15 à 19 %), sans fausse précision ; mets null si tu ne peux pas l'estimer.
- Conseille une phase : cut (sèche), maintain (maintien) ou bulk (prise de masse), d'après les photos, le poids, l'entraînement et les objectifs.
- Ne donne aucun nombre de calories ni de macronutriments : CaliTrack les calcule lui-même d'après la phase.
- Ne commente jamais l'attrait physique ni la beauté. Emploie des mots neutres et bienveillants, tournés vers la santé et la performance.
- Si les photos ne montrent pas un corps humain, ou pas assez pour l'analyser, mets readable à false et explique pourquoi dans problem, en une phrase.`

/**
 * La demande à Claude : les règles du coach et de l'analyse, puis les photos (JPEG), les données utiles
 * et la phase actuelle. Aucune espace insécable (promptText).
 */
export function bodyPrompt(args: { data: CoachData; photos: readonly BodyPhoto[] }): {
  system: string
  content: ContentBlockParam[]
} {
  const { data, photos } = args
  const phase = data.nutrition.phase
  const text = [
    buildCoachContext(data, BODY_SECTIONS),
    `Photos jointes, dans l'ordre : ${photos.map((photo) => VIEW_TEXT[photo.view]).join(', ')}.`,
    `Phase actuelle : ${phase} (${PHASE_TEXT[phase]}).`,
    'Tâche : estime la masse grasse, puis conseille la phase qui convient le mieux maintenant, avec un bilan, ce que tu observes et des conseils concrets pour cette phase.',
  ].join('\n\n')
  return {
    system: promptText(`${COACH_RULES}\n\n${BODY_RULES}`),
    content: [
      ...photos.map((photo): ContentBlockParam => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: photo.base64 },
      })),
      { type: 'text', text: promptText(text) },
    ],
  }
}
