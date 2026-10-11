import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { exerciseRecords } from '@/content/workouts/records'
import { frenchSpacing } from '@/lib/typography'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ExerciseThumb } from '@/features/library/ExerciseThumb'
import { useCatalog } from '@/features/library/catalog-context'
import { useDoneWorkouts } from './useWorkouts'
import { recordsLine } from './workout-view'

/** Records de chaque exercice fait, le plus récemment travaillé d'abord. */
export function RecordsPage() {
  const settings = useSettings()
  const catalog = useCatalog()
  const workouts = useDoneWorkouts()
  const goBack = useGoBack('/training')
  const records = useMemo(
    () =>
      workouts
        ? [...exerciseRecords(workouts).values()]
            .filter((entry) => entry.reps ?? entry.hold ?? entry.load)
            .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
        : undefined,
    [workouts],
  )
  if (records === undefined) return <PageSpinner />

  return (
    <Page title="Records" back onBack={goBack} backLabel="Entraînement" large>
      {records.length === 0 ? (
        <EmptyState
          icon={<Trophy size={36} aria-hidden />}
          title="Pas encore de record"
          text={frenchSpacing(
            'Termine une séance : tes meilleures séries de chaque exercice s’afficheront ici.',
          )}
        />
      ) : (
        <ListGroup>
          {records.map((entry) => {
            const exercise = catalog.byId.get(entry.exerciseId)
            return (
              <ListRow
                key={entry.exerciseId}
                leading={exercise ? <ExerciseThumb exercise={exercise} className="size-11" /> : undefined}
                title={exercise?.name ?? 'Exercice supprimé'}
                subtitle={`${recordsLine(entry, settings.weightUnit)} · ${String(entry.sessions)} séance${entry.sessions > 1 ? 's' : ''}`}
                to={exercise ? `/library/${exercise.id}` : undefined}
              />
            )
          })}
        </ListGroup>
      )}
    </Page>
  )
}
