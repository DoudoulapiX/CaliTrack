import type {
  BlockKind,
  Exercise,
  GoalFocus,
  Program,
  ProgramBlock,
  ProgramSession,
  ProgramSlot,
  SessionEmphasis,
  SlotTarget,
} from '@/db/types'
import type { ISODate, Weekday } from '@/lib/dates'
import { ladderFor, MOVEMENT_LADDERS, SKILL_LADDERS, stepIndexOf, WEIGHT_KINDS, type Ladder } from './ladders'
import { baseTarget, CORE_REST_SEC, SKILL_REST_SEC, type Scheme } from './schemes'
import { targetForStep } from './targets'

/*
 * Modifications d'un programme, sans effet de bord : chaque fonction rend un nouveau programme.
 * L'écran d'édition s'en sert, puis enregistre le résultat (db/programs).
 */

export const BLOCK_ORDER: readonly BlockKind[] = [
  'warmup',
  'skill',
  'strength',
  'core',
  'conditioning',
  'cooldown',
]

export const BLOCK_TITLE: Record<BlockKind, string> = {
  warmup: 'Échauffement',
  skill: 'Figures',
  strength: 'Renforcement',
  core: 'Gainage',
  conditioning: 'Cardio',
  cooldown: 'Étirements',
}

export const SESSION_EMPHASIS_LABEL: Record<SessionEmphasis, string> = {
  full: 'Corps complet',
  upper: 'Haut du corps',
  lower: 'Bas du corps',
  push: 'Poussée',
  pull: 'Tirage',
  legs: 'Jambes',
  skills: 'Figures',
}

/** Bornes acceptées à la saisie. */
export const SLOT_LIMITS = {
  sets: [1, 10],
  reps: [1, 100],
  timeSec: [5, 600],
  restSec: [0, 600],
} as const

/* ------------------------------------------------------------------ */
/* Progression d'un exercice                                           */
/* ------------------------------------------------------------------ */

/** Blocs dont les exercices suivent une progression : ni l'échauffement, ni le cardio, ni les étirements. */
export function blockUsesLadder(kind: BlockKind): boolean {
  return kind === 'skill' || kind === 'strength' || kind === 'core'
}

/**
 * Progression à suivre pour un exercice : celle du créneau si l'exercice en fait partie, sinon
 * la progression de base ou de figure qui le contient, sinon aucune.
 */
export function ladderIdFor(exerciseId: string, preferred: string | null): string | null {
  const current = ladderFor(preferred)
  if (current && stepIndexOf(current, exerciseId) >= 0) return current.id
  const all: Ladder[] = [...Object.values(MOVEMENT_LADDERS), ...SKILL_LADDERS]
  return all.find((ladder) => stepIndexOf(ladder, exerciseId) >= 0)?.id ?? null
}

/* ------------------------------------------------------------------ */
/* Créneaux                                                            */
/* ------------------------------------------------------------------ */

export interface SlotDefaults {
  scheme: Scheme
  /** Charges disponibles pour un exercice, croissantes. */
  loadsOf: (exercise: Exercise) => number[]
  newId: () => string
}

function fixedTarget(measure: Exercise['measure']): SlotTarget {
  return measure === 'time' ? { kind: 'time', min: 30, max: 30 } : { kind: 'reps', min: 10, max: 10 }
}

/** L'exercice se fait avec des poids (haltères, kettlebell…) : il lui faut une charge. */
export function needsLoad(exercise: Pick<Exercise, 'equipment'>): boolean {
  return (
    exercise.equipment.length > 0 &&
    exercise.equipment.every((group) => group.some((kind) => WEIGHT_KINDS.includes(kind)))
  )
}

/** Fourchette conseillée pour un exercice : celle de son échelon s'il suit une progression. */
export function targetForExercise(exercise: Exercise, ladderId: string | null, scheme: Scheme): SlotTarget {
  const ladder = ladderFor(ladderId)
  const index = ladder ? stepIndexOf(ladder, exercise.id) : -1
  return ladder && index >= 0
    ? targetForStep(ladder, index, exercise, scheme)
    : baseTarget(scheme, exercise.measure)
}

/**
 * Nouvel exercice ajouté à la main dans un bloc, avec des réglages adaptés au bloc. La progression
 * préférée (celle du créneau que l'on modifie) passe avant les autres si elle contient l'exercice.
 */
