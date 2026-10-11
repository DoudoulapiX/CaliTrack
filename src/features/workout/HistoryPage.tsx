import { useState } from 'react'
import { History } from 'lucide-react'
import { useGoBack } from '@/app/useGoBack'
import { capitalize, formatDay } from '@/lib/dates'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { LoadMore } from '@/ui/LoadMore'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { historyPath, useDoneWorkouts } from './useWorkouts'
import { groupByMonth, workoutSubtitle } from './workout-view'

const PAGE = 30

/** Toutes les séances terminées, par mois, la plus récente d'abord. */
export function HistoryPage() {
  const workouts = useDoneWorkouts()
  const goBack = useGoBack('/training')
  const [limit, setLimit] = useState(PAGE)
  if (workouts === undefined) return <PageSpinner />

  return (
    <Page title="Historique" back onBack={goBack} backLabel="Entraînement" large>
      {workouts.length === 0 ? (
        <EmptyState
          icon={<History size={36} aria-hidden />}
          title="Pas encore de séance"
          text="Tes séances terminées apparaîtront ici, avec leurs chiffres et leurs records."
        />
      ) : (
        <>
          {groupByMonth(workouts.slice(0, limit)).map((month) => (
            <Section key={month.key} title={month.title}>
              <ListGroup>
                {month.workouts.map((workout) => (
                  <ListRow
                    key={workout.id}
                    title={workout.title}
                    subtitle={`${capitalize(formatDay(workout.date, 'EEEE d'))} · ${workoutSubtitle(workout)}`}
                    to={historyPath(workout.id)}
                  />
                ))}
              </ListGroup>
            </Section>
          ))}
          {workouts.length > limit && (
            <LoadMore
              remaining={workouts.length - limit}
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
