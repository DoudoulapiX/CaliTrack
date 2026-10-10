import { Link } from 'react-router'
import { ChevronRight, Dumbbell, LibraryBig, Mountain, Plus, RefreshCw } from 'lucide-react'
import { useProfile } from '@/app/data-context'
import { isDeloadWeek, programWeek, weekPlan } from '@/content/programs/schedule'
import type { Program, ProgramSession } from '@/db/types'
import { cn } from '@/lib/cn'
import { formatDayShort, today, weekDates, WEEKDAY_LONG, WEEKDAY_SHORT, type Weekday } from '@/lib/dates'
import { ButtonLink } from '@/ui/Button'
import { Badge, EmptyState } from '@/ui/Controls'
import { Card } from '@/ui/Card'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useCatalog } from '@/features/library/catalog-context'
import { locationLabel, programOutdated, sessionSummary } from './program-view'
import { RationaleList } from './RationaleList'
import { useActiveProgram, useInventory, usePrograms } from './useTraining'

function sessionPath(program: Program, session: ProgramSession): string {
  return `/training/programs/${program.id}/sessions/${session.id}`
}

/** Une journée de la semaine type : séances, escalade ou repos. */
function DayRow({
  program,
  weekday,
  date,
  sessions,
  climbing,
  isToday,
  past,
}: {
  program: Program
  weekday: Weekday
  date: string
  sessions: ProgramSession[]
  climbing: boolean
  isToday: boolean
  /** Jour déjà passé : pastille en retrait. */
  past: boolean
}) {
  const catalog = useCatalog()
  const day = (
    <span
      className={cn(
        'flex w-11 shrink-0 flex-col items-center rounded-xl border py-1 text-center',
        isToday
          ? 'border-accent bg-accent text-accent-ink'
          : past
            ? 'border-line text-ink-3'
            : 'border-transparent bg-surface-2 text-ink-2',
      )}
    >
      <span className="text-[12px] font-semibold uppercase">{WEEKDAY_SHORT[weekday]}</span>
      <span className="text-[15px] leading-tight font-bold tabular">{date.slice(8).replace(/^0/, '')}</span>
    </span>
  )
  const label = `${WEEKDAY_LONG[weekday]} ${formatDayShort(date)}${isToday ? ' (aujourd’hui)' : ''}`
  if (sessions.length === 0) {
    return (
      <li className="flex min-h-15 items-center gap-3 px-3 py-2" aria-label={label}>
        {day}
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-ink-3">
          {climbing ? (
            <>
              <Mountain size={18} className="text-accent-text" aria-hidden />
              <span className="text-ink">Escalade</span>
            </>
          ) : (
            'Repos'
          )}
        </span>
      </li>
    )
  }
  return (
    <>
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            to={sessionPath(program, session)}
            aria-label={`${label} : ${session.name}`}
            className="flex min-h-15 items-center gap-3 px-3 py-2 active:bg-surface-2"
          >
            {day}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[16px] font-medium text-ink">{session.name}</span>
                {climbing && (
                  <Badge tone="accent">
                    <Mountain size={12} aria-hidden />
                    Escalade
                  </Badge>
                )}
              </span>
              <span className="mt-0.5 block text-[13px] text-ink-3">
                {sessionSummary(session, catalog.byId)}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
          </Link>
        </li>
      ))}
    </>
  )
}

function ActiveProgram({ program }: { program: Program }) {
  const profile = useProfile()
  const inventory = useInventory()
  const day = today()
  const week = programWeek(program, day)
  const deload = isDeloadWeek(program, day)
  const dates = weekDates(day)

  return (
    <>
      <Card className="mb-6">
        <Link to={`/training/programs/${program.id}`} className="-m-4 flex items-center gap-3 p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
            <Dumbbell size={22} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[17px] font-semibold text-ink">{program.name}</span>
            <span className="mt-0.5 block text-[13px] text-ink-3">
              {week >= 1 ? `Semaine ${week}` : 'Commence bientôt'}
              {inventory ? ` · ${locationLabel(program, inventory.locations)}` : ''}
            </span>
          </span>
          {deload && <Badge tone="success">Semaine allégée</Badge>}
          <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
        </Link>
      </Card>

      {programOutdated(program, profile) && (
        <Card className="mb-6">
          <p className="text-[14px] text-ink-2">
            Tes jours ou tes objectifs ne correspondent plus à ce programme.
          </p>
          <ButtonLink to="/training/new" variant="soft" size="sm" className="mt-3">
            Refaire mon programme
          </ButtonLink>
        </Card>
      )}

      {deload && (
        <p className="mb-6 rounded-2xl bg-success/10 px-4 py-3 text-[14px] text-ink-2">
          Semaine allégée&nbsp;: moitié moins de séries pour récupérer. Les objectifs ne changent pas.
        </p>
      )}

      <Section title="Cette semaine">
        <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
          {weekPlan(program, profile.climbingDays).map(({ weekday, sessions, climbing }, i) => (
            <DayRow
              key={weekday}
              program={program}
              weekday={weekday}
              date={dates[i] ?? day}
              sessions={sessions}
              climbing={climbing}
              isToday={dates[i] === day}
              past={(dates[i] ?? day) < day}
            />
          ))}
        </ul>
      </Section>

      {program.rationale.length > 0 && (
        <Section title="Pourquoi ce programme">
          <RationaleList lines={program.rationale} />
        </Section>
      )}

      <Section>
        <ListGroup>
          <ListRow
            title="Refaire mon programme"
            subtitle="D’après ton profil et ton matériel du moment"
            leading={<RefreshCw size={20} aria-hidden />}
            to="/training/new"
          />
          <ListRow
            title="Mes programmes"
            leading={<LibraryBig size={20} aria-hidden />}
            to="/training/programs"
          />
        </ListGroup>
      </Section>
    </>
  )
}

/** Onglet Entraînement : le programme suivi et sa semaine type. */
export function TrainingPage() {
  const active = useActiveProgram()
  const programs = usePrograms()
  if (active === undefined || programs === undefined) return <PageSpinner />

  return (
    <Page title="Entraînement">
      {active ? (
        <ActiveProgram program={active} />
      ) : (
        <>
          <EmptyState
            icon={<Dumbbell size={36} aria-hidden />}
            title="Pas encore de programme"
            text="CaliTrack le prépare d’après ton profil, ton niveau et ton matériel. Tu pourras tout modifier."
            action={
              <ButtonLink to="/training/new" icon={<Plus size={18} aria-hidden />}>
                Créer mon programme
              </ButtonLink>
            }
          />
          {programs.length > 0 && (
            <Section title="Mes programmes" className="mt-6">
              <ListGroup>
                {programs.map((program) => (
                  <ListRow key={program.id} title={program.name} to={`/training/programs/${program.id}`} />
                ))}
              </ListGroup>
            </Section>
          )}
        </>
      )}
    </Page>
  )
}
