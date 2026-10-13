import type { TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { z } from 'zod'
import { BLOCK_TITLE, blockUsesLadder, targetForExercise } from '@/content/programs/edit'
import { formatTarget } from '@/content/programs/format'
import { ladderFor } from '@/content/programs/ladders'
import { lighterLoad } from '@/content/programs/loads'
import { slotStepIndex } from '@/content/programs/progression'
import { previousAvailableStep, resolveStep, type TrainingContext } from '@/content/programs/resolve'
import { deloadSets, isDeloadWeek } from '@/content/programs/schedule'
import type { Scheme } from '@/content/programs/schemes'
import { emptySet, workoutFromSession } from '@/content/workouts/workout'
import type {
  BlockKind,
  CoachAction,
  CoachBasis,
  CoachChange,
  CoachCheckIn,
  CoachDay,
  CoachDecision,
  Program,
  ProgramSession,
  ProgramSlot,
  SlotTarget,
  Workout,
} from '@/db/types'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { buildCoachContext, type CoachData } from './context'
import { COACH_RULES, promptNumber, promptText, quoteUser } from './prompt'

/*
 * Coach du jour : Claude choisit, d'après la forme du jour, de garder la séance prévue, de l'alléger ou de
 * conseiller le repos. Il ne choisit que parmi ce que CaliTrack lui propose (moins de séries ou une charge
 * plus légère, une version plus facile de la progression, un exercice retiré) ; sa réponse est ramenée
 * dans ces limites avant d'être gardée.
 */

/* ------------------------------------------------------------------ */
/* Ce que le coach peut changer                                        */
/* ------------------------------------------------------------------ */

/** Une version plus facile d'un exercice, prise plus bas dans sa progression. */
export interface SwapOption {
  exerciseId: string
  name: string
  loadKg: number | null
  target: SlotTarget
}

/** Un exercice de la séance prévue et ce que le coach a le droit d'en faire aujourd'hui. */
export interface SlotOption {
  slotId: string
  block: BlockKind
  exerciseId: string
  name: string
  /** Séries à faire aujourd'hui : déjà réduites de moitié en semaine allégée. */
  sets: number
  target: SlotTarget
  loadKg: number | null
  /** Charges disponibles pour cet exercice, croissantes. */
  loads: number[]
  actions: CoachAction[]
  /** Deux versions plus faciles au plus, de la plus proche à la plus facile. */
  swaps: SwapOption[]
}

/** Versions plus faciles proposées pour un exercice : les échelons faisables juste en dessous. */
const MAX_SWAPS = 2

const nameOf = (context: TrainingContext, exerciseId: string) =>
  context.exercises.get(exerciseId)?.name ?? 'Exercice supprimé'

function swapsFor(slot: ProgramSlot, context: TrainingContext, scheme: Scheme): SwapOption[] {
  const ladder = ladderFor(slot.ladderId)
  if (!ladder) return []
  const swaps: SwapOption[] = []
  let index = slotStepIndex(ladder, slot)
  while (swaps.length < MAX_SWAPS) {
    index = previousAvailableStep(ladder, index, context)
    const step = ladder.steps[index]
    if (index < 0 || !step) break
    const resolved = resolveStep(step, context)
    const exercise = resolved ? context.exercises.get(resolved.exerciseId) : undefined
    // Un même exercice revient parfois avec un objectif plus bas (figures) : ce n'est pas une autre version.
    if (!resolved || !exercise || exercise.id === slot.exerciseId) continue
    if (swaps.some((swap) => swap.exerciseId === exercise.id)) continue
    swaps.push({
      exerciseId: exercise.id,
      name: exercise.name,
      loadKg: resolved.loadKg,
      target: targetForExercise(exercise, slot.ladderId, scheme),
    })
  }
  return swaps
}

/**
 * Les exercices de la séance, tels qu'ils seront faits aujourd'hui (séries de la semaine allégée), avec
 * les changements permis : moins de séries ou une charge plus légère, une version plus facile (exercices
 * qui suivent une progression), le retrait (sauf l'échauffement).
 */
export function slotOptions(
  program: Pick<Program, 'startDate' | 'deloadEveryWeeks'>,
  session: ProgramSession,
  date: ISODate,
  context: TrainingContext,
  scheme: Scheme,
): SlotOption[] {
  const deload = isDeloadWeek(program, date)
  return session.blocks.flatMap((block) =>
    block.slots.map((slot) => {
      const exercise = context.exercises.get(slot.exerciseId)
      const loads = exercise ? context.loadsOf(exercise) : []
      const sets = deload ? deloadSets(slot.sets) : slot.sets
      const swaps = blockUsesLadder(block.kind) ? swapsFor(slot, context, scheme) : []
      const actions: CoachAction[] = []
      if (sets > 1 || (slot.loadKg !== null && lighterLoad(loads, slot.loadKg) !== null)) {
        actions.push('lighter')
      }
      if (swaps.length > 0) actions.push('swap')
      if (block.kind !== 'warmup') actions.push('skip')
      return {
        slotId: slot.id,
        block: block.kind,
        exerciseId: slot.exerciseId,
        name: nameOf(context, slot.exerciseId),
        sets,
        target: slot.target,
        loadKg: slot.loadKg,
        loads,
        actions,
        swaps,
      }
    }),
  )
}

/* ------------------------------------------------------------------ */
/* La réponse de Claude, puis son nettoyage                            */
/* ------------------------------------------------------------------ */

/** Ce que Claude renvoie : une forme souple (chaînes et nombres), ramenée dans les limites ensuite. */
export const dailyAdviceOutput = z.object({
  decision: z
    .string()
    .describe(
      '"asPlanned" (séance telle que prévue), "lighter" (séance allégée) ou "rest" (repos conseillé) ; "" sans séance prévue.',
    ),
  headline: z.string().describe('Le conseil en quelques mots, 80 caractères au plus.'),
  summary: z.string().describe('Pourquoi, en deux ou trois phrases, 600 caractères au plus.'),
  tips: z.array(z.string()).describe('Un à quatre conseils courts pour la journée.'),
  changes: z
    .array(
      z.object({
        slotId: z.string().describe('Le slotId de l’exercice, pris dans le tableau <seance>.'),
        action: z.string().describe('"lighter", "swap" ou "skip", parmi les actions permises de l’exercice.'),
        exerciseId: z
          .string()
          .describe('Pour "swap" : l’identifiant d’une des alternatives. Sinon : l’exercice prévu.'),
        sets: z.number().describe('Séries à faire aujourd’hui, au total (au plus celles prévues).'),
        loadKg: z
          .number()
          .nullable()
          .describe(
            'Pour "lighter" : la charge choisie parmi les charges plus légères possibles. Sinon null.',
          ),
        reason: z.string().describe('Pourquoi, en une phrase courte (160 caractères au plus).'),
      }),
    )
    .describe('Seulement pour "lighter" : les exercices changés, un par slotId. Sinon une liste vide.'),
})

export type DailyAdviceOutput = z.infer<typeof dailyAdviceOutput>

/** Le conseil retenu, prêt à être gardé dans le conseil du jour (CoachDay). */
export interface DailyAdvice {
  decision: CoachDecision | null
  changes: CoachChange[]
  headline: string
  summary: string
  tips: string[]
}

export const DECISIONS: readonly CoachDecision[] = ['asPlanned', 'lighter', 'rest']
const CHANGE_ACTIONS = ['keep', 'lighter', 'swap', 'skip'] as const

/**
 * La valeur reçue si elle fait partie des choix permis, sinon la valeur de repli. Même règle que
 * `choice` de content/ai/structured, recopiée ici : ce module sert aussi la carte de l'accueil, qui ne
 * doit pas charger le SDK de Claude (importé par structured).
 */
export function oneOf<T extends string>(value: string, options: readonly T[], fallback: T): T {
  return (options as readonly string[]).includes(value) ? (value as T) : fallback
}

export const HEADLINE_MAX = 80
export const SUMMARY_MAX = 600
export const TIP_MAX = 200
export const MAX_TIPS = 4
export const REASON_MAX = 160

/** Un texte sans espaces autour, coupé à `max` caractères (avec « … » quand il est coupé). */
export function cutText(text: string, max: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  let end = max - 1
  // Ne pas couper un caractère en deux (émoji, lettre hors du plan de base).
  const last = trimmed.charCodeAt(end - 1)
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return `${trimmed.slice(0, end).trimEnd()}…`
}

/**
 * Une charge plus légère demandée, ramenée sur une charge possible : la plus lourde de celles qui ne
 * dépassent pas la demande, sinon celle juste en dessous de la charge prévue. Une demande nulle ou pas
 * plus légère garde la charge prévue.
 */
export function snapLoad(
  requested: number | null,
  loads: readonly number[],
  current: number | null,
): number | null {
  if (current === null || requested === null || requested >= current) return current
  const fitting = loads.filter((kg) => kg <= requested)
  if (fitting.length > 0) return Math.max(...fitting)
  return lighterLoad(loads, current) ?? current
}

const clampSets = (sets: number, max: number) => Math.min(max, Math.max(1, Math.round(sets)))

/** Un changement proposé par Claude, s'il est permis ; null sinon (ou s'il ne change rien). */
function cleanChange(raw: DailyAdviceOutput['changes'][number], option: SlotOption): CoachChange | null {
  const action = oneOf(raw.action, CHANGE_ACTIONS, 'keep')
  if (action === 'keep' || !option.actions.includes(action)) return null
  const base = {
    slotId: option.slotId,
    plannedExerciseId: option.exerciseId,
    reason: cutText(raw.reason, REASON_MAX),
  }
  if (action === 'skip') {
    return {
      ...base,
      action,
      exerciseId: option.exerciseId,
      sets: option.sets,
      target: option.target,
      loadKg: option.loadKg,
    }
  }
  const sets = clampSets(raw.sets, option.sets)
  if (action === 'swap') {
    const swap = option.swaps.find((candidate) => candidate.exerciseId === raw.exerciseId)
    if (!swap) return null
    return { ...base, action, exerciseId: swap.exerciseId, sets, target: swap.target, loadKg: swap.loadKg }
  }
  const loadKg = snapLoad(raw.loadKg, option.loads, option.loadKg)
  if (sets === option.sets && loadKg === option.loadKg) return null
  return { ...base, action, exerciseId: option.exerciseId, sets, target: option.target, loadKg }
}

/**
 * Le conseil de Claude ramené dans les limites : une décision connue, seulement des changements permis
 * (un par exercice, séries comptées sur la séance du jour, charges disponibles), et des textes courts.
 * Sans séance prévue, seuls les textes comptent (« Conseils du jour »).
 */
export function cleanDailyAdvice(
  raw: DailyAdviceOutput,
  options: readonly SlotOption[],
  hasSession: boolean,
): DailyAdvice {
  const texts = {
    headline: cutText(raw.headline, HEADLINE_MAX),
    summary: cutText(raw.summary, SUMMARY_MAX),
    tips: raw.tips
      .map((tip) => cutText(tip, TIP_MAX))
      .filter((tip) => tip !== '')
      .slice(0, MAX_TIPS),
  }
  if (!hasSession) return { decision: null, changes: [], ...texts }

  const decision = oneOf(raw.decision, DECISIONS, 'asPlanned')
  if (decision !== 'lighter') return { decision, changes: [], ...texts }

  const seen = new Set<string>()
  const changes: CoachChange[] = []
  for (const proposed of raw.changes) {
    if (seen.has(proposed.slotId)) continue
    seen.add(proposed.slotId)
    const option = options.find((candidate) => candidate.slotId === proposed.slotId)
    const change = option ? cleanChange(proposed, option) : null
    if (change) changes.push(change)
  }

  const work = options.filter((option) => option.block !== 'warmup')
  const allSkipped =
    work.length > 0 &&
    work.every((option) =>
      changes.some((change) => change.slotId === option.slotId && change.action === 'skip'),
    )
  if (allSkipped) return { decision: 'rest', changes: [], ...texts }
  if (changes.length === 0) return { decision: 'asPlanned', changes: [], ...texts }
  return { decision, changes, ...texts }
}

/* ------------------------------------------------------------------ */
/* La demande                                                          */
/* ------------------------------------------------------------------ */

/** Ce que le coach a mesuré ce jour-là : la nuit (journée Oura du jour) et la dépense de la veille. */
export function coachBasis(data: Pick<CoachData, 'date' | 'oura'>): CoachBasis {
  const night = data.oura.find((row) => row.date === data.date)
  const yesterday = data.oura.find((row) => row.date === addDaysISO(data.date, -1))
  return {
    readinessScore: night?.readinessScore ?? null,
    sleepScore: night?.sleepScore ?? null,
    sleepMin: night?.sleepMin ?? null,
    yesterdayKcal: yesterday?.totalKcal ?? null,
  }
}

const SLEEP_WORD: Record<NonNullable<CoachCheckIn['sleep']>, string> = {
  bad: 'mauvais',
  ok: 'moyen',
  good: 'bon',
}
const ENERGY_WORD: Record<CoachCheckIn['energy'], string> = { low: 'basse', ok: 'normale', high: 'haute' }
const SORENESS_WORD: Record<CoachCheckIn['soreness'], string> = {
  none: 'aucune',
  light: 'légères',
  strong: 'fortes',
}
const ZONE_WORD: Record<CoachCheckIn['zones'][number], string> = {
  back: 'dos',
  chest: 'pectoraux',
  shoulders: 'épaules',
  arms: 'bras',
  forearms: 'avant-bras et doigts',
  core: 'abdos',
  legs: 'jambes',
}

/** Un nom sur une ligne du tableau : sans chevrons, barres ni retours à la ligne. */
const cell = (text: string) => text.replace(/[<>|]/g, ' ').replace(/\s+/g, ' ').trim()

const kg = (value: number) => `${promptNumber(value)} kg`

const duration = (minutes: number) => {
  const rounded = Math.round(minutes)
  return `${String(Math.floor(rounded / 60))} h ${String(rounded % 60).padStart(2, '0')}`
}

function optionLine(option: SlotOption): string {
  const planned = option.loadKg
  const lighter = planned === null ? [] : option.loads.filter((value) => value < planned)
  const choices = lighter.map((value) => promptNumber(value)).join(', ')
  const load =
    planned === null
      ? 'sans charge'
      : `${kg(planned)}${choices === '' ? '' : ` (plus légères possibles : ${choices} kg)`}`
  const swaps = option.swaps
    .map((swap) => {
      const swapLoad = swap.loadKg === null ? '' : `, ${kg(swap.loadKg)}`
      return `${swap.exerciseId} = ${cell(swap.name)} (${formatTarget(swap.target)}${swapLoad})`
    })
    .join(' ; ')
  return [
    option.slotId,
    BLOCK_TITLE[option.block].toLowerCase(),
    `${cell(option.name)} [${option.exerciseId}]`,
    String(option.sets),
    formatTarget(option.target),
    load,
    option.actions.length > 0 ? option.actions.join(', ') : 'aucune',
    swaps === '' ? 'aucune' : swaps,
  ].join(' | ')
}

function checkInText(checkIn: CoachCheckIn): string {
  const zones = checkIn.zones.map((zone) => ZONE_WORD[zone])
  const lines = [
    'Ce que je ressens aujourd’hui :',
    ...(checkIn.sleep === null ? [] : [`- sommeil : ${SLEEP_WORD[checkIn.sleep]}`]),
    `- énergie : ${ENERGY_WORD[checkIn.energy]}`,
    `- courbatures : ${SORENESS_WORD[checkIn.soreness]}${zones.length > 0 ? ` (${zones.join(', ')})` : ''}`,
  ]
  const note = checkIn.note.trim()
  if (note !== '') lines.push('Ma note pour le coach :', quoteUser('note', note))
  return lines.join('\n')
}

function basisText(basis: CoachBasis): string {
  const night = [
    basis.readinessScore === null ? null : `récupération ${String(basis.readinessScore)}`,
    basis.sleepScore === null ? null : `score de sommeil ${String(basis.sleepScore)}`,
    basis.sleepMin === null ? null : `${duration(basis.sleepMin)} de sommeil`,
  ].filter((part) => part !== null)
  return [
    'Mesures du jour :',
    `- bague Oura, nuit qui s'est finie ce matin : ${night.length > 0 ? night.join(', ') : 'pas de données'}`,
    `- dépense d'hier (journée complète) : ${
      basis.yesterdayKcal === null ? 'inconnue' : `${promptNumber(basis.yesterdayKcal, 0)} kcal`
    }`,
  ].join('\n')
}

const SESSION_TASK = `Ta tâche : décide de la séance d'aujourd'hui, d'après ma forme, mon sommeil, mes séances récentes, l'escalade et la semaine à venir.
- decision : "asPlanned" pour faire la séance telle quelle, "lighter" pour l'alléger, "rest" pour conseiller le repos.
- changes : seulement avec "lighter", un objet par exercice changé (slotId du tableau), avec une des actions permises de cet exercice :
  - "lighter" : moins de séries (sets = le total à faire aujourd'hui, au plus celles prévues) ou une charge plus légère (loadKg, parmi les charges plus légères possibles) ;
  - "swap" : une alternative plus facile (exerciseId = son identifiant), sets = séries à faire ;
  - "skip" : retirer l'exercice aujourd'hui.
  Le nombre de séries prévu est déjà celui d'aujourd'hui (semaine allégée comprise). Avec "asPlanned" ou "rest", changes est vide.
- headline : le conseil en quelques mots ; summary : pourquoi, en deux ou trois phrases ; tips : un à quatre conseils pour la journée (récupération, sommeil, repas, hydratation).
Préfère alléger plutôt qu'annuler quand la forme est seulement moyenne. Conseille le repos en cas de grosse fatigue, de courbatures fortes sur les muscles de la séance ou de nuit très courte.`

const TIPS_TASK = `Ta tâche : il n'y a pas de séance du programme à faire aujourd'hui. Donne seulement des conseils pour la journée, d'après ma forme et la semaine à venir.
- decision : "" ; changes : liste vide.
- headline : le conseil en quelques mots ; summary : deux ou trois phrases ; tips : un à quatre conseils pour la journée (récupération, sommeil, repas, hydratation, activité légère).`

export interface DailyPromptArgs {
  data: CoachData
  /** La séance prévue aujourd'hui ; null : pas de séance, des conseils pour la journée. */
  session: { name: string; deload: boolean } | null
  options: readonly SlotOption[]
  checkIn: CoachCheckIn
  basis: CoachBasis
}

/**
 * La demande du conseil du jour : les règles du coach, puis en un seul texte les données utiles, le
 * tableau des exercices prévus et de ce qui peut en changer, le ressenti (la note entre balises) et les
 * mesures du jour.
 */
export function dailyPrompt({ data, session, options, checkIn, basis }: DailyPromptArgs): {
  system: string
  content: TextBlockParam[]
} {
  const context = buildCoachContext(data, [
    'profile',
    'program',
    'agenda',
    'workouts',
    'climbing',
    'oura',
    'weights',
    'nutrition',
  ])
  const sessionText = session
    ? [
        `Séance prévue aujourd'hui : ${cell(session.name)}${session.deload ? ' (semaine allégée : les séries sont déjà réduites de moitié)' : ''}`,
        '<seance>',
        'slotId | bloc | exercice [id] | séries | cible | charge | actions permises | alternatives plus faciles',
        ...options.map(optionLine),
        '</seance>',
      ].join('\n')
    : 'Séance prévue aujourd’hui : aucune.'
  const text = [
    context,
    sessionText,
    checkInText(checkIn),
    basisText(basis),
    session ? SESSION_TASK : TIPS_TASK,
  ].join('\n\n')
  return { system: promptText(COACH_RULES), content: [{ type: 'text', text: promptText(text) }] }
}

/* ------------------------------------------------------------------ */
/* La séance allégée                                                   */
/* ------------------------------------------------------------------ */

/** Le conseil du jour encore valable pour une séance prévue. */
export interface CoachPlan {
  decision: CoachDecision
  /** Les exercices changés, seulement pour une séance allégée. */
  changes: CoachChange[]
  headline: string
}

/**
 * Le conseil du coach à suivre pour cette séance ce jour-là, ou null : pas de conseil, conseil d'un autre
 * jour ou d'une autre séance, ou mis de côté. Un changement dont l'exercice a été modifié depuis dans le
 * programme est oublié ; une séance allégée sans changement restant redevient la séance prévue.
 */
export function coachPlanFor(
  day: CoachDay | null | undefined,
  program: Pick<Program, 'id'>,
  session: ProgramSession,
  date: ISODate,
): CoachPlan | null {
  if (!day || day.date !== date || day.ignored || day.decision === null) return null
  if (day.programId !== program.id || day.programSessionId !== session.id) return null
  const slots = new Map(session.blocks.flatMap((block) => block.slots.map((slot) => [slot.id, slot])))
  const changes =
    day.decision === 'lighter'
      ? day.changes.filter((change) => slots.get(change.slotId)?.exerciseId === change.plannedExerciseId)
      : []
  if (day.decision === 'lighter' && changes.length === 0) {
    return { decision: 'asPlanned', changes: [], headline: day.headline }
  }
  return { decision: day.decision, changes, headline: day.headline }
}

/** Ce qui est écrit sur un exercice changé quand le coach n'a pas donné de raison. */
export const DEFAULT_REASON: Record<Exclude<CoachAction, 'skip'>, string> = {
  lighter: 'Allégé pour aujourd’hui.',
  swap: 'Version plus facile pour aujourd’hui.',
}

/** Termine une phrase par un point (ou la laisse finir par « ! », « ? », « … »). */
const sentence = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`)

/** La note d'un exercice changé par le coach, affichée pendant la séance et dans son bilan. */
export function coachNote(change: Pick<CoachChange, 'action' | 'reason'>): string {
  const reason = change.reason.trim()
  const why = reason !== '' ? sentence(reason) : change.action === 'skip' ? '' : DEFAULT_REASON[change.action]
  return frenchSpacing(`Coach : ${why} Ne compte pas pour la progression.`.replace(/\s+/g, ' '))
}

/**
 * La séance du programme suivie du conseil du jour. Les exercices inchangés sont ceux du programme (et
 * progressent comme d'habitude). Un exercice changé garde son bloc mais perd son créneau (slotId null) :
 * il ne compte pas pour la progression, et ses séries sont celles du conseil, déjà comptées pour la
 * semaine allégée (jamais divisées une seconde fois). Un exercice retiré n'apparaît pas.
 */
export function workoutFromCoachPlan(
  args: Parameters<typeof workoutFromSession>[0] & { plan: Pick<CoachPlan, 'changes'> },
): Workout {
  const { plan, newId } = args
  const workout = workoutFromSession(args)
  const exercises = workout.exercises.flatMap((exercise) => {
    const change = plan.changes.find((candidate) => candidate.slotId === exercise.slotId)
    if (!change) return [exercise]
    if (change.action === 'skip') return []
    const sets = Math.min(change.sets, exercise.sets.length)
    return [
      {
        ...exercise,
        exerciseId: change.exerciseId,
        slotId: null,
        target: change.target,
        sets: Array.from({ length: sets }, () => emptySet(newId, change.loadKg)),
        note: coachNote(change),
      },
    ]
  })
  return { ...workout, exercises }
}
