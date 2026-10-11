import { useMemo } from 'react'
import { useSettings } from '@/app/data-context'
import { formatDoneSets, formatRecord, RECORD_LABEL } from '@/content/workouts/format'
import { exerciseRecords } from '@/content/workouts/records'
import { measureOf } from '@/content/workouts/workout'
import type { Exercise } from '@/db/types'
import { capitalize, formatDay } from '@/lib/dates'
import { ListGroup, ListRow } from '@/ui/List'
import { Section } from '@/ui/Page'
import { historyPath, useDoneWorkouts } from './useWorkouts'
import { RECORD_ORDER } from './workout-view'

/** Séances montrées sur la fiche d'un exercice. */
const RECENT = 5

/** Sur la fiche d'un exercice : ses records et ses dernières séances (rien s'il n'a jamais été fait). */
export function ExerciseHistory({ exercise }: { exercise: Exercise }) {
  const settings = useSettings()
  const workouts = useDoneWorkouts()
  const unit = settings.weightUnit

  const history = useMemo(() => {
    if (!workouts) return null
    const records = exerciseRecords(workouts).get(exercise.id)
    const recent = workouts
      .flatMap((workout) => {
        const entry = workout.exercises.find(
          (e) => e.exerciseId === exercise.id && e.sets.some((set) => set.done),
        )
        return entry ? [{ workout, entry }] : []
      })
      .slice(0, RECENT)
    return { records, recent }
  }, [workouts, exercise.id])

  if (!history || history.recent.length === 0) return null
  const { records, recent } = history

  return (
    <>
      {records && (
        <Section title="Mes records">
          <ListGroup>
            {RECORD_ORDER.flatMap((kind) => {
              const entry = records[kind]
              return entry
                ? [
                    <ListRow
                      key={kind}
                      title={formatRecord(kind, entry, unit)}
                      subtitle={`${RECORD_LABEL[kind]} · ${formatDay(entry.date, 'd MMMM yyyy')}`}
                      to={historyPath(entry.workoutId)}
                    />,
                  ]
                : []
            })}
          </ListGroup>
        </Section>
      )}
      <Section title="Dernières séances">
        <ListGroup>
          {recent.map(({ workout, entry }) => (
            <ListRow
              key={workout.id}
              title={formatDoneSets(entry, measureOf(entry, exercise.measure), unit)}
              subtitle={`${capitalize(formatDay(workout.date))} · ${workout.title}`}
              to={historyPath(workout.id)}
            />
          ))}
        </ListGroup>
      </Section>
    </>
  )
}
