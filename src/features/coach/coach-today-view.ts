import type { AgendaStatus } from '@/content/calendar/agenda'
import { coachPlanFor, cutText, type CoachPlan } from '@/content/coach/today'
import { formatPrescription } from '@/content/programs/format'
import { deloadSets } from '@/content/programs/schedule'
import type {
  CoachChange,
  CoachCheckIn,
  CoachDay,
  CoachDecision,
  Exercise,
  OuraDay,
  Program,
  ProgramSession,
  ProgramSlot,
} from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { frenchSpacing, keepTogether, NBSP } from '@/lib/typography'
import { formatNumber, type WeightUnit } from '@/lib/units'
import { formatSleep } from '@/features/oura/oura-view'

/** L'écran du coach du jour. */
export const COACH_TODAY_PATH = '/training/coach'

/* ------------------------------------------------------------------ */
/* La carte de la séance du jour (Aujourd'hui, Entraînement)           */
/* ------------------------------------------------------------------ */

/**
 * Ce que la carte de la séance du jour montre du coach : rien sans clé, un lien pour lui demander, ou son
 * conseil encore valable pour cette séance (séance prévue validée, allégée, ou repos conseillé).
 */
export type TodayCoachState =
  | { kind: 'off' }
  | { kind: 'ask' }
  | { kind: 'asPlanned'; plan: CoachPlan }
  | { kind: 'lighter'; plan: CoachPlan }
  | { kind: 'rest'; plan: CoachPlan }

export function todayCoachState(args: {
  day: CoachDay | null | undefined
  program: Pick<Program, 'id'>
  session: ProgramSession
  date: ISODate
  hasKey: boolean
}): TodayCoachState {
  if (!args.hasKey) return { kind: 'off' }
  const plan = coachPlanFor(args.day, args.program, args.session, args.date)
  if (!plan) return { kind: 'ask' }
  return { kind: plan.decision, plan }
}

/** Les textes du coach sur la carte de la séance du jour (aucun ne parle de « cette nuit »). */
export const TODAY_COACH_TEXT = {
  ask: 'Ajuster avec le coach',
  asPlanned: 'Le coach valide la séance prévue.',
  lighterBadge: 'Allégée par le coach',
  restBadge: 'Repos conseillé',
  startLighter: 'Commencer la séance allégée',
  start: 'Commencer la séance',
  details: 'Voir le détail',
  takeRest: 'Prendre ma journée de repos',
  cancelRest: 'Annuler le repos',
  doAnyway: 'Faire la séance quand même',
  restTaken: 'Journée de repos notée',
  restCancelled: 'Séance remise au programme',
} as const

/* ------------------------------------------------------------------ */
/* Le conseil                                                          */
/* ------------------------------------------------------------------ */

export const DECISION_LABEL: Record<CoachDecision, string> = {
  asPlanned: 'Séance prévue',
  lighter: 'Séance allégée',
  rest: 'Repos conseillé',
}

export const DECISION_TONE: Record<CoachDecision, 'success' | 'accent' | 'warning'> = {
  asPlanned: 'success',
  lighter: 'accent',
  rest: 'warning',
}

/** Le badge d'un conseil sans séance prévue. */
export const TIPS_LABEL = 'Conseils du jour'

/**
 * Le titre du conseil, sauf s'il est vide ou répète le badge affiché juste à côté (« Repos conseillé »
 * deux fois) : null alors.
 */
export function headlineBesides(headline: string, badge: string): string | null {
  const text = headline.trim()
  const key = (value: string) => value.toLocaleLowerCase('fr').replace(/[\s.!…]+$/u, '')
  return text === '' || key(text) === key(badge) ? null : text
}

/** Le bouton qui met le conseil de côté, ou le reprend. */
export function ignoreLabel(ignored: boolean): string {
  return ignored ? 'Reprendre le conseil du coach' : 'Revenir à la séance prévue'
}

/** Le bouton du repos conseillé : le prendre, ou l'annuler une fois pris. */
export function restLabel(skipped: boolean): string {
  return skipped ? TODAY_COACH_TEXT.cancelRest : TODAY_COACH_TEXT.takeRest
}

export const NO_SESSION_TEXT = frenchSpacing(
  'Pas de séance prévue aujourd’hui : le coach te donne des conseils pour la journée.',
)

/** Où en est la séance du jour quand elle n'est plus à faire. */
export const SESSION_STATUS_TEXT: Record<Exclude<AgendaStatus, 'planned'>, string> = {
  active: 'Séance en cours',
  done: 'Séance faite',
  missed: 'Séance manquée',
  skipped: 'Journée de repos prise',
}

/** Ce que l'on fait d'une prescription : « 4 × 5 à 8 rép. · 10 kg », sans coupure au milieu. */
function prescription(
  value: Pick<ProgramSlot, 'sets' | 'target' | 'loadKg'>,
  exercise: Exercise | undefined,
  unit: WeightUnit,
): string {
  return keepTogether(formatPrescription(value, exercise, unit))
}

/**
 * Un exercice changé par le coach, « avant → après » : « Tractions · 4 × 5 à 8 rép. → 3 × 5 à 8 rép. ».
 * `slot` : le créneau du programme, pour la prescription d'avant (absente si l'exercice a changé depuis).
 */
