import { useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, Coffee, Play, Sparkles } from 'lucide-react'
import { MATCH_DAYS, nextPlannedSession, type ProgramItem } from '@/content/calendar/agenda'
import { isDeloadWeek } from '@/content/programs/schedule'
import { workoutStats } from '@/content/workouts/stats'
import { setProgramSessionSkipped } from '@/db/calendar'
import { db } from '@/db/db'
import type { Program, Workout } from '@/db/types'
import { addDaysISO, diffDays, formatDay, formatTimeOf, relativeDayLabel, today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button, ButtonLink } from '@/ui/Button'
import { Badge } from '@/ui/Controls'
import { Card } from '@/ui/Card'
import { useToast } from '@/ui/toast-context'
import { useAiKey } from '@/features/ai/useAiKey'
import { useAgenda } from '@/features/calendar/useAgenda'
import {
  COACH_TODAY_PATH,
  headlineBesides,
  TODAY_COACH_TEXT,
  todayCoachState,
  type TodayCoachState,
} from '@/features/coach/coach-today-view'
import { useCoachDay } from '@/features/coach/useCoachDay'
import { useCatalog } from '@/features/library/catalog-context'
import { sessionSummary } from '@/features/training/program-view'
import { coachSessionBuilder, programSessionBuilder } from './build-session'
import { StartWorkoutButton } from './StartWorkoutButton'
import { historyPath, useActiveWorkout, workoutPath } from './useWorkouts'

/** Jours regardés à l'avance pour trouver la prochaine séance. */
const LOOKAHEAD_DAYS = 14

function Eyebrow({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'accent' | 'warning' }) {
  return (
    <p
      className={
        tone === 'accent'
          ? 'text-[13px] font-semibold tracking-wide text-accent-text uppercase'
          : tone === 'warning'
            ? 'text-[13px] font-semibold tracking-wide text-warning uppercase'
            : 'text-[13px] font-semibold tracking-wide text-ink-3 uppercase'
      }
    >
      {children}
    </p>
  )
}

