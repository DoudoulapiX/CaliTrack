import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { AgendaItem, OccurrenceItem, ProgramItem } from '@/content/calendar/agenda'
import { occurrenceEvent } from '@/content/calendar/event-form'
import type { ProgramSession } from '@/db/types'
import {
  capitalize,
  formatDay,
  formatMonth,
  fromISODate,
  isISODate,
  monthGrid,
  nowISO,
  toISODate,
  today as todayISO,
  type ISODate,
} from '@/lib/dates'
import { newId } from '@/lib/ids'
import { Button, IconButton } from '@/ui/Button'
import { ListGroup } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { useCatalog } from '@/features/library/catalog-context'
import { sessionSummary } from '@/features/training/program-view'
import { useActiveProgram } from '@/features/training/useTraining'
import { historyPath, workoutPath } from '@/features/workout/useWorkouts'
import { AgendaRow } from './AgendaRow'
import { itemSubtitle } from './calendar-view'
import { EventSheet, type EventEditTarget } from './EventSheet'
import { MonthGrid } from './MonthGrid'
import { OccurrenceSheet } from './OccurrenceSheet'
import { ProgramItemSheet } from './ProgramItemSheet'
import { useAgenda } from './useAgenda'

/** Le jour choisi est dans l'adresse : on le retrouve en revenant d'une séance. */
const DAY_PARAM = 'jour'

type OpenSheet =
  | { type: 'program'; item: ProgramItem }
  | { type: 'occurrence'; item: OccurrenceItem }
  | { type: 'edit'; target: EventEditTarget }

/** Onglet Calendrier : le mois, et le détail du jour choisi (programme, séances perso, séances faites). */
export function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const day = todayISO()
  const param = params.get(DAY_PARAM)
  const selected = param !== null && isISODate(param) ? param : day
  const shown = fromISODate(selected)
  const year = shown.getFullYear()
  const monthIndex = shown.getMonth()
  const days = useMemo(() => monthGrid(year, monthIndex), [year, monthIndex])
  const program = useActiveProgram()
  const agenda = useAgenda(program, days[0] ?? selected, days.at(-1) ?? selected)
  const catalog = useCatalog()
  const [sheet, setSheet] = useState<OpenSheet | null>(null)

  const select = (date: ISODate) => {
    setParams({ [DAY_PARAM]: date }, { replace: true })
  }
  // Un autre mois s'ouvre sur son premier jour (sur aujourd'hui pour le mois en cours).
  const changeMonth = (delta: 1 | -1) => {
    const first = toISODate(new Date(year, monthIndex + delta, 1))
    select(first.slice(0, 7) === day.slice(0, 7) ? day : first)
  }
  const close = () => {
    setSheet(null)
  }

  const summary = (session: ProgramSession) => sessionSummary(session, catalog.byId)
  const rowAction = (item: AgendaItem): { to?: string; onSelect?: () => void } => {
    switch (item.type) {
      case 'workout':
        return {
          to: item.workout.status === 'active' ? workoutPath(item.workout.id) : historyPath(item.workout.id),
        }
      case 'program':
        return {
          onSelect: () => {
            setSheet({ type: 'program', item })
          },
        }
      case 'occurrence':
        return {
          onSelect: () => {
            setSheet({ type: 'occurrence', item })
          },
        }
      case 'event':
        return {
          onSelect: () => {
            setSheet({
              type: 'edit',
              target: { mode: 'event', event: item.event, series: item.series, saved: true },
            })
          },
        }
    }
  }

  const items = agenda?.get(selected) ?? []
  return (
    <Page
      title="Calendrier"
      actions={
        <>
          {selected !== day && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                select(day)
              }}
            >
              Aujourd’hui
            </Button>
          )}
          <IconButton
            label="Ajouter une séance"
            onClick={() => {
              setSheet({ type: 'edit', target: { mode: 'new', date: selected } })
            }}
          >
            <Plus size={24} aria-hidden />
          </IconButton>
        </>
      }
    >
      <div className="mb-2 flex items-center gap-1">
        <h2 aria-live="polite" className="min-w-0 flex-1 px-1 text-[20px] font-semibold text-ink">
          {capitalize(formatMonth(year, monthIndex))}
        </h2>
        <IconButton
          label="Mois précédent"
          onClick={() => {
            changeMonth(-1)
          }}
        >
          <ChevronLeft size={24} aria-hidden />
        </IconButton>
        <IconButton
          label="Mois suivant"
          onClick={() => {
            changeMonth(1)
          }}
        >
          <ChevronRight size={24} aria-hidden />
        </IconButton>
      </div>
      <MonthGrid
        days={days}
        month={selected.slice(0, 7)}
        agenda={agenda}
        selected={selected}
        today={day}
        onSelect={select}
        onSwipe={changeMonth}
      />

      <Section
        title={
          selected === day
            ? `${capitalize(formatDay(selected))} · Aujourd’hui`
            : capitalize(formatDay(selected))
        }
        className="mt-6"
      >
        {agenda !== undefined &&
          (items.length === 0 ? (
            <p className="rounded-2xl bg-surface px-4 py-4 text-[15px] text-ink-3">
              Rien de prévu ce jour-là.
            </p>
          ) : (
            <ListGroup>
              {items.map((item) => (
                <AgendaRow
                  key={item.key}
                  item={item}
                  subtitle={itemSubtitle(item, summary)}
                  {...rowAction(item)}
                />
              ))}
            </ListGroup>
          ))}
      </Section>

      {sheet?.type === 'program' && <ProgramItemSheet item={sheet.item} today={day} onClose={close} />}
      {sheet?.type === 'occurrence' && (
        <OccurrenceSheet
          item={sheet.item}
          today={day}
          onClose={close}
          onDetails={() => {
            const { series, date } = sheet.item
            const event = occurrenceEvent(series, date, date <= day ? 'done' : 'planned', nowISO(), newId)
            setSheet({ type: 'edit', target: { mode: 'event', event, series, saved: false } })
          }}
          onEditSeries={() => {
            setSheet({ type: 'edit', target: { mode: 'series', series: sheet.item.series } })
          }}
        />
      )}
      {sheet?.type === 'edit' && (
        <EventSheet
          target={sheet.target}
          today={day}
          onClose={close}
          onSaved={(date) => {
            if (date !== null) select(date)
          }}
        />
      )}
    </Page>
  )
}