export function changeLine(
  change: CoachChange,
  slot: Pick<ProgramSlot, 'exerciseId' | 'sets' | 'target' | 'loadKg'> | undefined,
  deload: boolean,
  exercises: ReadonlyMap<string, Exercise>,
  unit: WeightUnit,
): string {
  const planned = exercises.get(change.plannedExerciseId)
  const name = planned?.name ?? 'Exercice supprimé'
  const before =
    slot && slot.exerciseId === change.plannedExerciseId
      ? prescription({ ...slot, sets: deload ? deloadSets(slot.sets) : slot.sets }, planned, unit)
      : null
  let after: string
  if (change.action === 'skip') after = 'pas aujourd’hui'
  else if (change.action === 'swap') {
    const swapped = exercises.get(change.exerciseId)
    after = `${swapped?.name ?? 'Exercice supprimé'} · ${prescription(change, swapped, unit)}`
  } else after = prescription(change, planned, unit)
  return frenchSpacing(before === null ? `${name} → ${after}` : `${name} · ${before} → ${after}`)
}

/**
 * Le conseil à afficher : celui qu'on vient d'enregistrer tant que la base ne l'a pas encore rendu, puis
 * celui de la base (le plus récent des deux).
 */
export function newestDay(
  live: CoachDay | null | undefined,
  saved: CoachDay | null,
  date: ISODate,
): CoachDay | null {
  const fresh = saved?.date === date ? saved : null
  if (!fresh) return live ?? null
  if (!live) return fresh
  return live.updatedAt >= fresh.updatedAt ? live : fresh
}

/* ------------------------------------------------------------------ */
/* La forme du jour                                                    */
/* ------------------------------------------------------------------ */

/** La nuit notée par la bague : la journée Oura du jour, si elle a des mesures de sommeil. */
export function ouraNight(row: OuraDay | null | undefined, date: ISODate): OuraDay | null {
  if (!row || row.date !== date) return null
  const measured = row.readinessScore !== null || row.sleepScore !== null || row.sleepMin !== null
  return measured ? row : null
}

/**
 * Les lignes de la carte « Ta forme » : le sommeil et la récupération de la journée Oura du jour, la
 * dépense complète de la veille. Jamais « cette nuit » : le texte ne doit pas se confondre avec la carte
 * Récupération de l'accueil.
 */
export function formLines(night: OuraDay | null, yesterday: OuraDay | null): string[] {
  const lines: string[] = []
  if (night) {
    const sleep =
      night.sleepMin !== null
        ? `Sommeil ${formatSleep(night.sleepMin)}${night.sleepScore === null ? '' : ` · score ${String(night.sleepScore)}`}`
        : night.sleepScore !== null
          ? `Score de sommeil ${String(night.sleepScore)}`
          : null
    if (sleep) lines.push(sleep)
    if (night.readinessScore !== null) lines.push(`Récupération ${String(night.readinessScore)}`)
  } else {
    lines.push('Pas de données Oura aujourd’hui.')
  }
  const spent = yesterday?.totalKcal ?? null
  if (spent !== null) {
    lines.push(frenchSpacing(`Hier : ${formatNumber(Math.round(spent))}${NBSP}kcal dépensées`))
  }
  return lines
}

/* ------------------------------------------------------------------ */
/* Le ressenti                                                         */
/* ------------------------------------------------------------------ */

export type SleepFeeling = NonNullable<CoachCheckIn['sleep']>
export type Zone = CoachCheckIn['zones'][number]

export const SLEEP_OPTIONS: { value: SleepFeeling; label: string }[] = [
  { value: 'bad', label: 'Mauvais' },
  { value: 'ok', label: 'Moyen' },
  { value: 'good', label: 'Bon' },
]

export const ENERGY_OPTIONS: { value: CoachCheckIn['energy']; label: string }[] = [
  { value: 'low', label: 'Basse' },
  { value: 'ok', label: 'Normale' },
  { value: 'high', label: 'Haute' },
]

export const SORENESS_OPTIONS: { value: CoachCheckIn['soreness']; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'light', label: 'Légères' },
  { value: 'strong', label: 'Fortes' },
]

export const ZONE_OPTIONS: { value: Zone; label: string }[] = [
  { value: 'back', label: 'Dos' },
  { value: 'chest', label: 'Pectoraux' },
  { value: 'shoulders', label: 'Épaules' },
  { value: 'arms', label: 'Bras' },
  { value: 'forearms', label: 'Avant-bras et doigts' },
  { value: 'core', label: 'Abdos' },
  { value: 'legs', label: 'Jambes' },
]

/** Longueur maximale de la note au coach. */
export const NOTE_MAX = 300

/** Le ressenti en cours de saisie (le sommeil y a toujours une valeur, même caché). */
export interface CheckInDraft {
  sleep: SleepFeeling
  energy: CoachCheckIn['energy']
  soreness: CoachCheckIn['soreness']
  zones: Zone[]
  note: string
}

/** Le formulaire vide, ou rempli comme lors de la dernière demande. */
export function checkInDraft(checkIn?: CoachCheckIn | null): CheckInDraft {
  return {
    sleep: checkIn?.sleep ?? 'ok',
    energy: checkIn?.energy ?? 'ok',
    soreness: checkIn?.soreness ?? 'none',
    zones: [...(checkIn?.zones ?? [])],
    note: checkIn?.note ?? '',
  }
}

/**
 * Le ressenti envoyé au coach : sans sommeil quand la bague l'a mesuré, sans zones sans courbatures,
 * zones dans l'ordre de l'écran, note sans espaces autour.
 */
export function checkInOf(draft: CheckInDraft, withSleep: boolean): CoachCheckIn {
  return {
    sleep: withSleep ? draft.sleep : null,
    energy: draft.energy,
    soreness: draft.soreness,
    zones:
      draft.soreness === 'none'
        ? []
        : ZONE_OPTIONS.map((option) => option.value).filter((zone) => draft.zones.includes(zone)),
    note: cutText(draft.note, NOTE_MAX),
  }
}
