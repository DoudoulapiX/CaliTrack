import type {
  BlockKind,
  Exercise,
  Program,
  ProgramSlot,
  ProgressionChange,
  ProgressionKind,
  SlotTarget,
  Workout,
  WorkoutSet,
} from '@/db/types'
import { ladderFor, WEIGHT_KINDS, type Ladder } from './ladders'
import { heavierLoad, lighterLoad } from './loads'
import { nextAvailableStep, previousAvailableStep, resolveStep, type TrainingContext } from './resolve'
import type { Scheme } from './schemes'
import { isNegative, targetForStep } from './targets'

/*
 * Progression d'une séance à l'autre (double progression) :
 * - toutes les séries prévues au haut de la fourchette : charge plus lourde, sinon version plus dure,
 *   sinon un lest, sinon quelques répétitions ou secondes de plus ;
 * - deux séances de suite sous le bas de la fourchette (en moyenne) : charge plus légère, sinon version
 *   plus facile, sinon un objectif un peu plus bas ;
 * - entre les deux, on garde le même objectif.
 * L'échauffement et les étirements ne progressent pas, ni rien pendant une semaine allégée.
 */

export type SlotOutcome = 'success' | 'fail' | 'hold' | 'none'

/** Séances ratées d'affilée avant de redescendre d'un cran. */
export const FAILS_BEFORE_RETREAT = 2

const REPS_CAP = 30
const NEGATIVE_REPS_CAP = 8
const HOLD_CAP_SEC = 120
const CARDIO_CAP_SEC = 300

/** Blocs dont les exercices ne progressent pas. */
const STATIC_BLOCKS: readonly BlockKind[] = ['warmup', 'cooldown']

function valueOf(set: WorkoutSet, kind: SlotTarget['kind']): number | null {
  return kind === 'time' ? set.durationSec : set.reps
}

/** Bilan d'un exercice sur une séance, comparé à ce que prévoyait le programme. */
export function slotOutcome(
  slot: Pick<ProgramSlot, 'sets' | 'target' | 'loadKg'>,
  sets: readonly WorkoutSet[],
): SlotOutcome {
  const done = sets
    .filter((set) => set.done)
    .map((set) => ({ value: valueOf(set, slot.target.kind), loadKg: set.loadKg ?? slot.loadKg }))
    .filter((set): set is { value: number; loadKg: number | null } => set.value !== null)
  if (done.length === 0) return 'none'
  const average = done.reduce((sum, set) => sum + set.value, 0) / done.length
  if (average < slot.target.min) return 'fail'
  const planned = slot.loadKg
  const heavyEnough = (loadKg: number | null) => planned === null || (loadKg ?? 0) >= planned
  const allAtTop = done.every((set) => set.value >= slot.target.max && heavyEnough(set.loadKg))
  return done.length >= slot.sets && allAtTop ? 'success' : 'hold'
}

/**
 * Échelon d'un exercice dans sa progression. Un même exercice peut revenir avec un objectif plus
 * haut (muscle-up : 1 puis 5) : c'est alors l'objectif en cours qui départage.
 */
export function slotStepIndex(ladder: Ladder, slot: Pick<ProgramSlot, 'exerciseId' | 'target'>): number {
  const matches = ladder.steps.flatMap((s, i) => (s.exerciseIds.includes(slot.exerciseId) ? [i] : []))
  if (matches.length <= 1) return matches[0] ?? -1
  for (const i of [...matches].reverse()) {
    const goal = ladder.steps[i]?.goal
    if (goal && slot.target.max >= goal.value) return i
  }
  return matches[0] ?? -1
}

/** Fourchette un peu plus haute (null si on est déjà au plafond). */
export function widerTarget(target: SlotTarget, exerciseId: string, blockKind: BlockKind): SlotTarget | null {
  if (target.kind === 'reps') {
    const cap = isNegative(exerciseId) ? NEGATIVE_REPS_CAP : REPS_CAP
    if (target.max >= cap) return null
    const step = target.max < 10 ? 1 : 2
    return { kind: 'reps', min: Math.min(target.min + step, cap), max: Math.min(target.max + step, cap) }
  }
  const cap = blockKind === 'conditioning' ? CARDIO_CAP_SEC : HOLD_CAP_SEC
  if (target.max >= cap) return null
  const step = target.max < 60 ? 5 : 10
  return { kind: 'time', min: Math.min(target.min + step, cap), max: Math.min(target.max + step, cap) }
}

