import { Link } from 'react-router'
import { itemKind, type Agenda } from '@/content/calendar/agenda'
import { cn } from '@/lib/cn'
import type { ISODate } from '@/lib/dates'
import { ProgressBar } from '@/ui/Controls'
import { Section } from '@/ui/Page'
import { dayLabel, dotItems, KIND_STYLE, WEEKDAY_INITIALS } from '@/features/calendar/calendar-view'
import { SectionLink } from './SectionLink'
import { calendarDayPath, extrasLines, programLine, weekCounts } from './today-view'

const MAX_DOTS = 3

/**
 * La semaine en cours : une pastille par séance chaque jour (pleine quand elle est faite), puis les
 * séances du programme faites et le reste de ce qui a été fait.
 */
export function WeekCard({
  agenda,
  dates,
  day,
}: {
  agenda: Agenda
  dates: readonly ISODate[]
  day: ISODate
}) {
  const counts = weekCounts(agenda, dates)
  const program = programLine(counts)
  const extras = extrasLines(counts)

  return (
    <Section title="Ma semaine" action={<SectionLink to={calendarDayPath(day)}>Calendrier</SectionLink>}>
      <div className="rounded-2xl bg-surface p-2">
        <ul className="grid grid-cols-7">
          {dates.map((date, i) => {
            const items = agenda.get(date) ?? []
            const isToday = date === day
            return (
              <li key={date}>
                <Link
                  to={calendarDayPath(date)}
                  aria-label={dayLabel(date, items, day)}
                  aria-current={isToday ? 'date' : undefined}
                  className="flex flex-col items-center gap-1 rounded-xl py-1.5 active:bg-surface-2"
                >
                  <span className="text-[12px] font-semibold text-ink-3">{WEEKDAY_INITIALS[i]}</span>
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-full text-[15px] tabular',
                      isToday
                        ? 'bg-accent font-semibold text-accent-ink'
                        : date < day
                          ? 'text-ink-3'
                          : 'text-ink',
                    )}
                  >
                    {Number(date.slice(8))}
                  </span>
                  <span className="flex h-1.5 items-center gap-0.5">
                    {dotItems(items)
                      .slice(0, MAX_DOTS)
                      .map((item) => {
                        const style = KIND_STYLE[itemKind(item)]
                        const filled = item.status === 'done' || item.status === 'active'
                        return (
                          <span
                            key={item.key}
                            className={cn(
                              'size-1.5 rounded-full',
                              filled ? style.dot : cn('ring-1 ring-inset', style.ring),
                            )}
                          />
                        )
                      })}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="mx-2 mt-2 border-t border-line pt-3 pb-1">
          {program === null && extras.length === 0 && (
            <p className="text-[14px] text-ink-3">Rien de prévu ni de fait cette semaine.</p>
          )}
          {program !== null && (
            <>
              <p className="flex items-baseline justify-between gap-2 text-[14px]">
                <span className="text-ink-2">Programme</span>
                <span className="font-semibold text-ink">{program}</span>
              </p>
              <ProgressBar
                value={(counts.done / counts.planned) * 100}
                label="Séances du programme faites cette semaine"
                size="sm"
                className="mt-2"
              />
            </>
          )}
          {extras.length > 0 && (
            <p className={cn('text-[14px] text-ink-3', program !== null && 'mt-2')}>{extras.join(' · ')}</p>
          )}
        </div>
      </div>
    </Section>
  )
}
