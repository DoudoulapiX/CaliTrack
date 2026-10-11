import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { itemKind, itemTitle, type AgendaItem, type ProgramItem } from '@/content/calendar/agenda'
import type { Program } from '@/db/types'
import { cn } from '@/lib/cn'
import {
  addDaysISO,
  formatDayShort,
  today as todayISO,
  weekDates,
  weekdayOf,
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  type ISODate,
} from '@/lib/dates'
import { Badge } from '@/ui/Controls'
import { Section } from '@/ui/Page'
import { KindGlyph } from '@/features/calendar/AgendaRow'
import { itemSubtitle, statusBadge } from '@/features/calendar/calendar-view'
import { useAgenda } from '@/features/calendar/useAgenda'
import { useCatalog } from '@/features/library/catalog-context'
import { sessionPath, sessionSummary } from './program-view'

function DayPill({ date, isToday, past }: { date: ISODate; isToday: boolean; past: boolean }) {
  return (
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
      <span className="text-[12px] font-semibold uppercase">{WEEKDAY_SHORT[weekdayOf(date)]}</span>
      <span className="text-[15px] leading-tight font-bold tabular">{Number(date.slice(8))}</span>
    </span>
  )
}

/** Une journée : les séances du programme (avec leur statut), sinon les autres séances, ou repos. */
function DayRow({
  program,
  date,
  items,
  today,
}: {
  program: Program
  date: ISODate
  items: readonly AgendaItem[]
  today: ISODate
}) {
  const catalog = useCatalog()
  const isToday = date === today
  const pill = <DayPill date={date} isToday={isToday} past={date < today} />
  const label = `${WEEKDAY_LONG[weekdayOf(date)]} ${formatDayShort(date)}${isToday ? ' (aujourd’hui)' : ''}`
  const sessions = items.filter((item): item is ProgramItem => item.type === 'program')
  // Escalade, cardio, séances libres… (sans ce qui a été annulé).
  const others = items.filter((item) => item.type !== 'program' && item.status !== 'skipped')
  const othersLine = others.map(itemTitle).join(' · ')

  if (sessions.length === 0) {
    const first = others[0]
    return (
      <li
        className="flex min-h-15 items-center gap-3 px-3 py-2"
        aria-label={`${label} : ${othersLine || 'repos'}`}
      >
        {pill}
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-ink-3">
          {first ? (
            <>
              <KindGlyph kind={itemKind(first)} title={itemTitle(first)} size={18} />
              <span className="truncate text-ink">{othersLine}</span>
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
      {sessions.map((item) => {
        const badge = statusBadge(item)
        const subtitle = itemSubtitle(item, (session) => sessionSummary(session, catalog.byId))
        return (
          <li key={item.key}>
            <Link
              to={sessionPath(program, item.session)}
              aria-label={`${label} : ${item.session.name}${badge ? ` (${badge.label.toLowerCase()})` : ''}`}
              className="flex min-h-15 items-center gap-3 px-3 py-2 active:bg-surface-2"
            >
              {pill}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'truncate text-[16px] font-medium',
                      item.status === 'skipped' ? 'text-ink-3 line-through' : 'text-ink',
                    )}
                  >
                    {item.session.name}
                  </span>
                  {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
                </span>
                <span className="mt-0.5 block text-[13px] text-ink-3">
                  {othersLine ? `${subtitle} · ${othersLine}` : subtitle}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
            </Link>
          </li>
        )
      })}
    </>
  )
}

/**
 * La semaine en cours, jour par jour, avec ce qui est fait, manqué ou passé ; la semaine suivante
 * quand il ne reste plus de séance du programme à faire dans celle-ci.
 */
export function WeekSection({ program }: { program: Program }) {
  const today = todayISO()
  const thisWeek = weekDates(today)
  const nextWeek = weekDates(addDaysISO(today, 7))
  const agenda = useAgenda(program, thisWeek[0] ?? today, nextWeek[6] ?? today)
  if (!agenda) return null
  const pending = thisWeek.some(
    (date) =>
      date >= today &&
      (agenda.get(date) ?? []).some(
        (item) => item.type === 'program' && (item.status === 'planned' || item.status === 'active'),
      ),
  )
  const dates = pending ? thisWeek : nextWeek
  return (
    <Section
      title={pending ? 'Cette semaine' : 'La semaine prochaine'}
      action={
        <Link to={`/calendar?jour=${today}`} className="text-[15px] font-medium text-accent-text">
          Voir le calendrier
        </Link>
      }
    >
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {dates.map((date) => (
          <DayRow key={date} program={program} date={date} items={agenda.get(date) ?? []} today={today} />
        ))}
      </ul>
    </Section>
  )
}
