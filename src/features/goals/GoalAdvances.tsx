import { useMemo } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { useProfile } from '@/app/data-context'
import { climbingGoalsAdvancedBy, goalsAdvancedBy, type GoalAdvance } from '@/content/goals/progress'
import type { ClimbingSession, GradeScale, Workout } from '@/db/types'
import { frenchSpacing, joinFrench } from '@/lib/typography'
import { ListGroup } from '@/ui/List'
import { Section } from '@/ui/Page'
import { GoalBar, GoalIcon } from './GoalRow'
import { goalPath, percentLabel, progressLine, stepName, type LineOptions } from './goal-view'
import { useGoals, useLineOptions } from './useGoals'

/** Ce qui a bougé : objectif atteint, étapes franchies, ou simplement où il en est. */
function advanceLine({ before, after, newSteps }: GoalAdvance, options: LineOptions): string {
  if (after.achieved && !before.achieved) return frenchSpacing('Objectif atteint, bravo !')
  if (newSteps.length > 0) {
    const names = newSteps.map((step) => stepName(step.milestone, options.exerciseName))
    return frenchSpacing(
      `${newSteps.length > 1 ? 'Étapes franchies' : 'Étape franchie'} : ${joinFrench(names)}`,
    )
  }
  return progressLine(after, options)
}

/** Objectifs qui ont avancé, avec l'avancement avant et après (bilan de séance). */
export function GoalAdvanceList({ advances }: { advances: readonly GoalAdvance[] }) {
  const options = useLineOptions()
  if (advances.length === 0) return null

  return (
    <Section title="Objectifs">
      <ListGroup>
        {advances.map((advance) => {
          const { goal, before, after } = advance
          const line = advanceLine(advance, options)
          const from = percentLabel(before)
          const to = percentLabel(after)
          return (
            <li key={goal.id}>
              <Link
                to={goalPath(goal.id)}
                aria-label={`${goal.title} : ${line}, de ${from} à ${to}`}
                className="flex items-center gap-3 px-4 py-3 active:bg-surface-2"
              >
                <GoalIcon kind={goal.kind} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium text-ink">{goal.title}</span>
                  <span className="mt-0.5 block text-[13px] text-ink-3">{line}</span>
                  <span className="mt-2 flex items-center gap-2">
                    <GoalBar progress={after} label={`Avancement de « ${goal.title} »`} />
                    <span className="shrink-0 text-[13px] font-semibold text-ink-2 tabular">
                      {from} → {to}
                    </span>
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ListGroup>
    </Section>
  )
}

/** Objectifs qu'une séance d'entraînement a fait avancer. */
export function GoalAdvances({ workout, workouts }: { workout: Workout; workouts: readonly Workout[] }) {
  const goals = useGoals()
  const { levelTest } = useProfile()
  const advances = useMemo(
    () => (goals ? goalsAdvancedBy(workout, goals, workouts, levelTest) : []),
    [workout, goals, workouts, levelTest],
  )
  return <GoalAdvanceList advances={advances} />
}

/** Objectifs d'escalade qu'une séance d'escalade a fait avancer. */
export function ClimbingGoalAdvances({
  session,
  climbs,
  scales,
}: {
  session: ClimbingSession
  climbs: readonly ClimbingSession[]
  scales: readonly GradeScale[]
}) {
  const goals = useGoals()
  const advances = useMemo(
    () => (goals ? climbingGoalsAdvancedBy(session, goals, climbs, scales) : []),
    [session, goals, climbs, scales],
  )
  return <GoalAdvanceList advances={advances} />
}
