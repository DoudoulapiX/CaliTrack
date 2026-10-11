import type {
  EquipmentItem,
  EquipmentKind,
  Exercise,
  GoalFocus,
  Location,
  Profile,
  Program,
  ProgramBlock,
  ProgramSession,
  ProgramSlot,
  SessionEmphasis,
  SlotTarget,
} from '@/db/types'
import { EQUIPMENT_LABEL } from '@/content/equipment'
import { canDoWith } from '@/content/exercises/catalog'
import { LEVEL_TEST_ITEMS } from '@/content/level-test'
import { EXPERIENCE_LABEL, GOAL_FOCUS_LABEL, GOAL_FOCUS_ORDER } from '@/content/profile'
import { skillFor } from '@/content/skills'
import { formatDay, formatDuration, WEEKDAY_LONG, type ISODate, type Weekday } from '@/lib/dates'
import { newId as defaultNewId } from '@/lib/ids'
import { frenchSpacing, joinFrench, lowerFirst } from '@/lib/typography'

import {
  ladderFor,
  MOVEMENT_LADDERS,
  skillLadderId,
  stepIndexOf,
  type Ladder,
  type MovementId,
} from './ladders'
import {
  levelEstimates,
  resolveStep,
  startStepIndex,
  trainingContext,
  type LevelEstimates,
  type TrainingContext,
} from './resolve'
import { CORE_REST_SEC, goalTarget, schemeFor, SKILL_REST_SEC, type Scheme } from './schemes'
import { targetForStep } from './targets'
import { BLOCK_TITLE } from './edit'

/*
 * Génère un programme complet à partir du profil (jours, durée, objectifs, niveau, escalade) et du
 * matériel d'un lieu. Tout est déterministe : mêmes données, même programme.
 */

export interface GenerateInput {
  profile: Profile
  items: readonly EquipmentItem[]
  locations: readonly Location[]
  /** Lieu dont le matériel sert au programme ; null : tout le matériel. */
  locationId: string | null
  exercises: ReadonlyMap<string, Exercise>
  /** Programme en cours : on reprend où en est chaque progression au lieu de repartir du test. */
  previous?: Program | null
  startDate: ISODate
  now: string
  newId?: () => string
}

/* ------------------------------------------------------------------ */
/* Modèles de séances                                                  */
/* ------------------------------------------------------------------ */

type SkillRegion = 'push' | 'pull' | 'legs' | 'core'
type WarmupKind = 'upper' | 'lower' | 'full'

interface Template {
  name: string
  emphasis: SessionEmphasis
  /** Mouvements par priorité : les premiers passent toujours, les suivants si le temps le permet. */
  moves: readonly MovementId[]
  skills: readonly SkillRegion[]
  warmup: WarmupKind
}

const TEMPLATES = {
  fullA: {
    name: 'Corps complet',
    emphasis: 'full',
    moves: ['pullV', 'pushH', 'squat', 'pullH', 'dip', 'hinge', 'core', 'compression'],
    skills: ['push', 'pull', 'legs', 'core'],
    warmup: 'full',
  },
  fullB: {
    name: 'Corps complet',
    emphasis: 'full',
    moves: ['pullH', 'dip', 'hinge', 'pullV', 'pushV', 'squat', 'compression', 'core'],
    skills: ['push', 'pull', 'legs', 'core'],
    warmup: 'full',
  },
  fullC: {
    name: 'Corps complet',
    emphasis: 'full',
    moves: ['pullV', 'pushV', 'squat', 'pullH', 'pushH', 'hinge', 'core', 'compression'],
    skills: ['push', 'pull', 'legs', 'core'],
    warmup: 'full',
  },
  upperA: {
    name: 'Haut du corps',
    emphasis: 'upper',
    moves: ['pullV', 'dip', 'pullH', 'pushV', 'pushH', 'compression', 'core'],
    skills: ['push', 'pull', 'core'],
    warmup: 'upper',
  },
  upperB: {
    name: 'Haut du corps',
    emphasis: 'upper',
    moves: ['pullH', 'pushV', 'pullV', 'pushH', 'dip', 'core', 'compression'],
    skills: ['push', 'pull', 'core'],
    warmup: 'upper',
  },
  lowerA: {
    name: 'Bas du corps',
    emphasis: 'lower',
    moves: ['squat', 'hinge', 'lunge', 'calves', 'core', 'compression'],
    skills: ['legs', 'core'],
    warmup: 'lower',
  },
  lowerB: {
    name: 'Bas du corps',
    emphasis: 'lower',
    moves: ['hinge', 'squat', 'calves', 'lunge', 'compression', 'core'],
    skills: ['legs', 'core'],
    warmup: 'lower',
  },
  push: {
    name: 'Poussée',
    emphasis: 'push',
    moves: ['dip', 'pushV', 'pushH', 'core'],
    skills: ['push', 'core'],
    warmup: 'upper',
  },
  pull: {
    name: 'Tirage',
    emphasis: 'pull',
    moves: ['pullV', 'pullH', 'compression', 'hinge'],
    skills: ['pull', 'core'],
    warmup: 'upper',
  },
  legs: {
    name: 'Jambes',
    emphasis: 'legs',
    moves: ['squat', 'hinge', 'lunge', 'calves', 'core', 'compression'],
    skills: ['legs', 'core'],
    warmup: 'lower',
  },
  recovery: {
    name: 'Figures et mobilité',
    emphasis: 'skills',
    moves: ['core'],
    skills: ['push', 'legs', 'core'],
    warmup: 'full',
  },
  /** Séance d'un jour d'escalade ou de la veille : ni tirage ni suspension. */
  sparing: {
    name: 'Poussée et jambes',
    emphasis: 'full',
    moves: ['pushH', 'squat', 'dip', 'hinge', 'pushV', 'core'],
    skills: ['push', 'legs', 'core'],
    warmup: 'full',
  },
} as const satisfies Record<string, Template>