export function newSlot(
  exercise: Exercise,
  blockKind: BlockKind,
  defaults: SlotDefaults,
  preferredLadderId: string | null = null,
): ProgramSlot {
  const base = {
    id: defaults.newId(),
    exerciseId: exercise.id,
    note: '',
    successStreak: 0,
    failStreak: 0,
  }
  if (blockKind === 'warmup' || blockKind === 'cooldown') {
    return {
      ...base,
      ladderId: null,
      sets: 1,
      target: fixedTarget(exercise.measure),
      loadKg: null,
      restSec: 0,
    }
  }
  if (blockKind === 'conditioning') {
    const target: SlotTarget =
      exercise.measure === 'time' ? { kind: 'time', min: 30, max: 45 } : { kind: 'reps', min: 10, max: 15 }
    return { ...base, ladderId: null, sets: 3, target, loadKg: null, restSec: 30 }
  }
  const ladderId = ladderIdFor(exercise.id, preferredLadderId)
  // Un exercice qui se fait avec des poids (haltères…) démarre à la plus légère des charges.
  const loadKg = needsLoad(exercise) ? (defaults.loadsOf(exercise)[0] ?? null) : null
  const skill = blockKind === 'skill'
  return {
    ...base,
    ladderId,
    sets: skill && exercise.measure === 'time' ? 4 : defaults.scheme.sets,
    target: targetForExercise(exercise, ladderId, defaults.scheme),
    loadKg,
    restSec: skill ? SKILL_REST_SEC : blockKind === 'core' ? CORE_REST_SEC : defaults.scheme.restSec,
  }
}

/** Ce que l'on peut changer sur un créneau depuis l'écran d'édition. */
export type SlotPatch = Partial<
  Pick<ProgramSlot, 'exerciseId' | 'sets' | 'target' | 'loadKg' | 'restSec' | 'note'>
>

/** Vérifie et range une fourchette : min ≤ max, dans les bornes de saisie. */
export function cleanTarget(target: SlotTarget): SlotTarget {
  const [low, high] = target.kind === 'time' ? SLOT_LIMITS.timeSec : SLOT_LIMITS.reps
  const clamp = (n: number) => Math.min(high, Math.max(low, Math.round(n)))
  const min = clamp(Math.min(target.min, target.max))
  const max = clamp(Math.max(target.min, target.max))
  return { kind: target.kind, min, max }
}

function mapSlots(program: Program, fn: (slot: ProgramSlot, block: ProgramBlock) => ProgramSlot): Program {
  return {
    ...program,
    sessions: program.sessions.map((session) => ({
      ...session,
      blocks: session.blocks.map((block) => ({
        ...block,
        slots: block.slots.map((slot) => fn(slot, block)),
      })),
    })),
  }
}

export function updateSlot(program: Program, slotId: string, patch: SlotPatch): Program {
  return mapSlots(program, (slot, block) => {
    if (slot.id !== slotId) return slot
    const next: ProgramSlot = { ...slot, ...patch }
    if (patch.target) next.target = cleanTarget(patch.target)
    if (patch.sets !== undefined) {
      next.sets = Math.min(SLOT_LIMITS.sets[1], Math.max(SLOT_LIMITS.sets[0], Math.round(patch.sets)))
    }
    if (patch.restSec !== undefined) {
      next.restSec = Math.min(
        SLOT_LIMITS.restSec[1],
        Math.max(SLOT_LIMITS.restSec[0], Math.round(patch.restSec)),
      )
    }
    if (patch.loadKg !== undefined && patch.loadKg !== null && patch.loadKg <= 0) next.loadKg = null
    // Autre exercice : il suit sa propre progression et repart de zéro.
    if (patch.exerciseId !== undefined && patch.exerciseId !== slot.exerciseId) {
      next.ladderId = blockUsesLadder(block.kind) ? ladderIdFor(patch.exerciseId, slot.ladderId) : null
      next.successStreak = 0
      next.failStreak = 0
      if (patch.note === undefined) next.note = ''
    }
    // Objectif changé à la main : les séances précédentes ne comptent plus.
    if (patch.target || patch.loadKg !== undefined) {
      next.successStreak = 0
      next.failStreak = 0
    }
    return next
  })
}

function mapSession(program: Program, sessionId: string, fn: (session: ProgramSession) => ProgramSession) {
  return { ...program, sessions: program.sessions.map((s) => (s.id === sessionId ? fn(s) : s)) }
}

/** Ajoute un créneau à la fin du bloc voulu (créé au bon endroit s'il n'existe pas). */
export function addSlot(
  program: Program,
  sessionId: string,
  blockKind: BlockKind,
  slot: ProgramSlot,
  newId: () => string,
): Program {
  return mapSession(program, sessionId, (session) => {
    if (session.blocks.some((b) => b.kind === blockKind)) {
      return {
        ...session,
        blocks: session.blocks.map((b) => (b.kind === blockKind ? { ...b, slots: [...b.slots, slot] } : b)),
      }
    }
    const block: ProgramBlock = { id: newId(), kind: blockKind, title: BLOCK_TITLE[blockKind], slots: [slot] }
    const rank = (kind: BlockKind) => BLOCK_ORDER.indexOf(kind)
    const blocks = [...session.blocks, block].sort((a, b) => rank(a.kind) - rank(b.kind))
    return { ...session, blocks }
  })
}

