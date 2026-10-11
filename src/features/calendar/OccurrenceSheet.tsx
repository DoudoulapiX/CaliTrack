import { useState } from 'react'
import { Check } from 'lucide-react'
import { CLIMBING_DAYS_SERIES_ID, type OccurrenceItem } from '@/content/calendar/agenda'
import { setOccurrenceStatus } from '@/db/calendar'
import { capitalize, formatDay, type ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { Button, ButtonLink } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { KindIcon } from './AgendaRow'
import { describeSeries, measuresLine } from './calendar-view'

export interface OccurrenceSheetProps {
  item: OccurrenceItem
  today: ISODate
  onClose: () => void
  /** Ouvre ce jour-là dans le formulaire (durée, distance, calories…). */
  onDetails: () => void
  /** Ouvre la séance répétée dans le formulaire. */
  onEditSeries: () => void
}

/** Un jour d'une séance répétée : c'est fait, pas cette fois, ou le détail de ce jour-là. */
export function OccurrenceSheet({ item, today, onClose, onDetails, onEditSeries }: OccurrenceSheetProps) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const { series, date } = item
  const fromProfile = series.id === CLIMBING_DAYS_SERIES_ID
  const past = date <= today

  const mark = async (status: 'done' | 'skipped') => {
    setBusy(true)
    try {
      await setOccurrenceStatus(series, date, status)
      toast(status === 'done' ? 'Séance notée' : 'Séance annulée')
      onClose()
    } catch (error) {
      setBusy(false)
      toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={series.title}
      footer={
        <div className="flex flex-col gap-2">
          {past && (
            <Button
              block
              size="lg"
              disabled={busy}
              icon={<Check size={18} aria-hidden />}
              onClick={() => void mark('done')}
            >
              C’est fait
            </Button>
          )}
          <Button variant="secondary" block size="lg" disabled={busy} onClick={onDetails}>
            {past ? 'Noter avec les détails' : 'Modifier ce jour-là'}
          </Button>
          <Button variant="secondary" block size="lg" disabled={busy} onClick={() => void mark('skipped')}>
            Pas cette fois
          </Button>
          {fromProfile ? (
            <ButtonLink to="/more/profile" variant="ghost" block size="lg">
              Changer mes jours d’escalade
            </ButtonLink>
          ) : (
            <Button variant="ghost" block size="lg" disabled={busy} onClick={onEditSeries}>
              Modifier la répétition
            </Button>
          )}
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <KindIcon kind={series.kind} title={series.title} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-ink">{capitalize(formatDay(date))}</p>
          <p className="mt-0.5 text-[14px] text-ink-3">
            {[describeSeries(series), measuresLine(series)].filter(Boolean).join(' · ')}
          </p>
          {fromProfile && (
            <p className="mt-0.5 text-[14px] text-ink-3">D’après les jours d’escalade de ton profil.</p>
          )}
        </div>
      </div>
      {series.notes !== '' && (
        <p className="mt-3 text-[14px] whitespace-pre-line text-ink-2">{series.notes}</p>
      )}
    </Sheet>
  )
}