type TemplateKey = keyof typeof TEMPLATES

/** Séances de la semaine selon le nombre de jours d'entraînement. */
const SPLITS: Record<number, readonly TemplateKey[]> = {
  1: ['fullA'],
  2: ['fullA', 'fullB'],
  3: ['fullA', 'fullB', 'fullC'],
  4: ['upperA', 'lowerA', 'upperB', 'lowerB'],
  5: ['upperA', 'lowerA', 'push', 'pull', 'legs'],
  6: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
  7: ['push', 'pull', 'legs', 'push', 'pull', 'legs', 'recovery'],
}

/** Séance sans tirage qui remplace une séance avec tirage un jour à ménager. */
const SPARING_VARIANT: Partial<Record<TemplateKey, TemplateKey>> = {
  fullA: 'sparing',
  fullB: 'sparing',
  fullC: 'sparing',
  upperA: 'push',
  upperB: 'push',
  pull: 'legs',
}

const PULL_MOVES = new Set<MovementId>(['pullV', 'pullH'])

/** Mouvement de remplacement quand le matériel manque. */
const SUBSTITUTES: Record<MovementId, readonly MovementId[]> = {
  pullV: ['pullH'],
  pullH: ['pullV'],
  pushV: ['pushH', 'dip'],
  dip: ['pushH', 'pushV'],
  pushH: ['dip', 'pushV'],
  squat: ['lunge', 'hinge'],
  lunge: ['squat'],
  hinge: ['squat'],
  calves: [],
  core: ['compression'],
  compression: ['core'],
  fingers: [],
}

const SKILL_REGION: Record<string, SkillRegion> = {
  muscleUp: 'pull',
  frontLever: 'pull',
  backLever: 'pull',
  oneArmPullup: 'pull',
  flag: 'pull',
  planche: 'push',
  handstand: 'push',
  hspu: 'push',
  oneArmPushup: 'push',
  lSit: 'core',
  pistol: 'legs',
}

/* ------------------------------------------------------------------ */
/* Placement dans les progressions                                     */
/* ------------------------------------------------------------------ */

interface Placement {
  ladder: Ladder
  exerciseId: string
  loadKg: number | null
  target: SlotTarget
}

/** Où en était cette progression dans le programme précédent (si c'est toujours faisable ici). */
function carriedPlacement(ladder: Ladder, previous: Program | null | undefined, context: TrainingContext) {
  if (!previous) return null
  let best: { index: number; slot: ProgramSlot } | null = null
  for (const session of previous.sessions) {
    for (const block of session.blocks) {
      for (const slot of block.slots) {
        if (slot.ladderId !== ladder.id) continue
        const index = stepIndexOf(ladder, slot.exerciseId)
        const exercise = context.exercises.get(slot.exerciseId)
        if (index < 0 || !exercise || !canDoWith(exercise, context.kinds)) continue
        if (!best || index > best.index) best = { index, slot }
      }
    }
  }
  return best
}

function placeMovement(
  ladder: Ladder,
  estimates: LevelEstimates,
  scheme: Scheme,
  context: TrainingContext,
  previous: Program | null | undefined,
): Placement | null {
  const carried = carriedPlacement(ladder, previous, context)
  const carriedExercise = carried ? context.exercises.get(carried.slot.exerciseId) : undefined
  if (carried && carriedExercise) {
    const { slot } = carried
    if (slot.loadKg === null)
      return { ladder, exerciseId: slot.exerciseId, loadKg: null, target: slot.target }
    // Charge reprise si elle existe ici, sinon la plus proche en dessous.
    const loads = context.loadsOf(carriedExercise)
    const current = slot.loadKg
    const loadKg = loads.includes(current) ? current : (loads.filter((kg) => kg < current).pop() ?? loads[0])
    if (loadKg !== undefined) return { ladder, exerciseId: slot.exerciseId, loadKg, target: slot.target }
  }
  const index = startStepIndex(ladder, estimates, scheme.reps[0], context)
  const s = ladder.steps[index]
  const resolved = s ? resolveStep(s, context) : null
  const exercise = resolved ? context.exercises.get(resolved.exerciseId) : undefined
  if (!resolved || !exercise) return null
  return {
    ladder,
    exerciseId: resolved.exerciseId,
    loadKg: resolved.loadKg,
    target: targetForStep(ladder, index, exercise, scheme),
  }
}

/* ------------------------------------------------------------------ */
/* Figures                                                             */
/* ------------------------------------------------------------------ */

type SkillPlan =
  | { kind: 'ready'; skillId: string; placement: Placement }
  /** Il faut d'abord réussir un exercice du test (8 tractions…). */
  | { kind: 'preparing'; skillId: string; exerciseId: string; goal: number; unit: 'reps' | 'time' }
  /** L'étape en cours est déjà travaillée dans le renforcement. */
  | { kind: 'covered'; skillId: string; exerciseId: string }
  | { kind: 'missing'; skillId: string; equipment: string[] }