/** Retire un créneau ; un bloc vide disparaît. */
export function removeSlot(program: Program, slotId: string): Program {
  return {
    ...program,
    sessions: program.sessions.map((session) => ({
      ...session,
      blocks: session.blocks
        .map((block) => ({ ...block, slots: block.slots.filter((slot) => slot.id !== slotId) }))
        .filter((block) => block.slots.length > 0),
    })),
  }
}

/** Monte (-1) ou descend (+1) un créneau dans son bloc. */
export function moveSlot(program: Program, slotId: string, direction: -1 | 1): Program {
  return {
    ...program,
    sessions: program.sessions.map((session) => ({
      ...session,
      blocks: session.blocks.map((block) => {
        const index = block.slots.findIndex((slot) => slot.id === slotId)
        const target = index + direction
        if (index < 0 || target < 0 || target >= block.slots.length) return block
        const slots = [...block.slots]
        const [moved] = slots.splice(index, 1)
        if (moved) slots.splice(target, 0, moved)
        return { ...block, slots }
      }),
    })),
  }
}

/** Créneau et bloc qui le contiennent. */
export function findSlot(
  program: Program,
  slotId: string,
): { session: ProgramSession; block: ProgramBlock; slot: ProgramSlot } | null {
  for (const session of program.sessions) {
    for (const block of session.blocks) {
      const slot = block.slots.find((s) => s.id === slotId)
      if (slot) return { session, block, slot }
    }
  }
  return null
}

/* ------------------------------------------------------------------ */
/* Séances et programme                                                */
/* ------------------------------------------------------------------ */

export function newSession(name: string, weekdays: readonly Weekday[], newId: () => string): ProgramSession {
  return {
    id: newId(),
    name: name.trim() || 'Séance',
    emphasis: 'full',
    weekdays: [...new Set(weekdays)].sort((a, b) => a - b),
    blocks: [],
  }
}

export function addSession(program: Program, session: ProgramSession): Program {
  return { ...program, sessions: [...program.sessions, session] }
}

export function removeSession(program: Program, sessionId: string): Program {
  return { ...program, sessions: program.sessions.filter((s) => s.id !== sessionId) }
}

export function updateSession(
  program: Program,
  sessionId: string,
  patch: Partial<Pick<ProgramSession, 'name' | 'weekdays' | 'emphasis'>>,
): Program {
  return mapSession(program, sessionId, (session) => ({
    ...session,
    ...patch,
    name: patch.name === undefined ? session.name : patch.name.trim() || session.name,
    weekdays:
      patch.weekdays === undefined ? session.weekdays : [...new Set(patch.weekdays)].sort((a, b) => a - b),
  }))
}

/** Copie d'une séance (nouveaux identifiants, `copyId` pour elle), sans jour prévu. */
export function duplicateSession(
  program: Program,
  sessionId: string,
  newId: () => string,
  copyId: string = newId(),
): Program {
  const source = program.sessions.find((s) => s.id === sessionId)
  if (!source) return program
  const copy: ProgramSession = {
    ...source,
    id: copyId,
    name: `${source.name} (copie)`,
    weekdays: [],
    blocks: source.blocks.map((block) => ({
      ...block,
      id: newId(),
      slots: block.slots.map((slot) => ({ ...slot, id: newId() })),
    })),
  }
  const index = program.sessions.findIndex((s) => s.id === sessionId)
  const sessions = [...program.sessions]
  sessions.splice(index + 1, 0, copy)
  return { ...program, sessions }
}

/** Programme vide, à remplir soi-même. */
export function emptyProgram(args: {
  name: string
  focuses: readonly GoalFocus[]
  locationId: string | null
  startDate: ISODate
  now: string
  newId: () => string
}): Program {
  return {
    id: args.newId(),
    name: args.name.trim() || 'Mon programme',
    active: false,
    source: 'custom',
    focuses: [...args.focuses],
    locationId: args.locationId,
    sessions: [],
    startDate: args.startDate,
    deloadEveryWeeks: null,
    rationale: [],
    notes: '',
    createdAt: args.now,
    updatedAt: args.now,
  }
}

/** Copie d'un programme entier (nouveaux identifiants), inactive. */
export function duplicateProgram(program: Program, now: string, newId: () => string): Program {
  return {
    ...program,
    id: newId(),
    name: `${program.name} (copie)`,
    active: false,
    source: 'custom',
    sessions: program.sessions.map((session) => ({
      ...session,
      id: newId(),
      blocks: session.blocks.map((block) => ({
        ...block,
        id: newId(),
        slots: block.slots.map((slot) => ({ ...slot, id: newId() })),
      })),
    })),
    createdAt: now,
    updatedAt: now,
  }
}

/** Jours où plusieurs séances tombent en même temps. */
export function overlappingDays(program: Pick<Program, 'sessions'>): Weekday[] {
  const counts = new Map<Weekday, number>()
  for (const session of program.sessions) {
    for (const day of session.weekdays) counts.set(day, (counts.get(day) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([day]) => day)
    .sort((a, b) => a - b)
}
