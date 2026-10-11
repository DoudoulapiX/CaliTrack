import { Coffee, Dumbbell } from 'lucide-react'
import type { AgendaItem } from '@/content/calendar/agenda'
import type { Program, ProgramSession } from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { ButtonLink } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { ListGroup } from '@/ui/List'
import { Section } from '@/ui/Page'
import { AgendaRow } from '@/features/calendar/AgendaRow'
import { itemSubtitle } from '@/features/calendar/calendar-view'
import { useCatalog } from '@/features/library/catalog-context'
import { sessionSummary } from '@/features/training/program-view'
import { TodayWorkoutCard } from '@/features/workout/TodayWorkoutCard'
import { useActiveWorkout } from '@/features/workout/useWorkouts'
import { SectionLink } from './SectionLink'
import { calendarDayPath, rowPath, todayRows } from './today-view'

function NoProgram() {
  return (
    <Card className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
        <Dumbbell size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold text-ink">Pas encore de programme</p>
        <p className="mt-0.5 text-[14px] text-ink-3">
          Des séances adaptées à ton niveau, à ton matériel et à tes jours.
        </p>
        <ButtonLink to="/training/new" size="sm" className="mt-3">
          Créer mon programme
        </ButtonLink>
      </div>
    </Card>
  )
}

function NothingPlanned() {
  return (
    <Card className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
        <Coffee size={20} aria-hidden />
      </span>
      <p className="text-[16px] text-ink-2">Rien de prévu aujourd’hui.</p>
    </Card>
  )
}

/**
 * Au programme aujourd'hui : la séance du jour (à commencer, reprendre, rattraper ou déjà faite), puis
 * le reste de la journée (escalade, cardio, séances perso, séances faites).
 */
export function TodaySessionCard({
  program,
  items,
  day,
}: {
  program: Program | null
  items: readonly AgendaItem[]
  day: ISODate
}) {
  const catalog = useCatalog()
  const active = useActiveWorkout()
  if (active === undefined) return null
  const rows = todayRows(items, { hasProgram: program !== null, workoutActive: active !== null })
  const summary = (session: ProgramSession) => sessionSummary(session, catalog.byId)
  const fallback = program === null ? <NoProgram /> : rows.length === 0 ? <NothingPlanned /> : null

  return (
    <Section title="Au programme" action={<SectionLink to={calendarDayPath(day)}>Calendrier</SectionLink>}>
      <div className="flex flex-col gap-3">
        <TodayWorkoutCard program={program} className="" fallback={fallback} />
        {rows.length > 0 && (
          <ListGroup>
            {rows.map((item) => (
              <AgendaRow
                key={item.key}
                item={item}
                subtitle={itemSubtitle(item, summary)}
                to={rowPath(item)}
              />
            ))}
          </ListGroup>
        )}
      </div>
    </Section>
  )
}