function ResumeCard({ workout, className }: { workout: Workout; className: string }) {
  const { setsDone, setsTotal } = workoutStats(workout)
  return (
    <Card className={className}>
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

/** Une séance manquée ces derniers jours : on la rattrape aujourd'hui, ou on la passe. */
function CatchUpCard({ item, className }: { item: ProgramItem; className: string }) {
  const catalog = useCatalog()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const skip = async () => {
    setBusy(true)
    try {
      await setProgramSessionSkipped(item.program, item.session, item.date, true)
      toast('Séance passée')
    } catch (error) {
      toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card className={className}>
      <Eyebrow tone="warning">À rattraper</Eyebrow>
      <p className="mt-1 text-[18px] font-semibold text-ink">{item.session.name}</p>
      <p className="mt-0.5 text-[14px] text-ink-3">
        Prévue {formatDay(item.date, 'EEEE d')} · {sessionSummary(item.session, catalog.byId)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <StartWorkoutButton
          build={programSessionBuilder(item.program, item.session, item.date)}
          className="grow whitespace-nowrap"
          icon={<Play size={18} aria-hidden />}
        >
          La rattraper
        </StartWorkoutButton>
        <Button
          variant="secondary"
          className="grow whitespace-nowrap"
          disabled={busy}
          onClick={() => void skip()}
        >
          La passer
        </Button>
      </div>
    </Card>
  )
}

/**
 * La séance prévue aujourd'hui, avec le conseil du coach s'il y en a un : un seul bouton pour la
 * commencer (telle quelle ou allégée), ou le repos conseillé avec la séance en second choix.
 */
function PlannedCard({
  program,
  item,
  deload,
  className,
}: {
  program: Program
  item: ProgramItem
  deload: boolean
  className: string
}) {
  // Lus ici seulement : les autres cartes (séance en cours, à rattraper, repos) n'attendent pas le coach.
  const apiKey = useAiKey()
  const coachDay = useCoachDay(item.date)
  // Rien tant que le conseil n'est pas lu : jamais un bouton qui changerait sous le doigt.
  if (apiKey === undefined || coachDay === undefined) return null
  const coach = todayCoachState({
    day: coachDay,
    program,
    session: item.session,
    date: item.date,
    hasKey: apiKey !== null,
  })
  return <PlannedCardBody program={program} item={item} deload={deload} coach={coach} className={className} />
}

function PlannedCardBody({
  program,
  item,
  deload,
  coach,
  className,
}: {
  program: Program
  item: ProgramItem
  deload: boolean
  coach: TodayCoachState
  className: string
}) {
  const catalog = useCatalog()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const plain = programSessionBuilder(program, item.session, item.date)
  const rest = async () => {
    setBusy(true)
    try {
      await setProgramSessionSkipped(program, item.session, item.date, true)
      toast(TODAY_COACH_TEXT.restTaken)
    } catch (error) {
      toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
    } finally {
      setBusy(false)
    }
  }
  const headline =
    coach.kind === 'lighter' || coach.kind === 'rest'
      ? headlineBesides(
          coach.plan.headline,
          coach.kind === 'lighter' ? TODAY_COACH_TEXT.lighterBadge : TODAY_COACH_TEXT.restBadge,
        )
      : null
  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Eyebrow tone="accent">Aujourd’hui</Eyebrow>
        {deload && <Badge tone="success">Semaine allégée</Badge>}
        {coach.kind === 'lighter' && <Badge tone="accent">{TODAY_COACH_TEXT.lighterBadge}</Badge>}
        {coach.kind === 'rest' && <Badge tone="warning">{TODAY_COACH_TEXT.restBadge}</Badge>}
      </div>
      <p className="mt-1 text-[18px] font-semibold text-ink">{item.session.name}</p>
      <p className="mt-0.5 text-[14px] text-ink-3">{sessionSummary(item.session, catalog.byId)}</p>
      {headline && (
        <p className="mt-2 flex items-start gap-2 text-[15px] text-ink-2">
          <Sparkles size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
          {frenchSpacing(headline)}
        </p>
      )}
      {coach.kind === 'asPlanned' && (
        <p className="mt-2 flex items-start gap-2 text-[14px] text-ink-2">
          <CircleCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden />
          {TODAY_COACH_TEXT.asPlanned}
        </p>
      )}
      {coach.kind === 'rest' ? (
        <div className="mt-4 flex flex-col gap-2">
          <Button block disabled={busy} icon={<Coffee size={18} aria-hidden />} onClick={() => void rest()}>
            {TODAY_COACH_TEXT.takeRest}
          </Button>
          <StartWorkoutButton build={plain} block variant="secondary">
            {TODAY_COACH_TEXT.doAnyway}
          </StartWorkoutButton>
        </div>
      ) : (
        <StartWorkoutButton
          build={
            coach.kind === 'lighter'
              ? coachSessionBuilder(program, item.session, item.date, coach.plan)
              : plain
          }
          block
          className="mt-4"
          icon={<Play size={18} aria-hidden />}
        >
          {coach.kind === 'lighter' ? TODAY_COACH_TEXT.startLighter : TODAY_COACH_TEXT.start}
        </StartWorkoutButton>
      )}
      {coach.kind === 'ask' && (
        <ButtonLink
          to={COACH_TODAY_PATH}
          variant="ghost"
          size="sm"
          block
          className="mt-2"
          icon={<Sparkles size={16} aria-hidden />}
        >
          {TODAY_COACH_TEXT.ask}
        </ButtonLink>
      )}
      {(coach.kind === 'lighter' || coach.kind === 'rest') && (
        <ButtonLink to={COACH_TODAY_PATH} variant="ghost" size="sm" block className="mt-2">
          {TODAY_COACH_TEXT.details}
        </ButtonLink>
      )}
    </Card>
  )
}

export interface TodayWorkoutCardProps {
  program: Program | null
  /** Classes de la carte (marge basse par défaut). */
  className?: string
  /** Affiché quand il n'y a rien à montrer : ni séance en cours, ni programme, ni séance prochaine. */
  fallback?: ReactNode
}

/**
 * La séance du jour : celle en cours à reprendre, sinon celle prévue par le programme à commencer,
 * sinon une séance manquée ces derniers jours à rattraper, sinon la prochaine (jour de repos, ou
 * séance déjà faite).
 */
export function TodayWorkoutCard({ program, className = 'mb-6', fallback = null }: TodayWorkoutCardProps) {
  const day = today()
  const active = useActiveWorkout()
  const agenda = useAgenda(program, addDaysISO(day, -MATCH_DAYS), addDaysISO(day, LOOKAHEAD_DAYS))
  const todays = useLiveQuery(() => db.workouts.where('date').equals(day).toArray(), [day])
  if (active === undefined || todays === undefined || agenda === undefined) return null
  if (active) return <ResumeCard workout={active} className={className} />
  if (!program) return fallback

  const sessions = (agenda.get(day) ?? []).filter((item): item is ProgramItem => item.type === 'program')
  const toDo = sessions.find((item) => item.status === 'planned')
  const deload = isDeloadWeek(program, day)

  if (toDo) return <PlannedCard program={program} item={toDo} deload={deload} className={className} />

  // Faite aujourd'hui, ou celle d'aujourd'hui faite en avance.
  const done =
    todays.filter((w) => w.status === 'done').at(-1) ??
    sessions.find((item) => item.status === 'done')?.workout ??
    null
  if (!done) {
    const missed = [...agenda.entries()]
      .filter(([date]) => date < day)
      .flatMap(([, items]) => items)
      .filter((item): item is ProgramItem => item.type === 'program' && item.status === 'missed')
      .at(-1)
    if (missed) return <CatchUpCard item={missed} className={className} />
  }

  const next = nextPlannedSession(agenda, day)
  if (!next && !done) return fallback
  const skippedToday = sessions.some((item) => item.status === 'skipped')
  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          {done ? (
            <CircleCheck size={22} className="text-success" aria-hidden />
          ) : (
            <Coffee size={22} aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold text-ink">
            {done ? 'Séance du jour faite' : skippedToday ? 'Séance passée aujourd’hui' : 'Repos aujourd’hui'}
          </p>
          {done && done.date !== day && (
            <p className="mt-0.5 text-[14px] text-ink-3">Faite en avance, {formatDay(done.date, 'EEEE d')}</p>
          )}
          {next && (
            <p className="mt-0.5 text-[14px] text-ink-3">
              Prochaine séance {relativeDayLabel(next.date, day)}&nbsp;: {next.session.name}
            </p>
          )}
        </div>
      </div>
      {/* Côte à côte s'ils tiennent sur une ligne, sinon l'un sous l'autre. */}
      <div className="mt-4 flex flex-wrap gap-2 empty:hidden">
        {done && (
          <ButtonLink to={historyPath(done.id)} variant="secondary" className="grow whitespace-nowrap">
            Voir le bilan
          </ButtonLink>
        )}
        {/* Faite aujourd'hui, elle compte pour ce jour-là s'il n'est pas trop loin. */}
        {next && diffDays(next.date, day) <= MATCH_DAYS && (
          <StartWorkoutButton
            build={programSessionBuilder(program, next.session, next.date)}
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