/** Progression de base qui contient cet exercice, et à quel échelon. */
function movementOf(exerciseId: string): { move: MovementId; index: number } | null {
  for (const move of Object.keys(MOVEMENT_LADDERS) as MovementId[]) {
    const index = stepIndexOf(MOVEMENT_LADDERS[move], exerciseId)
    if (index >= 0) return { move, index }
  }
  return null
}

const TEST_EXERCISES = new Map(LEVEL_TEST_ITEMS.map((item) => [item.exerciseId, item.key]))

/** Matériel qui manque pour un exercice (le groupe le plus proche), en clair. */
function missingEquipment(exercise: Exercise, kinds: ReadonlySet<EquipmentKind>): string[] {
  let best: EquipmentKind[] | null = null
  for (const group of exercise.equipment) {
    const missing = group.filter((kind) => !kinds.has(kind))
    if (!best || missing.length < best.length) best = missing
  }
  return (best ?? []).map((kind) => lowerFirst(EQUIPMENT_LABEL[kind]))
}

function planSkill(
  skillId: string,
  estimates: LevelEstimates,
  placements: ReadonlyMap<MovementId, Placement | null>,
  context: TrainingContext,
  previous: Program | null | undefined,
): SkillPlan | null {
  const skill = skillFor(skillId)
  const ladder = ladderFor(skillLadderId(skillId))
  if (!skill || !ladder) return null

  // La figure finale doit être faisable avec ce matériel.
  const lastStep = ladder.steps[ladder.steps.length - 1]
  const lastExercise = lastStep ? context.exercises.get(lastStep.exerciseIds[0] ?? '') : undefined
  if (lastExercise && !canDoWith(lastExercise, context.kinds)) {
    return { kind: 'missing', skillId, equipment: missingEquipment(lastExercise, context.kinds) }
  }

  const carried = carriedPlacement(ladder, previous, context)
  if (carried) {
    return {
      kind: 'ready',
      skillId,
      placement: { ladder, exerciseId: carried.slot.exerciseId, loadKg: null, target: carried.slot.target },
    }
  }

  // Échelon où en est une progression de base qui contient l'exercice (-1 : aucune).
  const reached = (exerciseId: string): { at: number; index: number } | null => {
    const movement = movementOf(exerciseId)
    const placement = movement ? placements.get(movement.move) : null
    if (!movement || !placement) return null
    return { at: stepIndexOf(placement.ladder, placement.exerciseId), index: movement.index }
  }

  // Les premiers échelons déjà acquis sont sautés : d'après le test (8 tractions…) ou parce que
  // le renforcement en est déjà plus loin.
  let index = 0
  for (const s of skill.steps) {
    const key = TEST_EXERCISES.get(s.exerciseId)
    const byTest = key !== undefined && estimates[key] >= s.target.value
    const level = reached(s.exerciseId)
    if (!byTest && !(level && level.at > level.index)) break
    index++
  }
  const s = skill.steps[index]
  if (!s) return null
  // Le premier échelon manquant est un exercice du test : le programme y travaille déjà.
  if (TEST_EXERCISES.has(s.exerciseId)) {
    return { kind: 'preparing', skillId, exerciseId: s.exerciseId, goal: s.target.value, unit: s.target.kind }
  }
  const level = reached(s.exerciseId)
  if (level && level.at === level.index) return { kind: 'covered', skillId, exerciseId: s.exerciseId }
  const ladderStep = ladder.steps[index]
  const exercise = context.exercises.get(s.exerciseId)
  if (!ladderStep || !exercise) return null
  if (!resolveStep(ladderStep, context)) {
    return { kind: 'missing', skillId, equipment: missingEquipment(exercise, context.kinds) }
  }
  return {
    kind: 'ready',
    skillId,
    placement: { ladder, exerciseId: s.exerciseId, loadKg: null, target: goalTarget(s.target) },
  }
}

/* ------------------------------------------------------------------ */
/* Durée                                                               */
/* ------------------------------------------------------------------ */

/** Durée estimée d'un exercice (séries, repos et mise en place), en secondes. */
export function slotSeconds(slot: ProgramSlot, exercise: Exercise | undefined): number {
  const sides = exercise?.unilateral ? 2 : 1
  const work = slot.target.kind === 'time' ? slot.target.max : slot.target.max * 3
  const perSet = work * sides + 10
  // Passer d'un exercice à l'autre : rapide pour un mouvement d'échauffement, plus long sinon.
  const transition = slot.sets === 1 ? 15 : 45
  return slot.sets * perSet + Math.max(0, slot.sets - 1) * slot.restSec + transition
}