/** Fourchette un peu plus basse (null si on ne peut pas descendre plus). */
export function narrowerTarget(target: SlotTarget): SlotTarget | null {
  const floor = target.kind === 'reps' ? 1 : 5
  const step = target.kind === 'reps' ? (target.max <= 10 ? 1 : 2) : target.max <= 60 ? 5 : 10
  const min = Math.max(floor, target.min - step)
  const max = Math.max(floor, target.max - step)
  if (min === target.min && max === target.max) return null
  return { kind: target.kind, min, max }
}

/** La charge vient de l'exercice lui-même (haltères…) et non d'un lest que l'on peut enlever. */
function ownLoad(exercise: Exercise): boolean {
  return exercise.equipment.flat().some((kind) => WEIGHT_KINDS.includes(kind))
}

interface Move {
  kind: ProgressionKind
  exerciseId: string
  target: SlotTarget
  loadKg: number | null
}

interface SlotState {
  slot: ProgramSlot
  blockKind: BlockKind
  exercise: Exercise | undefined
  ladder: Ladder | null
  /** Échelon de l'exercice dans sa progression (-1 : hors progression). */
  index: number
  context: TrainingContext
  scheme: Scheme
}

/** Ce qui change après une séance réussie (null : rien de plus à proposer ici). */
function advance(state: SlotState, usedLoadKg: number | null): Move | null {
  const { slot, exercise, ladder, index, context, scheme } = state
  const same = { exerciseId: slot.exerciseId, target: slot.target }
  if (exercise && slot.loadKg !== null) {
    const heavier = heavierLoad(context.loadsOf(exercise), Math.max(slot.loadKg, usedLoadKg ?? 0))
    if (heavier !== null) return { kind: 'moreLoad', ...same, loadKg: heavier }
  }
  if (ladder && index >= 0) {
    const next = nextAvailableStep(ladder, index, context)
    const step = ladder.steps[next]
    const resolved = step ? resolveStep(step, context) : null
    const nextExercise = resolved ? context.exercises.get(resolved.exerciseId) : undefined
    if (resolved && nextExercise) {
      return {
        kind: 'levelUp',
        exerciseId: resolved.exerciseId,
        target: targetForStep(ladder, next, nextExercise, scheme),
        loadKg: resolved.loadKg,
      }
    }
  }
  // Au bout de la progression (ou hors progression) : un lest, s'il y en a un.
  if (exercise && slot.loadKg === null) {
    const lightest = context.loadsOf(exercise)[0]
    if (lightest !== undefined) return { kind: 'moreLoad', ...same, loadKg: lightest }
  }
  const wider = widerTarget(slot.target, slot.exerciseId, state.blockKind)
  return wider ? { kind: 'moreReps', exerciseId: slot.exerciseId, target: wider, loadKg: slot.loadKg } : null
}

/** Ce qui change après deux séances ratées (null : on ne peut pas faire plus simple). */
function retreat(state: SlotState): Move | null {
  const { slot, exercise, ladder, index, context, scheme } = state
  const same = { exerciseId: slot.exerciseId, target: slot.target }
  if (exercise && slot.loadKg !== null) {
    const minKg = (ladder && index >= 0 ? ladder.steps[index]?.minLoadKg : undefined) ?? 0
    const lighter = lighterLoad(context.loadsOf(exercise), slot.loadKg)
    if (lighter !== null && lighter >= minKg) return { kind: 'lessLoad', ...same, loadKg: lighter }
    // Lest sur un exercice au poids du corps : on l'enlève.
    if (minKg === 0 && !ownLoad(exercise)) return { kind: 'lessLoad', ...same, loadKg: null }
  }
  if (ladder && index >= 0) {
    const previous = previousAvailableStep(ladder, index, context)
    const step = ladder.steps[previous]
    const resolved = step ? resolveStep(step, context) : null
    const previousExercise = resolved ? context.exercises.get(resolved.exerciseId) : undefined
    if (resolved && previousExercise) {
      return {
        kind: 'levelDown',
        exerciseId: resolved.exerciseId,
        target: targetForStep(ladder, previous, previousExercise, scheme),
        loadKg: resolved.loadKg,
      }
    }
  }
  const narrower = narrowerTarget(slot.target)
  return narrower
    ? { kind: 'lessReps', exerciseId: slot.exerciseId, target: narrower, loadKg: slot.loadKg }
    : null
}

