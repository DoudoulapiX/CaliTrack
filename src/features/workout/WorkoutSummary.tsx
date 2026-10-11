import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Check, Trash2, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { describeChange } from '@/content/programs/format'
import { formatDoneSets, formatRecord, RECORD_LABEL } from '@/content/workouts/format'
import { recordsBeaten } from '@/content/workouts/records'
import { workoutDurationSec } from '@/content/workouts/stats'
import { measureOf } from '@/content/workouts/workout'
import type { ProgressionKind, Workout } from '@/db/types'
import { deleteWorkout } from '@/db/workouts'
import { capitalize, formatDay, formatTimeOf } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { GoalAdvances } from '@/features/goals/GoalAdvances'
import { useCatalog } from '@/features/library/catalog-context'
import { StatTiles } from './StatTiles'
import { useDoneWorkouts } from './useWorkouts'
import { rpeLabel, statItems } from './workout-view'

const EASIER: readonly ProgressionKind[] = ['levelDown', 'lessLoad', 'lessReps']

/** « Samedi 10 octobre · 18:05 – 19:02 ». */
function dateLine(workout: Workout): string {
  const day = capitalize(formatDay(workout.date))
  const end = workout.endedAt ? ` – ${formatTimeOf(workout.endedAt)}` : ''
  return `${day} · ${formatTimeOf(workout.startedAt)}${end}`
}

function SummaryContent({ workout }: { workout: Workout }) {
  const settings = useSettings()
  const catalog = useCatalog()
  const all = useDoneWorkouts()
  const unit = settings.weightUnit
  const nameOf = (exerciseId: string) => catalog.byId.get(exerciseId)?.name ?? 'Exercice supprimé'
  const end = Date.parse(workout.endedAt ?? workout.startedAt)
  const hits = all ? recordsBeaten(workout, all) : []
  const feeling = rpeLabel(workout.rpe)
  const done = workout.exercises.filter((exercise) => exercise.sets.some((set) => set.done))

  return (
    <>
      <StatTiles items={statItems(workout, workoutDurationSec(workout, end), unit)} className="mb-6" />

      {hits.length > 0 && (
        <Section title="Records battus">
          <ListGroup>
            {hits.map((hit) => (
              <ListRow
                key={`${hit.exerciseId}-${hit.kind}`}
                leading={<Trophy size={20} className="text-warning" aria-hidden />}
                title={nameOf(hit.exerciseId)}
                subtitle={frenchSpacing(
                  `${RECORD_LABEL[hit.kind]} : ${formatRecord(hit.kind, hit.entry, unit)} ` +
                    `(avant : ${formatRecord(hit.kind, hit.previous, unit)})`,
                )}
              />
            ))}
          </ListGroup>
        </Section>
      )}

      {all && <GoalAdvances workout={workout} workouts={all} />}

      {workout.progression.length > 0 && (
        <Section title="La prochaine fois">
          <ul className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            {workout.progression.map((change) => {
              const easier = EASIER.includes(change.kind)
              const Icon = easier ? TrendingDown : TrendingUp
              return (
                <li key={change.slotId} className="flex gap-3">
                  <Icon
                    size={18}
                    className={easier ? 'mt-0.5 shrink-0 text-warning' : 'mt-0.5 shrink-0 text-success'}
                    aria-hidden
                  />
                  <span className="text-[15px] leading-snug">
                    <span className="block font-semibold text-ink">{nameOf(change.fromExerciseId)}</span>
                    <span className="block text-ink-2">{describeChange(change, nameOf, unit)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}
      {workout.deload && (
        <p className="mb-6 rounded-2xl bg-success/10 px-4 py-3 text-[14px] text-ink-2">
          Semaine allégée&nbsp;: le programme ne change pas cette fois.
        </p>
      )}

      <Section title="Exercices">
        {done.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-3 text-[15px] text-ink-3">Aucune série cochée.</p>
        ) : (
          <ListGroup>
            {done.map((exercise) => {
              const definition = catalog.byId.get(exercise.exerciseId)
              const sets = formatDoneSets(exercise, measureOf(exercise, definition?.measure), unit)
              return (
                <ListRow
                  key={exercise.id}
                  title={nameOf(exercise.exerciseId)}
                  subtitle={exercise.note ? `${sets} · ${exercise.note}` : sets}
                  to={definition ? `/library/${definition.id}` : undefined}
                />
              )
            })}
          </ListGroup>
        )}
      </Section>

      {(feeling !== null || workout.notes !== '') && (
        <Section title="Ressenti">
          <div className="rounded-2xl bg-surface p-4">
            {feeling && <p className="text-[16px] font-semibold text-ink">{feeling}</p>}
            {workout.notes && (
              <p className="mt-1 text-[15px] whitespace-pre-line text-ink-2 first:mt-0">{workout.notes}</p>
            )}
          </div>
        </Section>
      )}
    </>
  )
}

/** Bilan juste après la séance : chiffres, records, et ce qui change la prochaine fois. */
function FinishedSummary({ workout }: { workout: Workout }) {
  const navigate = useNavigate()
  // Le bilan s'affiche à la place de la séance : on le montre depuis le haut.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <Page
      title="Bilan"
      large={false}
      noTabBar
      footer={
        <Button block size="lg" onClick={() => void navigate('/training', { replace: true })}>
          Terminé
        </Button>
      }
    >
      <div className="mb-6 flex flex-col items-center gap-1 pt-2 text-center">
        <span className="mb-2 flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
          <Check size={34} strokeWidth={2.6} aria-hidden />
        </span>
        <p className="text-[24px] font-bold text-ink">Séance terminée</p>
        <p className="text-[15px] text-ink-3">{workout.title}</p>
        <p className="text-[14px] text-ink-3">{dateLine(workout)}</p>
      </div>
      <SummaryContent workout={workout} />
    </Page>
  )
}

/** Une séance de l'historique, que l'on peut supprimer. */
function HistorySummary({ workout }: { workout: Workout }) {
  const navigate = useNavigate()
  const toast = useToast()
  const goBack = useGoBack('/training/history')
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    // On quitte l'écran avant : la séance va disparaître.
    await navigate('/training/history', { replace: true })
    try {
      await deleteWorkout(workout.id)
      toast('Séance supprimée')
    } catch (error) {
      toast(userMessage(error, 'Suppression impossible.'), 'error')
    }
  }

  return (
    <Page title={workout.title} large={false} onBack={goBack}>
      <p className="mb-4 px-1 pt-1 text-[14px] text-ink-3">{dateLine(workout)}</p>
      <SummaryContent workout={workout} />
      <Button
        variant="ghost"
        block
        className="text-danger"
        icon={<Trash2 size={18} aria-hidden />}
        onClick={() => {
          setDeleting(true)
        }}
      >
        Supprimer la séance
      </Button>
      <ConfirmSheet
        open={deleting}
        onClose={() => {
          setDeleting(false)
        }}
        title={frenchSpacing('Supprimer la séance ?')}
        message="Elle disparaît de l’historique et les records sont recalculés. Le programme garde sa progression."
        confirmLabel="Supprimer"
        onConfirm={() => void remove()}
      />
    </Page>
  )
}

/** Bilan d'une séance terminée : juste après la séance, ou depuis l'historique. */
export function WorkoutSummary({ workout, mode }: { workout: Workout; mode: 'finished' | 'history' }) {
  return mode === 'finished' ? <FinishedSummary workout={workout} /> : <HistorySummary workout={workout} />
}