/** Durée estimée d'une séance, en minutes (arrondie à 5). */
export function sessionMinutes(session: ProgramSession, exercises: ReadonlyMap<string, Exercise>): number {
  const seconds = session.blocks
    .flatMap((block) => block.slots)
    .reduce((sum, slot) => sum + slotSeconds(slot, exercises.get(slot.exerciseId)), 0)
  return Math.max(5, Math.round(seconds / 300) * 5)
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

interface Builder {
  context: TrainingContext
  scheme: Scheme
  newId: () => string
}

function makeSlot(
  builder: Builder,
  exerciseId: string,
  target: SlotTarget,
  options: { ladderId?: string | null; sets?: number; restSec?: number; loadKg?: number | null } = {},
): ProgramSlot {
  return {
    id: builder.newId(),
    ladderId: options.ladderId ?? null,
    exerciseId,
    sets: options.sets ?? 1,
    target,
    loadKg: options.loadKg ?? null,
    restSec: options.restSec ?? 0,
    note: '',
    successStreak: 0,
    failStreak: 0,
  }
}

/** Exercice d'appoint (échauffement, étirement, cardio) s'il existe et que le matériel est là. */
function fixedSlot(
  builder: Builder,
  exerciseId: string,
  target: SlotTarget,
  options: { sets?: number; restSec?: number } = {},
): ProgramSlot | null {
  const exercise = builder.context.exercises.get(exerciseId)
  if (!exercise || !canDoWith(exercise, builder.context.kinds)) return null
  return makeSlot(builder, exerciseId, target, options)
}

/** Séries au plus quand on allonge une séance pour remplir le temps voulu. */
const MAX_SETS = 4

const reps = (n: number): SlotTarget => ({ kind: 'reps', min: n, max: n })
const secs = (n: number): SlotTarget => ({ kind: 'time', min: n, max: n })

function warmupSlots(builder: Builder, kind: WarmupKind, sparing: boolean): ProgramSlot[] {
  const { kinds } = builder.context
  const slots = [
    kinds.has('jumpRope')
      ? fixedSlot(builder, 'Rope_Jumping', secs(60))
      : fixedSlot(builder, 'jumping-jacks', secs(60)),
  ]
  if (kind !== 'lower') {
    slots.push(fixedSlot(builder, 'Arm_Circles', secs(30)), fixedSlot(builder, 'Wrist_Circles', secs(30)))
    slots.push(fixedSlot(builder, 'scap-pushup', reps(10)))
    if (!sparing && kinds.has('pullupBar')) slots.push(fixedSlot(builder, 'scap-pull', reps(8)))
    else if (kinds.has('bands')) slots.push(fixedSlot(builder, 'Band_Pull_Apart', reps(15)))
  }
  if (kind !== 'upper') slots.push(fixedSlot(builder, 'Worlds_Greatest_Stretch', reps(4)))
  if (kind === 'lower') slots.push(fixedSlot(builder, 'Inchworm', reps(5)))
  return slots.filter((slot) => slot !== null)
}

function cooldownSlots(builder: Builder, kind: WarmupKind, climbing: boolean): ProgramSlot[] {
  const upper = ['One_Arm_Against_Wall', 'Kneeling_Forearm_Stretch', 'Childs_Pose']
  const lower = ['Kneeling_Hip_Flexor', 'Seated_Floor_Hamstring_Stretch', 'deep-squat-hold']
  const full = ['Kneeling_Hip_Flexor', 'One_Arm_Against_Wall', 'Kneeling_Forearm_Stretch', 'deep-squat-hold']
  let ids = kind === 'upper' ? upper : kind === 'lower' ? lower : full
  // Grimpeur : l'étirement des avant-bras passe en premier.
  if (climbing && ids.includes('Kneeling_Forearm_Stretch')) {
    ids = ['Kneeling_Forearm_Stretch', ...ids.filter((id) => id !== 'Kneeling_Forearm_Stretch')]
  }
  return ids
    .map((id) => fixedSlot(builder, id, secs(id === 'deep-squat-hold' || id === 'Childs_Pose' ? 45 : 30)))
    .filter((slot) => slot !== null)
}

function conditioningSlots(builder: Builder): ProgramSlot[] {
  const options = { sets: 3, restSec: 30 }
  const candidates = builder.context.kinds.has('jumpRope')
    ? [
        fixedSlot(builder, 'Rope_Jumping', { kind: 'time', min: 45, max: 90 }, options),
        fixedSlot(builder, 'burpee', { kind: 'reps', min: 8, max: 12 }, options),
      ]
    : [
        fixedSlot(builder, 'burpee', { kind: 'reps', min: 8, max: 12 }, options),
        fixedSlot(builder, 'mountain-climber', { kind: 'time', min: 20, max: 40 }, options),
      ]
  return candidates.filter((slot) => slot !== null)
}

interface SessionPlan {
  template: TemplateKey
  weekday: Weekday
  /** Jour d'escalade ou veille : ni tirage ni suspension. */
  sparing: boolean
}

type ReadySkill = Extract<SkillPlan, { kind: 'ready' }>

interface SessionInput {
  plan: SessionPlan
  minutes: number
  focuses: readonly GoalFocus[]
  /** Escalade au moins deux fois par semaine : un seul exercice de tirage par séance complète. */
  lightPull: boolean
  climbing: boolean
  placements: ReadonlyMap<MovementId, Placement | null>
  skills: readonly ReadySkill[]
  /** Travail des doigts à la poutre, une fois par semaine. */
  fingers: Placement | null
}

function chooseMoves(input: SessionInput): MovementId[] {
  const template: Template = TEMPLATES[input.plan.template]
  const limitPull = input.lightPull && (template.emphasis === 'full' || template.emphasis === 'upper')
  const chosen: MovementId[] = []
  let pulls = 0
  for (const move of template.moves) {
    for (const candidate of [move, ...SUBSTITUTES[move]]) {
      if (chosen.includes(candidate)) continue
      const placement = input.placements.get(candidate)
      if (!placement) continue
      if (input.plan.sparing && placement.ladder.grip) continue
      const isPull = PULL_MOVES.has(candidate)
      if (isPull && limitPull && pulls >= 1) continue
      if (isPull) pulls++
      chosen.push(candidate)
      break
    }
  }
  return chosen
}

/** Une figure peut-elle se travailler dans cette séance ? */
function fitsSkill(plan: SessionPlan, skill: ReadySkill): boolean {
  const template: Template = TEMPLATES[plan.template]
  const region = SKILL_REGION[skill.skillId] ?? 'core'
  return template.skills.includes(region) && !(plan.sparing && skill.placement.ladder.grip)
}

/**
 * Répartit les figures dans la semaine : chacune une fois (dans la séance compatible la moins chargée,
 * quitte à en mettre une de plus), puis une deuxième fois s'il reste de la place.
 */
export function assignSkills<T extends ReadySkill>(
  plans: readonly SessionPlan[],
  skills: readonly T[],
  perSession: number,
): T[][] {
  const result = plans.map((): T[] => [])
  for (let pass = 0; pass < 2; pass++) {
    for (const skill of skills) {
      let best = -1
      plans.forEach((plan, i) => {
        const assigned = result[i] ?? []
        if (!fitsSkill(plan, skill) || assigned.includes(skill)) return
        // Premier passage : chaque figure cherche une place, quitte à en ajouter une de plus.
        if (assigned.length >= perSession + (pass === 0 ? 1 : 0)) return
        if (best < 0 || assigned.length < (result[best]?.length ?? 0)) best = i
      })
      if (best >= 0) result[best]?.push(skill)
    }
  }
  return result
}

function buildSession(builder: Builder, input: SessionInput): ProgramSession {
  const template: Template = TEMPLATES[input.plan.template]
  const { exercises } = builder.context
  const { scheme } = builder
  const budget = input.minutes * 60
  const time = (slots: readonly ProgramSlot[]) =>
    slots.reduce((sum, slot) => sum + slotSeconds(slot, exercises.get(slot.exerciseId)), 0)

  const warmup = warmupSlots(builder, template.warmup, input.plan.sparing)

  const skill = input.skills.map(({ placement }) =>
    makeSlot(builder, placement.exerciseId, placement.target, {
      ladderId: placement.ladder.id,
      sets: placement.target.kind === 'time' ? 4 : 3,
      restSec: SKILL_REST_SEC,
    }),
  )

  const moves = chooseMoves(input)
  const isCore = (m: MovementId) => m === 'core' || m === 'compression'
  const coreMoves = moves.filter(isCore)
  const strengthMoves = moves.filter((m) => !isCore(m))
  const slotFor = (move: MovementId, restSec: number): ProgramSlot | null => {
    const placement = input.placements.get(move)
    if (!placement) return null
    return makeSlot(builder, placement.exerciseId, placement.target, {
      ladderId: placement.ladder.id,
      sets: scheme.sets,
      restSec,
      loadKg: placement.loadKg,
    })
  }

  // Séance de récupération : toujours les étirements.
  const withCooldown = input.focuses.includes('mobility') || template.emphasis === 'skills'
  const cooldownAll = cooldownSlots(builder, template.warmup, input.climbing)
  const cooldownReserve = withCooldown ? time(cooldownAll.slice(0, 3)) : 0
  const coreReserve = coreMoves.length > 0 ? 6 * 60 : 0

  const strength: ProgramSlot[] = []
  // Les doigts se travaillent frais : en tête du renforcement.
  const placement = input.fingers
  if (placement) {
    const hang = placement.target.kind === 'time'
    strength.push(
      makeSlot(builder, placement.exerciseId, placement.target, {
        ladderId: placement.ladder.id,
        sets: hang ? 5 : 3,
        restSec: 180,
      }),
    )
  }
  let elapsed = time(warmup) + time(skill) + time(strength)
  const minimum = strength.length + 3
  for (const move of strengthMoves) {
    const slot = slotFor(move, scheme.restSec)
    if (!slot) continue
    const cost = time([slot])
    if (strength.length >= minimum && elapsed + cost + coreReserve + cooldownReserve > budget) break
    strength.push(slot)
    elapsed += cost
  }

  const core: ProgramSlot[] = []
  for (const move of coreMoves) {
    const slot = slotFor(move, CORE_REST_SEC)
    if (!slot) continue
    const cost = time([slot])
    if (core.length >= 1 && elapsed + cost + cooldownReserve > budget) break
    core.push(slot)
    elapsed += cost
  }

  let conditioning: ProgramSlot[] = []
  if (input.focuses.includes('fatLoss') || input.focuses.includes('endurance')) {
    const all = conditioningSlots(builder)
    conditioning = all.filter((_, i) => i === 0 || elapsed + time(all) + cooldownReserve <= budget)
    elapsed += time(conditioning)
  }

  let cooldown: ProgramSlot[] = []
  if (withCooldown) cooldown = cooldownAll.slice(0, template.warmup === 'full' ? 4 : 3)
  else if (elapsed + time(cooldownAll.slice(0, 2)) <= budget) cooldown = cooldownAll.slice(0, 2)
  elapsed += time(cooldown)

  // Ajuste au temps voulu : une série de plus (jusqu'à 4) ou de moins (jusqu'à 2) sur le renforcement.
  const adjustable = [...strength, ...core].filter((slot) => slot.ladderId !== 'fingers')
  for (let changed = true; changed && elapsed < budget - 4 * 60;) {
    changed = false
    for (const slot of adjustable) {
      const extra = time([{ ...slot, sets: slot.sets + 1 }]) - time([slot])
      if (slot.sets >= MAX_SETS || elapsed + extra > budget) continue
      slot.sets += 1
      elapsed += extra
      changed = true
    }
  }
  for (let i = strength.length - 1; i >= 0 && elapsed > budget + 3 * 60; i--) {
    const slot = strength[i]
    while (slot && slot.ladderId !== 'fingers' && slot.sets > 2 && elapsed > budget + 3 * 60) {
      const saved = time([slot]) - time([{ ...slot, sets: slot.sets - 1 }])
      slot.sets -= 1
      elapsed -= saved
    }
  }

  const blocks: ProgramBlock[] = (
    [
      ['warmup', warmup],
      ['skill', skill],
      ['strength', strength],
      ['core', core],
      ['conditioning', conditioning],
      ['cooldown', cooldown],
    ] as const
  )
    .filter(([, slots]) => slots.length > 0)
    .map(([kind, slots]) => ({ id: builder.newId(), kind, title: BLOCK_TITLE[kind], slots }))

  return {
    id: builder.newId(),
    name: template.name,
    emphasis: template.emphasis,
    weekdays: [input.plan.weekday],
    blocks,
  }
}

/* ------------------------------------------------------------------ */
/* Semaine                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_DAYS: readonly Weekday[] = [1, 3, 5]

function nextDay(day: Weekday): Weekday {
  return (day === 7 ? 1 : day + 1) as Weekday
}

const hasPull = (key: TemplateKey) => TEMPLATES[key].moves.some((m: MovementId) => PULL_MOVES.has(m))

/**
 * Attribue les séances aux jours. Les jours d'escalade et leurs veilles reçoivent de préférence
 * les séances sans tirage ; à défaut, la séance est remplacée par sa variante sans tirage.
 */
export function planWeek(days: readonly Weekday[], climbingDays: readonly Weekday[]): SessionPlan[] {
  const sorted = [...new Set(days)].sort((a, b) => a - b)
  const climbing = new Set(climbingDays)
  const sparing = (day: Weekday) => climbing.has(day) || climbing.has(nextDay(day))
  const split = [...(SPLITS[sorted.length] ?? SPLITS[3] ?? [])]

  // Échange une séance avec tirage d'un jour à ménager contre une séance sans tirage d'un jour libre.
  sorted.forEach((day, i) => {
    const key = split[i]
    if (!key || !sparing(day) || !hasPull(key)) return
    const swap = sorted.findIndex((other, j) => {
      const otherKey = split[j]
      return otherKey !== undefined && !sparing(other) && !hasPull(otherKey)
    })
    const swapKey = split[swap]
    if (swap >= 0 && swapKey) {
      split[swap] = key
      split[i] = swapKey
    }
  })

  return sorted.map((weekday, i) => {
    const key = split[i] ?? 'fullA'
    const isSparing = sparing(weekday)
    const template = isSparing && hasPull(key) ? (SPARING_VARIANT[key] ?? key) : key
    return { template, weekday, sparing: isSparing }
  })
}

/* ------------------------------------------------------------------ */
/* Explications                                                        */
/* ------------------------------------------------------------------ */

function dayList(days: readonly Weekday[]): string {
  return joinFrench([...days].sort((a, b) => a - b).map((d) => WEEKDAY_LONG[d]))
}

function exerciseLabel(exercises: ReadonlyMap<string, Exercise>, id: string): string {
  return lowerFirst(exercises.get(id)?.name ?? id)
}

function goalText(
  value: number,
  unit: 'reps' | 'time',
  exerciseId: string,
  exercises: ReadonlyMap<string, Exercise>,
) {
  const name = exerciseLabel(exercises, exerciseId)
  return unit === 'time' ? `${formatDuration(value)} de ${name}` : `${value} ${name}`
}

function rationale(args: {
  profile: Profile
  days: readonly Weekday[]
  scheme: Scheme
  measured: boolean
  locationName: string | null
  context: TrainingContext
  skillPlans: readonly SkillPlan[]
  /** Figures prêtes qu'aucune séance ne peut accueillir, avec la raison. */
  unplaced: readonly { skillId: string; reason: 'climbing' | 'room' }[]
  /** Séances où le tirage est limité à un exercice à cause de l'escalade. */
  pullLimited: 'full' | 'upper' | null
  /** Jour du travail des doigts à la poutre, s'il y en a un. */
  fingersDay: Weekday | null
  /** Durée estimée de chaque séance, en minutes. */
  minutes: readonly number[]
  /** Jour de la séance légère (figures et étirements), s'il y en a une. */
  recoveryDay: Weekday | null
  deloadEveryWeeks: number
}): string[] {
  const { profile, days, scheme, context, skillPlans } = args
  const lines: string[] = []
  const n = days.length
  const shortest = Math.min(...args.minutes)
  const longest = Math.max(...args.minutes)
  const length = shortest === longest ? `environ ${longest} min` : `de ${shortest} à ${longest} min`
  lines.push(
    n > 1
      ? `${n} séances par semaine : ${dayList(days)}, ${length} chacune.`
      : `1 séance par semaine, le ${dayList(days)}, ${length}.`,
  )
  if (longest < profile.sessionMinutes - 10) {
    lines.push(
      `C’est moins que les ${profile.sessionMinutes} min prévues : l’essentiel y est, ajoute des exercices si tu veux allonger.`,
    )
  }
  const [rMin, rMax] = scheme.reps
  const style =
    scheme.id === 'strength'
      ? 'Travail en force'
      : scheme.id === 'muscle'
        ? 'Travail en volume'
        : 'Travail en endurance'
  lines.push(
    `${style} : séries de ${rMin} à ${rMax} répétitions, ${formatDuration(scheme.restSec)} de repos.`,
  )
  if (args.measured && profile.levelTest) {
    lines.push(`Départ calé sur ton test de niveau du ${formatDay(profile.levelTest.date, 'd MMMM yyyy')}.`)
  } else {
    lines.push(
      `Départ calé sur ton niveau déclaré (${lowerFirst(EXPERIENCE_LABEL[profile.experience])}) : le test de niveau l’affinera.`,
    )
  }
  lines.push(
    args.locationName
      ? `Exercices choisis avec le matériel du lieu « ${args.locationName} ».`
      : 'Exercices choisis avec tout ton matériel.',
  )
  if (!context.kinds.has('pullupBar') && !context.kinds.has('rings')) {
    lines.push(
      'Sans barre de traction ni anneaux, le tirage passe par le rowing : une barre ouvrirait les tractions.',
    )
  }
  if (!context.kinds.has('dipBars') && !context.kinds.has('rings')) {
    lines.push('Sans barres parallèles, les dips se font sur un banc ou une chaise.')
  }
  if (profile.climbingDays.length > 0) {
    const climbingList = joinFrench(
      [...profile.climbingDays].sort((a, b) => a - b).map((d) => `le ${WEEKDAY_LONG[d]}`),
    )
    lines.push(
      `Escalade ${climbingList} : ni tirage ni suspension la veille et le jour même, pour ménager tes bras et tes doigts.`,
    )
    if (args.pullLimited) {
      const sessions = args.pullLimited === 'full' ? 'séance complète' : 'séance du haut du corps'
      lines.push(`Un seul exercice de tirage par ${sessions} : l’escalade en fait déjà beaucoup.`)
    }
  }
  if (args.recoveryDay !== null) {
    lines.push(
      `Le ${WEEKDAY_LONG[args.recoveryDay]}, séance légère de figures et d’étirements pour récupérer.`,
    )
  }
  if (args.fingersDay !== null) {
    lines.push(
      `Doigts à la poutre une fois par semaine, le ${WEEKDAY_LONG[args.fingersDay]}, en début de séance.`,
    )
  }
  const unplacedIds = args.unplaced.map((u) => u.skillId)
  const ready = skillPlans.filter((p) => p.kind === 'ready').filter((p) => !unplacedIds.includes(p.skillId))
  if (ready.length > 0) {
    const list = ready.map(
      (p) =>
        `${skillFor(p.skillId)?.name ?? p.skillId} (départ : ${exerciseLabel(context.exercises, p.placement.exerciseId)})`,
    )
    lines.push(`Figures travaillées : ${joinFrench(list)}.`)
  }
  for (const plan of skillPlans) {
    const name = skillFor(plan.skillId)?.name ?? plan.skillId
    if (plan.kind === 'preparing') {
      lines.push(
        `${name} en préparation : il faut d’abord ${goalText(plan.goal, plan.unit, plan.exerciseId, context.exercises)}. Refais ton programme quand tu y arrives.`,
      )
    } else if (plan.kind === 'covered') {
      lines.push(
        `${name} : tu y travailles déjà avec ${exerciseLabel(context.exercises, plan.exerciseId)}, dans le renforcement.`,
      )
    } else if (plan.kind === 'missing') {
      lines.push(`${name} impossible ici, matériel manquant : ${joinFrench(plan.equipment)}.`)
    }
  }
  const noDay = args.unplaced
    .filter((u) => u.reason === 'climbing')
    .map((u) => skillFor(u.skillId)?.name ?? u.skillId)
  if (noDay.length > 0) {
    lines.push(
      `${joinFrench(noDay)} : aucune séance ne s’y prête, toutes tombent la veille ou le jour de l’escalade.`,
    )
  }
  const noRoom = args.unplaced
    .filter((u) => u.reason === 'room')
    .map((u) => skillFor(u.skillId)?.name ?? u.skillId)
  if (noRoom.length > 0) {
    lines.push(
      `Pas de place cette semaine pour ${joinFrench(noRoom)} : deux ou trois figures à la fois progressent mieux.`,
    )
  }
  if (profile.focuses.includes('skills') && profile.targetSkills.length === 0) {
    lines.push('Choisis des figures dans ton profil pour qu’elles entrent dans le programme.')
  }
  if (profile.focuses.includes('fatLoss') || profile.focuses.includes('endurance')) {
    lines.push('Un peu de cardio en fin de séance.')
  }
  if (profile.focuses.includes('mobility')) lines.push('Des étirements à la fin de chaque séance.')
  lines.push(
    'Quand toutes les séries atteignent le haut de la fourchette, l’exercice passe à la version plus dure ou à une charge plus lourde. Deux séances ratées de suite et il redescend d’un cran.',
  )
  lines.push(`Une semaine allégée toutes les ${args.deloadEveryWeeks} semaines pour récupérer.`)
  return lines.map(frenchSpacing)
}

/* ------------------------------------------------------------------ */
/* Programme                                                           */
/* ------------------------------------------------------------------ */

export function programName(focuses: readonly GoalFocus[]): string {
  const labels = GOAL_FOCUS_ORDER.filter((f) => focuses.includes(f)).map((f) => GOAL_FOCUS_LABEL[f])
  const [first, second] = labels
  if (!first) return 'Mon programme'
  return second ? `${first} et ${lowerFirst(second)}` : first
}

/** Lettres A, B, C… pour distinguer les séances de même nom. */
function nameSessions(sessions: ProgramSession[]): void {
  const counts = new Map<string, number>()
  for (const s of sessions) counts.set(s.name, (counts.get(s.name) ?? 0) + 1)
  const seen = new Map<string, number>()
  for (const s of sessions) {
    if ((counts.get(s.name) ?? 0) < 2) continue
    const index = seen.get(s.name) ?? 0
    seen.set(s.name, index + 1)
    s.name = `${s.name} ${String.fromCharCode(65 + index)}`
  }
}

export const DEFAULT_DELOAD_WEEKS = 6

export function generateProgram(input: GenerateInput): Program {
  const { profile, exercises } = input
  const newId = input.newId ?? defaultNewId
  const context = trainingContext(exercises, input.items, input.locationId)
  const scheme = schemeFor(profile.focuses, profile.experience)
  const { values: estimates, measured } = levelEstimates(profile)
  const builder: Builder = { context, scheme, newId }

  const days = profile.trainingDays.length > 0 ? profile.trainingDays : DEFAULT_DAYS
  const plans = planWeek(days, profile.climbingDays)

  const placements = new Map<MovementId, Placement | null>()
  for (const id of Object.keys(MOVEMENT_LADDERS) as MovementId[]) {
    placements.set(id, placeMovement(MOVEMENT_LADDERS[id], estimates, scheme, context, input.previous))
  }

  const skillPlans = profile.focuses.includes('skills')
    ? profile.targetSkills
        .map((id) => planSkill(id, estimates, placements, context, input.previous))
        .filter((plan) => plan !== null)
    : []
  const readySkills = skillPlans.filter((plan) => plan.kind === 'ready')
  const skillsBySession = assignSkills(plans, readySkills, profile.sessionMinutes >= 60 ? 2 : 1)
  const unplaced = readySkills
    .filter((skill) => !skillsBySession.some((list) => list.includes(skill)))
    .map((skill) => ({
      skillId: skill.skillId,
      reason: plans.some((plan) => fitsSkill(plan, skill)) ? ('room' as const) : ('climbing' as const),
    }))
  const lightPull = profile.climbingDays.length >= 2
  const limited = lightPull
    ? plans
        .filter((plan) => !plan.sparing)
        .map((plan) => TEMPLATES[plan.template].emphasis)
        .find((emphasis) => emphasis === 'full' || emphasis === 'upper')
    : undefined
  const pullLimited = limited ?? null

  // Poutre : grimpeurs confirmés seulement, une fois par semaine, un jour sans escalade autour.
  const fingers = placements.get('fingers') ?? null
  const wantsFingers =
    profile.focuses.includes('climbing') &&
    profile.experience !== 'beginner' &&
    fingers !== null &&
    fingers.exerciseId.startsWith('hangboard')
  const fingersIndex = wantsFingers
    ? plans.findIndex(
        (plan) => !plan.sparing && TEMPLATES[plan.template].moves.some((m: MovementId) => PULL_MOVES.has(m)),
      )
    : -1

  const sessions = plans.map((plan, index) =>
    buildSession(builder, {
      plan,
      minutes: profile.sessionMinutes,
      focuses: profile.focuses,
      lightPull,
      climbing: profile.climbingDays.length > 0 || profile.focuses.includes('climbing'),
      placements,
      skills: skillsBySession[index] ?? [],
      fingers: index === fingersIndex ? fingers : null,
    }),
  )
  nameSessions(sessions)

  const location = input.locations.find((l) => l.id === input.locationId) ?? null
  return {
    id: newId(),
    name: programName(profile.focuses),
    active: true,
    source: 'generated',
    focuses: [...profile.focuses],
    locationId: location ? location.id : null,
    sessions,
    startDate: input.startDate,
    deloadEveryWeeks: DEFAULT_DELOAD_WEEKS,
    rationale: rationale({
      profile,
      days,
      scheme,
      measured: measured.length > 0,
      locationName: location?.name ?? null,
      context,
      skillPlans,
      unplaced,
      pullLimited,
      fingersDay: plans[fingersIndex]?.weekday ?? null,
      minutes: sessions.map((session) => sessionMinutes(session, exercises)),
      recoveryDay: plans.find((plan) => plan.template === 'recovery')?.weekday ?? null,
      deloadEveryWeeks: DEFAULT_DELOAD_WEEKS,
    }),
    notes: '',
    createdAt: input.now,
    updatedAt: input.now,
  }
}

/** Lieu proposé par défaut pour le programme : le lieu du jour, sinon la maison, la salle… */
export function defaultProgramLocation(
  locations: readonly Location[],
  currentLocationId: string | null,
): string | null {
  if (currentLocationId && locations.some((l) => l.id === currentLocationId)) return currentLocationId
  for (const icon of ['home', 'gym', 'park', 'other', 'climb'] as const) {
    const found = locations.find((l) => l.icon === icon)
    if (found) return found.id
  }
  return null
}
