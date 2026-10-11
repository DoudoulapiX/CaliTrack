import { Navigate, useParams } from 'react-router'
import { SearchX } from 'lucide-react'
import { ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { Page } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { climbLivePath } from './climb-view'
import { ClimbSummary } from './ClimbSummary'
import { LiveClimb } from './LiveClimb'
import { useClimb } from './useClimbing'

function MissingClimb() {
  return (
    <Page title="Séance" back backTo="/climbing" backLabel="Escalade">
      <EmptyState
        icon={<SearchX size={32} aria-hidden />}
        title="Séance introuvable"
        text="Elle a peut-être été supprimée."
        action={<ButtonLink to="/climbing/history">Voir mes séances</ButtonLink>}
      />
    </Page>
  )
}

/** La séance d'escalade en cours, puis son bilan une fois terminée. */
export function ClimbSessionPage() {
  const { id } = useParams()
  const session = useClimb(id)
  if (session === undefined) return <PageSpinner />
  if (session === null) return <MissingClimb />
  if (session.status === 'active') return <LiveClimb key={session.id} session={session} />
  return <ClimbSummary key={session.id} session={session} mode="finished" />
}

/** Une séance de l'historique (une séance encore en cours s'ouvre à son écran). */
export function ClimbHistorySessionPage() {
  const { id } = useParams()
  const session = useClimb(id)
  if (session === undefined) return <PageSpinner />
  if (session === null) return <MissingClimb />
  if (session.status === 'active') return <Navigate to={climbLivePath(session.id)} replace />
  return <ClimbSummary key={session.id} session={session} mode="history" />
}
