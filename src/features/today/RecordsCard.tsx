import { useMemo } from 'react'
import { Trophy } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { formatRecordHit } from '@/content/workouts/format'
import { addDaysISO, formatDayShort, type ISODate } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { Card } from '@/ui/Card'
import { ListGroup, ListRow } from '@/ui/List'
import { Section } from '@/ui/Page'
import { climbHistoryPath, climbRecordLine, climbRecordTitle } from '@/features/climbing/climb-view'
import { useClimbs, useGradeScales } from '@/features/climbing/useClimbing'
import { useCatalog } from '@/features/library/catalog-context'
import { historyPath, useDoneWorkouts } from '@/features/workout/useWorkouts'
import { SectionLink } from './SectionLink'
import { recentRecords } from './today-view'

/** Jours regardés en arrière, et records montrés au plus. */
const RECENT_DAYS = 30
const MAX_RECORDS = 5

/** Les derniers records battus, en séance et en escalade. */
export function RecordsCard({ day }: { day: ISODate }) {
  const settings = useSettings()
  const catalog = useCatalog()
  const workouts = useDoneWorkouts()
  const climbs = useClimbs()
  const scales = useGradeScales()
  const climbing = !settings.hiddenModules.includes('climbing')
  const records = useMemo(
    () =>
      workouts && climbs && scales
        ? recentRecords(workouts, climbing ? climbs : [], scales, addDaysISO(day, 1 - RECENT_DAYS)).slice(
            0,
            MAX_RECORDS,
          )
        : undefined,
    [workouts, climbs, scales, climbing, day],
  )
  if (!records) return null
  const unit = settings.weightUnit
  const trophy = <Trophy size={20} className="text-warning" aria-hidden />

  return (
    <Section
      title="Records récents"
      action={
        <SectionLink to="/training/records" label="Tous les records">
          Tous
        </SectionLink>
      }
    >
      {records.length === 0 ? (
        <Card>
          <p className="text-[15px] text-ink-3">Aucun record battu ces {RECENT_DAYS} derniers jours.</p>
        </Card>
      ) : (
        <ListGroup>
          {records.map((record) =>
            record.type === 'workout' ? (
              <ListRow
                key={record.key}
                leading={trophy}
                title={catalog.byId.get(record.hit.exerciseId)?.name ?? 'Exercice supprimé'}
                subtitle={formatRecordHit(record.hit, unit)}
                trailing={formatDayShort(record.date)}
                to={historyPath(record.hit.entry.workoutId)}
              />
            ) : (
              <ListRow
                key={record.key}
                leading={trophy}
                title="Escalade"
                subtitle={frenchSpacing(
                  `${climbRecordTitle(record.record)} : ${climbRecordLine(record.record)}`,
                )}
                trailing={formatDayShort(record.date)}
                to={climbHistoryPath(record.session.id)}
              />
            ),
          )}
        </ListGroup>
      )}
    </Section>
  )
}
