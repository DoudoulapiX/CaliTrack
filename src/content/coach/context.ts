import type { AgendaStatus } from '@/content/calendar/agenda'
import type { MacroTargets } from '@/content/nutrition/targets'
import { EXPERIENCE_LABEL, GOAL_FOCUS_LABEL, SEX_LABEL } from '@/content/profile'
import { skillName } from '@/content/skills'
import type { ExperienceLevel, GoalFocus, NutritionPhase, Nutrients, PantryPlace, Sex } from '@/db/types'
import { WEEKDAY_LONG, weekdayOf, type ISODate, type Weekday } from '@/lib/dates'
import { promptNumber, promptText, quoteUser } from './prompt'

/**
 * Ce que le coach sait de l'utilisateur, lu dans la base pour un jour donné (voir loadCoachData). Jamais
 * le prénom : il n'apporte rien au conseil.
 */
export interface CoachData {
  date: ISODate
  profile: {
    sex: Sex | null
    /** Âge atteint dans l'année ; null : année de naissance inconnue. */
    age: number | null
    heightCm: number | null
    /** La dernière pesée, sinon le poids du profil. */
    weightKg: number | null
    experience: ExperienceLevel
    focuses: GoalFocus[]
    /** Identifiants des figures visées. */
    targetSkills: string[]
    sessionsPerWeek: number
    sessionMinutes: number
    trainingDays: Weekday[]
    climbingDays: Weekday[]
  }
  /** Le programme actif ; chaque exercice est une ligne déjà écrite (« Tractions 4 × 5 à 8 rép. »). */
  program: {
    name: string
    week: number
    deload: boolean
    sessions: { name: string; exercises: string[] }[]
  } | null
  /** Les 7 jours à venir, à partir de `date`. */
  agenda: { date: ISODate; label: string; status: AgendaStatus }[]
  /** Les séances terminées des 14 derniers jours ; chaque exercice est une ligne déjà écrite. */
  workouts: { date: ISODate; title: string; rpe: number | null; exercises: string[] }[]
  /** Les séances d'escalade des 14 derniers jours, résumées. */
  climbing: { date: ISODate; summary: string }[]
  /** Les données de la bague des 7 derniers jours. */
  oura: {
    date: ISODate
    readinessScore: number | null
    sleepScore: number | null
    sleepMin: number | null
    hrvMs: number | null
    totalKcal: number | null
    activeKcal: number | null
    steps: number | null
  }[]
  /** Les pesées des 30 derniers jours. */
  weights: { date: ISODate; kg: number }[]
  nutrition: {
    phase: NutritionPhase
    /** null : le profil ne permet pas de les calculer. */
    targets: MacroTargets | null
    today: Nutrients
    /** Moyenne des jours notés parmi les 7 précédents ; null : aucun repas noté. */
    last7Avg: Nutrients | null
  }
  /** La dernière analyse du coach physique. */
  bodyReview: { date: ISODate; phase: NutritionPhase; bodyFat: { low: number; high: number } | null } | null
  pantry: { place: PantryPlace; name: string; quantity: string }[]
}

/** Les parties du contexte, dans l'ordre où elles sont écrites. */
export const ALL_SECTIONS = [
  'profile',
  'program',
  'agenda',
  'workouts',
  'climbing',
  'oura',
  'weights',
  'nutrition',
  'body',
  'pantry',
] as const

export type ContextSection = (typeof ALL_SECTIONS)[number]

const PHASE_TEXT: Record<NutritionPhase, string> = {
  cut: 'sèche',
  maintain: 'maintien',
  bulk: 'prise de masse',
}

const STATUS_TEXT: Record<AgendaStatus, string> = {
  planned: 'prévue',
  active: 'en cours',
  done: 'faite',
  missed: 'manquée',
  skipped: 'annulée',
}

const PLACE_TEXT: Record<PantryPlace, string> = {
  fridge: 'Frigo',
  freezer: 'Congélateur',
  cupboard: 'Placards',
}

const PLACE_ORDER: readonly PantryPlace[] = ['fridge', 'freezer', 'cupboard']