export interface SlotProgressInput {
  slot: ProgramSlot
  blockKind: BlockKind
  /** Séries notées pour cet exercice pendant la séance. */
  sets: readonly WorkoutSet[]
  context: TrainingContext
  scheme: Scheme
}

export interface SlotProgress {
  slot: ProgramSlot
  /** Ce qui change pour la prochaine fois (null : même objectif). */
  change: ProgressionChange | null
}

/** Met à jour un exercice du programme d'après ce qui a été fait pendant la séance. */
export function progressSlot(input: SlotProgressInput): SlotProgress {
  const { slot, blockKind, context } = input
  if (STATIC_BLOCKS.includes(blockKind)) return { slot, change: null }
  const outcome = slotOutcome(slot, input.sets)
  if (outcome === 'none') return { slot, change: null }
  if (outcome === 'hold') return { slot: { ...slot, successStreak: 0, failStreak: 0 }, change: null }

  const ladder = ladderFor(slot.ladderId)
  const state: SlotState = {
    slot,
    blockKind,
    exercise: context.exercises.get(slot.exerciseId),
    ladder,
    index: ladder ? slotStepIndex(ladder, slot) : -1,
    context,
    scheme: input.scheme,
  }

  let move: Move | null
  let streaks: Pick<ProgramSlot, 'successStreak' | 'failStreak'>
  if (outcome === 'success') {
    const loads = input.sets.filter((set) => set.done && set.loadKg !== null).map((set) => set.loadKg ?? 0)
    const used = loads.length > 0 ? Math.min(...loads) : null
    move = advance(state, used) ?? {
      kind: 'keep',
      exerciseId: slot.exerciseId,
      target: slot.target,
      loadKg: slot.loadKg,
    }
    streaks = { successStreak: move.kind === 'keep' ? slot.successStreak + 1 : 0, failStreak: 0 }
  } else {
    const fails = slot.failStreak + 1
    if (fails < FAILS_BEFORE_RETREAT) {
      return { slot: { ...slot, successStreak: 0, failStreak: fails }, change: null }
    }
    move = retreat(state)
    streaks = { successStreak: 0, failStreak: 0 }
    if (!move) return { slot: { ...slot, ...streaks }, change: null }
  }

  const exerciseChanged = move.exerciseId !== slot.exerciseId
  const updated: ProgramSlot = {
    ...slot,
    ...streaks,
    exerciseId: move.exerciseId,
    target: move.target,
    loadKg: move.loadKg,
    // La note concernait l'ancien exercice.
    note: exerciseChanged ? '' : slot.note,
  }
  return {
    slot: updated,
    change: {
      slotId: slot.id,
      fromExerciseId: slot.exerciseId,
      toExerciseId: move.exerciseId,
      fromTarget: slot.target,
      toTarget: move.target,
      fromLoadKg: slot.loadKg,
      toLoadKg: move.loadKg,
      kind: move.kind,
    },
  }
}

/**
 * Applique une séance terminée au programme : chaque exercice fait tel que prévu progresse
 * (ou recule). Un exercice remplacé pendant la séance ne compte pas.
 */
export function progressProgram(
  program: Program,
  workout: Pick<Workout, 'exercises' | 'deload'>,
  context: TrainingContext,
  scheme: Scheme,
): { program: Program; changes: ProgressionChange[] } {
  if (workout.deload) return { program, changes: [] }
  const changes: ProgressionChange[] = []
  const sessions = program.sessions.map((session) => ({
    ...session,
    blocks: session.blocks.map((block) => ({
      ...block,
      slots: block.slots.map((slot) => {
        const done = workout.exercises.find((e) => e.slotId === slot.id && e.exerciseId === slot.exerciseId)
        if (!done) return slot
        const result = progressSlot({ slot, blockKind: block.kind, sets: done.sets, context, scheme })
        if (result.change) changes.push(result.change)
        return result.slot
      }),
    })),
  }))
  return { program: { ...program, sessions }, changes }
}
