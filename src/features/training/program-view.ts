import type { Exercise, Location, Profile, Program, ProgramSession, ProgramSlot } from '@/db/types'
import type { SlotPatch } from '@/content/programs/edit'
import { sessionMinutes } from '@/content/programs/generator'
import { ladderFor, type Ladder } from '@/content/programs/ladders'
import { slotStepIndex } from '@/content/programs/progression'
import { sameTarget } from '@/content/programs/targets'
import { WEEKDAY_SHORT, type Weekday } from '@/lib/dates'

/** « Lun, Jeu », ou « Pas de jour prévu ». */
export function daysLabel(weekdays: readonly Weekday[]): string {
  if (weekdays.length === 0) return 'Pas de jour prévu'
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ')
}

/** Exercices travaillés dans une séance (échauffement et étirements à part). */
export function workCount(session: Pick<ProgramSession, 'blocks'>): number {
  return session.blocks
    .filter((block) => block.kind !== 'warmup' && block.kind !== 'cooldown')
    .reduce((sum, block) => sum + block.slots.length, 0)
}

/** « 8 exercices · environ 55 min » ; « Séance vide ». */
export function sessionSummary(session: ProgramSession, exercises: ReadonlyMap<string, Exercise>): string {
  const total = session.blocks.reduce((sum, block) => sum + block.slots.length, 0)
  if (total === 0) return 'Séance vide'
  const n = workCount(session)
  const count = n === 0 ? `${total} exercice${total > 1 ? 's' : ''}` : `${n} exercice${n > 1 ? 's' : ''}`
  return `${count} · environ ${sessionMinutes(session, exercises)} min`
}

/** Matériel pris en compte par le programme. */
export function locationLabel(program: Pick<Program, 'locationId'>, locations: readonly Location[]): string {
  if (program.locationId === null) return 'Tout mon matériel'
  return locations.find((l) => l.id === program.locationId)?.name ?? 'Lieu supprimé'
}

export interface LadderInfo {
  ladder: Ladder
  /** Échelon en cours, à partir de 1. */
  step: number
  total: number
  /** Exercice de l'échelon suivant (null au bout de la progression). */
  nextExerciseId: string | null
}

/** Où en est un exercice dans sa progression. */
export function ladderInfo(slot: Pick<ProgramSlot, 'ladderId' | 'exerciseId' | 'target'>): LadderInfo | null {
  const ladder = ladderFor(slot.ladderId)
  if (!ladder) return null
  const index = slotStepIndex(ladder, slot)
  if (index < 0) return null
  const next = ladder.steps[index + 1]
  return {
    ladder,
    step: index + 1,
    total: ladder.steps.length,
    nextExerciseId: next?.exerciseIds[0] ?? null,
  }
}

/** Durée courte pour un réglage au pouce : « 45 s », « 1 min 30 », « 2 min ». */
export function compactDuration(sec: number): string {
  if (sec < 60) return `${sec} s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m} min` : `${m} min ${String(s).padStart(2, '0')}`
}

export type SlotDraft = Pick<ProgramSlot, 'exerciseId' | 'sets' | 'target' | 'loadKg' | 'restSec' | 'note'>

/** Ce qui a vraiment changé : le reste du créneau (et sa progression en cours) est gardé. */
export function slotPatch(slot: ProgramSlot, draft: SlotDraft): SlotPatch {
  const patch: SlotPatch = {}
  if (draft.exerciseId !== slot.exerciseId) patch.exerciseId = draft.exerciseId
  if (draft.sets !== slot.sets) patch.sets = draft.sets
  if (!sameTarget(draft.target, slot.target)) patch.target = draft.target
  if (draft.loadKg !== slot.loadKg) patch.loadKg = draft.loadKg
  if (draft.restSec !== slot.restSec) patch.restSec = draft.restSec
  if (draft.note.trim() !== slot.note) patch.note = draft.note.trim()
  return patch
}

/** Les jours ou les objectifs du profil ne correspondent plus à ce programme calculé. */
export function programOutdated(
  program: Pick<Program, 'source' | 'sessions' | 'focuses'>,
  profile: Pick<Profile, 'trainingDays' | 'focuses'>,
): boolean {
  if (program.source !== 'generated') return false
  const days = [...new Set(program.sessions.flatMap((s) => s.weekdays))].sort((a, b) => a - b)
  const wanted = [...new Set(profile.trainingDays)].sort((a, b) => a - b)
  const sameDays = days.length === wanted.length && days.every((d, i) => d === wanted[i])
  const sameFocuses =
    new Set(program.focuses).size === new Set(profile.focuses).size &&
    program.focuses.every((f) => profile.focuses.includes(f))
  return !sameDays || !sameFocuses
}