/** Un texte venu de l'utilisateur, sur une ligne et sans chevrons. */
const clean = (text: string) => text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()

const day = (date: ISODate) => `${WEEKDAY_LONG[weekdayOf(date)]} ${date}`

const list = (items: readonly string[], empty: string) => (items.length > 0 ? items.join(', ') : empty)

const lines = (title: string, items: readonly string[]) =>
  [title, ...(items.length > 0 ? items : ['- aucune'])].join('\n')

const duration = (minutes: number) => {
  const rounded = Math.round(minutes)
  return `${String(Math.floor(rounded / 60))} h ${String(rounded % 60).padStart(2, '0')}`
}

const nutrients = (n: Pick<Nutrients, 'kcal' | 'protein' | 'carbs' | 'fat'>) =>
  `${promptNumber(n.kcal, 0)} kcal, ${promptNumber(n.protein, 0)} g de protéines, ` +
  `${promptNumber(n.carbs, 0)} g de glucides, ${promptNumber(n.fat, 0)} g de lipides`

function profileSection({ profile }: CoachData): string {
  const known = (value: number | null, unit: string) =>
    value === null ? 'non indiqué' : `${promptNumber(value)} ${unit}`
  return [
    'Profil :',
    `- sexe : ${profile.sex === null ? 'non indiqué' : SEX_LABEL[profile.sex].toLowerCase()}`,
    `- âge : ${known(profile.age, 'ans')}`,
    `- taille : ${known(profile.heightCm, 'cm')}`,
    `- poids : ${known(profile.weightKg, 'kg')}`,
    `- niveau : ${EXPERIENCE_LABEL[profile.experience].toLowerCase()}`,
    `- objectifs : ${list(
      profile.focuses.map((focus) => GOAL_FOCUS_LABEL[focus].toLowerCase()),
      'aucun',
    )}`,
    `- figures visées : ${list(profile.targetSkills.map(skillName), 'aucune')}`,
    `- séances voulues : ${String(profile.sessionsPerWeek)} par semaine, de ${String(profile.sessionMinutes)} min`,
    `- jours d'entraînement : ${list(
      profile.trainingDays.map((weekday) => WEEKDAY_LONG[weekday]),
      'aucun',
    )}`,
    `- jours d'escalade : ${list(
      profile.climbingDays.map((weekday) => WEEKDAY_LONG[weekday]),
      'aucun',
    )}`,
  ].join('\n')
}

function programSection({ program }: CoachData): string {
  if (!program) return 'Programme : aucun'
  const deload = program.deload ? ', semaine de décharge' : ''
  return [
    `Programme : ${clean(program.name)} (semaine ${String(program.week)}${deload})`,
    ...program.sessions.map(
      (session) =>
        `- ${clean(session.name)} : ${
          session.exercises.length > 0 ? session.exercises.map(clean).join(' ; ') : 'aucun exercice'
        }`,
    ),
  ].join('\n')
}

function agendaSection({ agenda }: CoachData): string {
  return lines(
    'Agenda des 7 prochains jours :',
    agenda.map((item) => `- ${day(item.date)} : ${clean(item.label)} (${STATUS_TEXT[item.status]})`),
  )
}

function workoutsSection({ workouts }: CoachData): string {
  return lines(
    'Séances faites (14 derniers jours) :',
    workouts.map((workout) => {
      const effort = workout.rpe === null ? '' : `, effort ${String(workout.rpe)}/10`
      const exercises = workout.exercises.length > 0 ? `. ${workout.exercises.map(clean).join(' ; ')}` : ''
      return `- ${day(workout.date)} : ${clean(workout.title)}${effort}${exercises}`
    }),
  )
}

function climbingSection({ climbing }: CoachData): string {
  return lines(
    'Escalade (14 derniers jours) :',
    climbing.map((session) => `- ${day(session.date)} : ${clean(session.summary)}`),
  )
}

