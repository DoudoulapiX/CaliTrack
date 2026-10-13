import { workoutFromCoachPlan, type CoachPlan } from '@/content/coach/today'
import { isDeloadWeek } from '@/content/programs/schedule'
import { workoutFromSession } from '@/content/workouts/workout'
import type { Program, ProgramSession, Workout } from '@/db/types'
import { nowISO, today, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'

/**
 * Prépare une séance du programme au moment où on la commence (jour, heure, semaine allégée).
 * plannedFor : le jour prévu qu'elle remplit, quand on l'a choisi (rattrapage, séance avancée).
 */
export function programSessionBuilder(
  program: Program,
  session: ProgramSession,
  plannedFor: ISODate | null = null,
): () => Workout {
  return () => {
    const date = today()
    return workoutFromSession({
      programId: program.id,
      session,
      date,
      now: nowISO(),
      deload: isDeloadWeek(program, date),
      newId,
      plannedFor,
    })
  }
}

/**
 * Prépare la séance du programme ajustée par le coach du jour (voir workoutFromCoachPlan) : les
 * exercices changés ne comptent pas pour la progression, les autres progressent comme d'habitude.
 */
export function coachSessionBuilder(
  program: Program,
  session: ProgramSession,
  plannedFor: ISODate | null,
  plan: Pick<CoachPlan, 'changes'>,
): () => Workout {
  return () => {
    const date = today()
    return workoutFromCoachPlan({
      programId: program.id,
      session,
      date,
      now: nowISO(),
      deload: isDeloadWeek(program, date),
      newId,
      plannedFor,
      plan,
    })
  }
}
