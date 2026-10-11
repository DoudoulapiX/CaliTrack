import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, Coffee, Play } from 'lucide-react'
import { isDeloadWeek, nextSession, sessionsForDate } from '@/content/programs/schedule'
import { workoutStats } from '@/content/workouts/stats'
import { workoutFromSession } from '@/content/workouts/workout'
import { db } from '@/db/db'
import type { Program, ProgramSession, Workout } from '@/db/types'
import { addDaysISO, formatTimeOf, nowISO, relativeDayLabel, today } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { ButtonLink } from '@/ui/Button'
import { Badge } from '@/ui/Controls'
import { Card } from '@/ui/Card'
import { useCatalog } from '@/features/library/catalog-context'
import { sessionSummary } from '@/features/training/program-view'
import { StartWorkoutButton } from './StartWorkoutButton'
import { historyPath, useActiveWorkout, workoutPath } from './useWorkouts'

function Eyebrow({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'accent' }) {
  return (
    <p
      className={
        tone === 'accent'
          ? 'text-[13px] font-semibold tracking-wide text-accent-text uppercase'
          : 'text-[13px] font-semibold tracking-wide text-ink-3 uppercase'
      }
    >
      {children}
    </p>
  )
}

/** Prépare la séance du programme au moment où on la commence. */
function buildSession(program: Program, session: ProgramSession): () => Workout {
  return () => {
    const date = today()
    return workoutFromSession({
      programId: program.id,
      session,
      date,
      now: nowISO(),
      deload: isDeloadWeek(program, date),
      newId,
    })
  }
}

function ResumeCard({ workout }: { workout: Workout }) {
  const { setsDone, setsTotal } = workoutStats(workout)
  return (
    <Card className="mb-6">
      <Eyebrow tone="accent">Séance en cours</Eyebrow>
      <p className="mt-1 text-[18px] font-semibold text-ink">{workout.title}</p>
      <p className="mt-0.5 text-[14px] text-ink-3">
        Commencée à {formatTimeOf(workout.startedAt)} · {setsDone} série{setsDone > 1 ? 's' : ''} cochée
        {setsDone > 1 ? 's' : ''} sur {setsTotal}
      </p>
      <ButtonLink to={workoutPath(workout.id)} block className="mt-4" icon={<Play size={18} aria-hidden />}>
        Reprendre la séance
      </ButtonLink>
    </Card>
  )
}

/**
 * La séance du jour : celle en cours à reprendre, sinon celle prévue par le programme à commencer,
 * sinon la prochaine (jour de repos, ou séance déjà faite).
 */
export function TodayWorkoutCard({ program }: { program: Program | null }) {
  const catalog = useCatalog()
  const day = today()
  const active = useActiveWorkout()
  const todays = useLiveQuery(() => db.workouts.where('date').equals(day).toArray(), [day])
  if (active === undefined || todays === undefined) return null
  if (active) return <ResumeCard workout={active} />
  if (!program) return null

  const doneToday = todays.filter((w) => w.status === 'done')
  const planned = sessionsForDate(program, day)
  const toDo = planned.find((session) => !doneToday.some((w) => w.programSessionId === session.id))
  const deload = isDeloadWeek(program, day)

  if (toDo) {
    return (
      <Card className="mb-6">
        <div className="flex items-center gap-2">
          <Eyebrow tone="accent">Aujourd’hui</Eyebrow>
          {deload && <Badge tone="success">Semaine allégée</Badge>}
        </div>
        <p className="mt-1 text-[18px] font-semibold text-ink">{toDo.name}</p>
        <p className="mt-0.5 text-[14px] text-ink-3">{sessionSummary(toDo, catalog.byId)}</p>
        <StartWorkoutButton
          build={buildSession(program, toDo)}
          block
          className="mt-4"
          icon={<Play size={18} aria-hidden />}
        >
          Commencer la séance
        </StartWorkoutButton>
      </Card>
    )
  }

  const next = nextSession(program, addDaysISO(day, 1))
  const lastDone = doneToday.at(-1)
  if (!next && !lastDone) return null
  return (
    <Card className="mb-6">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          {lastDone ? (
            <CircleCheck size={22} className="text-success" aria-hidden />
          ) : (
            <Coffee size={22} aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-ink">
            {lastDone ? 'Séance du jour faite' : 'Repos aujourd’hui'}
          </p>
          {next && (
            <p className="mt-0.5 text-[14px] text-ink-3">
              Prochaine séance {relativeDayLabel(next.date, day)}&nbsp;: {next.session.name}
            </p>
          )}
        </div>
      </div>
      {/* Côte à côte s'ils tiennent sur une ligne, sinon l'un sous l'autre. */}
      <div className="mt-4 flex flex-wrap gap-2">
        {lastDone && (
          <ButtonLink to={historyPath(lastDone.id)} variant="secondary" className="grow whitespace-nowrap">
            Voir le bilan
          </ButtonLink>
        )}
        {next && (
          <StartWorkoutButton
            build={buildSession(program, next.session)}
            variant="soft"
            className="grow whitespace-nowrap"
          >
            La faire maintenant
          </StartWorkoutButton>
        )}
      </div>
    </Card>
  )
}