function ouraSection({ oura }: CoachData): string {
  return lines(
    'Bague Oura (7 derniers jours ; le sommeil d’une date est celui de la nuit d’avant, la dépense du jour même peut être partielle) :',
    oura.map((row) => {
      const parts = [
        row.readinessScore === null ? null : `récupération ${String(row.readinessScore)}`,
        row.sleepScore === null ? null : `score de sommeil ${String(row.sleepScore)}`,
        row.sleepMin === null ? null : `${duration(row.sleepMin)} de sommeil`,
        row.hrvMs === null ? null : `VFC ${promptNumber(row.hrvMs, 0)} ms`,
        row.totalKcal === null ? null : `${promptNumber(row.totalKcal, 0)} kcal dépensées`,
        row.activeKcal === null ? null : `dont ${promptNumber(row.activeKcal, 0)} en activité`,
        row.steps === null ? null : `${promptNumber(row.steps, 0)} pas`,
      ].filter((part) => part !== null)
      return `- ${day(row.date)} : ${parts.length > 0 ? parts.join(', ') : 'pas de données'}`
    }),
  )
}

function weightsSection({ weights }: CoachData): string {
  return lines(
    'Pesées (30 derniers jours) :',
    weights.map((weight) => `- ${day(weight.date)} : ${promptNumber(weight.kg)} kg`),
  )
}

function nutritionSection({ nutrition }: CoachData): string {
  return [
    'Nutrition :',
    `- phase : ${PHASE_TEXT[nutrition.phase]}`,
    `- objectifs par jour : ${
      nutrition.targets
        ? nutrients({
            kcal: nutrition.targets.kcal,
            protein: nutrition.targets.proteinG,
            carbs: nutrition.targets.carbsG,
            fat: nutrition.targets.fatG,
          })
        : 'non calculés (profil incomplet)'
    }`,
    `- mangé aujourd'hui : ${nutrients(nutrition.today)}`,
    `- moyenne des 7 jours précédents : ${
      nutrition.last7Avg ? nutrients(nutrition.last7Avg) : 'aucun repas noté'
    }`,
  ].join('\n')
}

function bodySection({ bodyReview }: CoachData): string {
  if (!bodyReview) return 'Dernière analyse physique : aucune'
  const bodyFat = bodyReview.bodyFat
    ? `, masse grasse estimée de ${promptNumber(bodyReview.bodyFat.low, 0)} à ${promptNumber(bodyReview.bodyFat.high, 0)} %`
    : ''
  return `Dernière analyse physique : ${day(bodyReview.date)}, phase ${PHASE_TEXT[bodyReview.phase]}${bodyFat}`
}

function pantrySection({ pantry }: CoachData): string {
  if (pantry.length === 0) return 'Frigo et placards : vides'
  const sorted = [...pantry].sort((a, b) => PLACE_ORDER.indexOf(a.place) - PLACE_ORDER.indexOf(b.place))
  const items = sorted.map((item) => {
    const quantity = clean(item.quantity)
    return `- ${PLACE_TEXT[item.place]} : ${clean(item.name)}${quantity === '' ? '' : ` (${quantity})`}`
  })
  return `Frigo et placards :\n${quoteUser('inventaire', items.join('\n'))}`
}

const SECTION_TEXT: Record<ContextSection, (data: CoachData) => string> = {
  profile: profileSection,
  program: programSection,
  agenda: agendaSection,
  workouts: workoutsSection,
  climbing: climbingSection,
  oura: ouraSection,
  weights: weightsSection,
  nutrition: nutritionSection,
  body: bodySection,
  pantry: pantrySection,
}

/**
 * Les données du coach en texte, entre balises <donnees> : seulement les parties demandées, toujours dans
 * le même ordre. Le texte ne dépend que des données (aucune heure) : les mêmes données donnent exactement
 * le même texte, que l'API peut garder en cache.
 */
export function buildCoachContext(data: CoachData, sections: readonly ContextSection[]): string {
  const parts = ALL_SECTIONS.filter((section) => sections.includes(section)).map((section) =>
    SECTION_TEXT[section](data),
  )
  return promptText(`<donnees>\n${[`Date : ${day(data.date)}`, ...parts].join('\n\n')}\n</donnees>`)
}
