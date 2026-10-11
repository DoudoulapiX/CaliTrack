import { useState } from 'react'
import { History } from 'lucide-react'
import { useGoBack } from '@/app/useGoBack'
import { capitalize, formatDay } from '@/lib/dates'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { LoadMore } from '@/ui/LoadMore'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { climbHistoryPath, climbSubtitle, groupClimbsByMonth } from './climb-view'
import { useClimbs } from './useClimbing'

const PAGE = 30

/** Toutes les séances d'escalade terminées, par mois, la plus récente d'abord. */
export function ClimbHistoryPage() {
  const climbs = useClimbs()
  const goBack = useGoBack('/climbing')
  const [limit, setLimit] = useState(PAGE)
  if (climbs === undefined) return <PageSpinner />
  const done = climbs.filter((session) => session.status === 'done')

  return (
    <Page title="Séances d’escalade" back onBack={goBack} backLabel="Escalade" large>
      {done.length === 0 ? (
        <EmptyState
          icon={<History size={36} aria-hidden />}
          title="Pas encore de séance"
          text="Tes séances d’escalade terminées apparaîtront ici, avec leurs blocs."
        />
      ) : (
        <>
          {groupClimbsByMonth(done.slice(0, limit)).map((month) => (
            <Section key={month.key} title={month.title}>
              <ListGroup>
                {month.sessions.map((session) => (
                  <ListRow
                    key={session.id}
                    title={capitalize(formatDay(session.date, 'EEEE d'))}
                    subtitle={climbSubtitle(session)}
                    to={climbHistoryPath(session.id)}
                  />
                ))}
              </ListGroup>
            </Section>
          ))}
          {done.length > limit && (
            <LoadMore
              remaining={done.length - limit}
              onMore={() => {
                setLimit((n) => n + PAGE)
              }}
            />
          )}
        </>
      )}
    </Page>
  )
}
