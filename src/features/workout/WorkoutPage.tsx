import { Navigate, useParams } from 'react-router'
import { SearchX } from 'lucide-react'
import { ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ActiveWorkout } from './ActiveWorkout'
import { useWorkout, workoutPath } from './useWorkouts'
import { WorkoutSummary } from './WorkoutSummary'

function MissingWorkout() {
  return (
    <Page title="Séance" back backTo="/training" backLabel="Entraînement">
      <EmptyState
        icon={<SearchX size={32} aria-hidden />}
        title="Séance introuvable"
        text="Elle a peut-être été supprimée."
        action={<ButtonLink to="/training/history">Voir l’historique</ButtonLink>}
      />
    </Page>
  )
}

/** La séance en cours, puis son bilan une fois terminée. */
export function WorkoutPage() {
  const { id } = useParams()
  const workout = useWorkout(id)
  if (workout === undefined) return <PageSpinner />
  if (workout === null) return <MissingWorkout />
  if (workout.status === 'active') return <ActiveWorkout key={workout.id} workout={workout} />
  return <WorkoutSummary key={workout.id} workout={workout} mode="finished" />
}

/** Une séance de l'historique (une séance encore en cours s'ouvre à son écran). */
export function HistoryWorkoutPage() {
  const { id } = useParams()
  const workout = useWorkout(id)
  if (workout === undefined) return <PageSpinner />
  if (workout === null) return <MissingWorkout />
  if (workout.status === 'active') return <Navigate to={workoutPath(workout.id)} replace />
  return <WorkoutSummary key={workout.id} workout={workout} mode="history" />
}
