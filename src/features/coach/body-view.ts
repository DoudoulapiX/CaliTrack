import type { BodyGate, PhotoView } from '@/content/coach/body'
import type { BodyReview, NutritionPhase } from '@/db/types'
import { localDateOf, type ISODate } from '@/lib/dates'
import { frenchSpacing, keepTogether } from '@/lib/typography'
import { formatNumber } from '@/lib/units'
import { dayLabel, shortDate } from '@/features/goals/goal-view'
import { PHASE_LABEL } from '@/features/nutrition/nutrition-view'

/* Textes du coach physique. */

/** Toujours en haut de l'écran. */
export const BODY_DISCLAIMER = frenchSpacing(
  'C’est une estimation pour guider tes phases, pas un avis médical.',
)

/** Sous les photos : ce qui part, et ce qui n'est pas gardé. */
export const PHOTO_NOTE = frenchSpacing(
  'Tes photos partent vers Anthropic pour l’analyse ; CaliTrack ne les garde pas.',
)

/** Une photo que le téléphone ne sait pas ouvrir. */
export const UNREADABLE_PHOTO = 'Cette photo ne s’ouvre pas. Choisis-en une autre.'

/** Pendant l'analyse. */
export const ANALYZING_TEXT = 'Le coach regarde tes photos…'

/** Les emplacements de photo, dans l'ordre de l'écran. */
export const PHOTO_SLOTS: readonly { view: PhotoView; label: string }[] = [
  { view: 'front', label: 'De face' },
  { view: 'side', label: 'De profil' },
  { view: 'back', label: 'De dos' },
]

/** Le nom d'une photo dans une phrase (« de face »). */
const VIEW_WORDS: Record<PhotoView, string> = { front: 'de face', side: 'de profil', back: 'de dos' }

/** Le bouton qui retire une photo choisie. */
export function removePhotoLabel(view: PhotoView): string {
  return `Retirer la photo ${VIEW_WORDS[view]}`
}

/** Pourquoi le coach physique n'est pas accessible, et où régler ça. */
export const GATE_TEXT: Record<Exclude<BodyGate, 'noKey' | null>, string> = {
  noBirthYear: 'Indique ton année de naissance dans ton profil.',
  minor: 'Le coach physique est réservé aux adultes.',
  noHeight: 'Indique ta taille dans ton profil.',
  noWeight: 'Note ton poids pour commencer.',
}

/** La phase dans une phrase (« une sèche », « le maintien »). */
const PHASE_IN_SENTENCE: Record<NutritionPhase, string> = {
  cut: 'une sèche',
  maintain: 'le maintien',
  bulk: 'une prise de masse',
}

/** « Phase conseillée : Maintien ». */
export function phaseAdviceText(phase: NutritionPhase): string {
  return frenchSpacing(`Phase conseillée : ${PHASE_LABEL[phase]}`)
}

/**
 * Quand CaliTrack a ramené la phase de Claude au maintien : « Le coach proposait une sèche ; CaliTrack
 * conseille le maintien vu ta corpulence. » ; null quand les deux sont d'accord.
 */
export function guardText(review: Pick<BodyReview, 'suggestedPhase' | 'phase'>): string | null {
  if (review.suggestedPhase === review.phase) return null
  return frenchSpacing(
    `Le coach proposait ${PHASE_IN_SENTENCE[review.suggestedPhase]} ; CaliTrack conseille ${PHASE_IN_SENTENCE[review.phase]} vu ta corpulence.`,
  )
}

/** « 15 à 19 % » (ou « 15 % »), d'un seul tenant ; null sans estimation. */
export function bodyFatRange(bodyFat: BodyReview['bodyFat']): string | null {
  if (bodyFat === null) return null
  const range =
    bodyFat.low === bodyFat.high
      ? `${formatNumber(bodyFat.low)} %`
      : `${formatNumber(bodyFat.low)} à ${formatNumber(bodyFat.high)} %`
  return keepTogether(range)
}

/** « Masse grasse estimée : 15 à 19 % ». */
export function bodyFatText(bodyFat: BodyReview['bodyFat']): string {
  const range = bodyFatRange(bodyFat)
  return range === null
    ? 'Masse grasse non estimée sur ces photos.'
    : frenchSpacing(`Masse grasse estimée : ${range}`)
}

/** Le bouton une fois la phase appliquée : « Appliquée le 21 octobre ». */
export function appliedText(appliedAt: string, today: ISODate): string {
  return `Appliquée le ${shortDate(localDateOf(appliedAt), today)}`
}

/** Une analyse passée : « Aujourd’hui », « Samedi 10 octobre »… */
export function historyTitle(review: Pick<BodyReview, 'date'>, today: ISODate): string {
  return dayLabel(review.date, today)
}

/** Sous la date d'une analyse passée : « Maintien · 15 à 19 % de masse grasse ». */
export function historyLine(review: Pick<BodyReview, 'phase' | 'bodyFat'>): string {
  const range = bodyFatRange(review.bodyFat)
  return range === null
    ? PHASE_LABEL[review.phase]
    : `${PHASE_LABEL[review.phase]} · ${range} de masse grasse`
}
