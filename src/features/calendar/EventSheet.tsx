import { useState, type ReactNode } from 'react'
import { firstOccurrence } from '@/content/calendar/agenda'
import {
  CARDIO_ACTIVITIES,
  draftError,
  draftFromEvent,
  draftFromSeries,
  eventFromDraft,
  MAX_INTERVAL_WEEKS,
  newEventDraft,
  PERSONAL_KINDS,
  seriesFromDraft,
  withDate,
  withKind,
  type EventDraft,
} from '@/content/calendar/event-form'
import { deleteEvent, deleteSeries, saveEvent, saveSeries } from '@/db/calendar'
import type { CalendarEvent, EventSeries, EventStatus } from '@/db/types'
import { nowISO, type ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChoiceChips, Segmented, Toggle } from '@/ui/Controls'
import { NumberField, SelectField, TextAreaField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { WeekdayPicker } from '@/ui/WeekdayPicker'
import { KIND_ICON } from './kind-icons'

/** Ce que modifie le formulaire. */
export type EventEditTarget =
  | { mode: 'new'; date: ISODate }
  /** Une séance enregistrée, ou un jour d'une séance répétée pas encore noté (saved : false). */
  | { mode: 'event'; event: CalendarEvent; series: EventSeries | null; saved: boolean }
  | { mode: 'series'; series: EventSeries }

const KIND_OPTIONS = PERSONAL_KINDS.map((option) => {
  const Icon = KIND_ICON[option.value]
  return { value: option.value, label: option.label, icon: <Icon size={15} aria-hidden /> }
})

const ACTIVITY_OPTIONS = CARDIO_ACTIVITIES.map((activity) => ({ value: activity, label: activity }))

const INTERVAL_OPTIONS = Array.from({ length: MAX_INTERVAL_WEEKS }, (_, i) => ({
  value: String(i + 1),
  label: i === 0 ? 'Chaque semaine' : `Toutes les ${String(i + 1)} semaines`,
}))

const STATUS_OPTIONS: { value: EventStatus; label: string }[] = [
  { value: 'planned', label: 'Prévue' },
  { value: 'done', label: 'Faite' },
  { value: 'skipped', label: 'Annulée' },
]

function initialDraft(target: EventEditTarget, today: ISODate): EventDraft {
  switch (target.mode) {
    case 'new':
      return newEventDraft(target.date, today)
    case 'event':
      return draftFromEvent(target.event)
    case 'series':
      return draftFromSeries(target.series)
  }
}

function sheetTitle(target: EventEditTarget): string {
  switch (target.mode) {
    case 'new':
      return 'Nouvelle séance'
    case 'event':
      return target.saved ? 'Modifier la séance' : 'Noter la séance'
    case 'series':
      return 'Séance répétée'
  }
}

/** Un choix (pastilles, jours…) avec son intitulé visible. */
function LabeledChoice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="px-1 text-[13px] font-medium text-ink-2">{label}</span>
      {children}
    </div>
  )
}

export interface EventSheetProps {
  target: EventEditTarget
  today: ISODate
  onClose: () => void
  /** Après l'enregistrement : le jour à montrer (null : rester sur le jour affiché). */
  onSaved: (date: ISODate | null) => void
}

/**
 * Ajout ou modification d'une séance perso (cardio, escalade, autre, repos), ponctuelle ou répétée
 * chaque semaine. Montée à l'ouverture.
 */
export function EventSheet({ target, today, onClose, onSaved }: EventSheetProps) {
  const toast = useToast()
  const [draft, setDraft] = useState<EventDraft>(() => initialDraft(target, today))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const repeats = target.mode === 'series' || (target.mode === 'new' && draft.repeat)
  // Un jour d'une séance répétée reste à sa place (sinon la répétition le reprévoirait).
  const seriesDay = target.mode === 'event' && target.series !== null
  const deletable = target.mode === 'series' || (target.mode === 'event' && target.saved && !seriesDay)

  const update = (next: EventDraft) => {
    setDraft(next)
    setError(null)
  }

  const save = async () => {
    const problem = draftError(draft, today)
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      const now = nowISO()
      if (repeats) {
        const base = target.mode === 'series' ? target.series : null
        const saved = await saveSeries(seriesFromDraft(draft, base, now, newId))
        toast(base ? 'Répétition enregistrée' : 'Séance ajoutée')
        onSaved(base ? null : firstOccurrence(saved))
      } else {
        const base = target.mode === 'event' ? target.event : null
        const saved = await saveEvent(eventFromDraft(draft, base, now, newId))
        toast(
          target.mode === 'event' ? (target.saved ? 'Séance enregistrée' : 'Séance notée') : 'Séance ajoutée',
        )
        onSaved(saved.date)
      }
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      if (target.mode === 'series') {
        await deleteSeries(target.series.id)
        toast('Répétition supprimée')
      } else if (target.mode === 'event') {
        await deleteEvent(target.event.id)
        toast('Séance supprimée')
      }
      onClose()
    } catch {
      setBusy(false)
      toast('Suppression impossible', 'error')
    }
  }

  if (confirming) {
    const savedTitle =
      target.mode === 'series'
        ? target.series.title
        : target.mode === 'event'
          ? target.event.title
          : draft.title
    return (
      <Sheet
        open
        onClose={onClose}
        title={frenchSpacing(`Supprimer « ${savedTitle} » ?`)}
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="danger" block size="lg" disabled={busy} onClick={() => void remove()}>
              {target.mode === 'series' ? 'Supprimer la répétition' : 'Supprimer la séance'}
            </Button>
            <Button
              variant="secondary"
              block
              size="lg"
              onClick={() => {
                setConfirming(false)
              }}
            >
              Annuler
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-ink-2">
          {target.mode === 'series'
            ? 'Les séances déjà faites restent dans le calendrier, les suivantes disparaissent.'
            : 'Elle disparaît du calendrier.'}
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={sheetTitle(target)}
      tall
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="px-1 text-center text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void save()}>
            {target.mode === 'new' ? 'Ajouter la séance' : 'Enregistrer'}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <LabeledChoice label="Type">
          <ChoiceChips
            label="Type de séance"
            value={draft.kind}
            options={KIND_OPTIONS}
            onChange={(kind) => {
              update(withKind(draft, kind))
            }}
          />
        </LabeledChoice>
        {draft.kind === 'cardio' && (
          <LabeledChoice label="Activité">
            <ChoiceChips
              label="Activité"
              value={draft.title.trim()}
              options={ACTIVITY_OPTIONS}
              onChange={(title) => {
                update({ ...draft, title })
              }}
            />
          </LabeledChoice>
        )}
        <TextField
          label="Nom"
          value={draft.title}
          maxLength={60}
          autoCapitalize="sentences"
          enterKeyHint="done"
          onChange={(title) => {
            update({ ...draft, title })
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={repeats ? 'Premier jour' : 'Jour'}
            type="date"
            value={draft.date}
            disabled={seriesDay}
            hint={seriesDay ? 'Jour d’une séance répétée' : undefined}
            onChange={(date) => {
              update(withDate(draft, date, today))
            }}
          />
          <TextField
            label="Heure (facultatif)"
            type="time"
            value={draft.time}
            onChange={(time) => {
              update({ ...draft, time })
            }}
          />
        </div>
        {draft.kind !== 'rest' && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Durée"
              suffix="min"
              value={draft.durationMin}
              min={1}
              max={1440}
              onChange={(durationMin) => {
                update({ ...draft, durationMin })
              }}
            />
            {draft.kind === 'cardio' && !repeats && (
              <NumberField
                label="Distance"
                suffix="km"
                decimal
                value={draft.distanceKm}
                min={0}
                max={1000}
                onChange={(distanceKm) => {
                  update({ ...draft, distanceKm })
                }}
              />
            )}
            {!repeats && (
              <NumberField
                label="Calories"
                suffix="kcal"
                value={draft.energyKcal}
                min={0}
                max={20000}
                onChange={(energyKcal) => {
                  update({ ...draft, energyKcal })
                }}
              />
            )}
          </div>
        )}
        {!repeats && (
          <LabeledChoice label="Statut">
            <Segmented
              label="Statut"
              value={draft.status}
              options={target.mode === 'new' ? STATUS_OPTIONS.slice(0, 2) : STATUS_OPTIONS}
              onChange={(status) => {
                update({ ...draft, status })
              }}
            />
          </LabeledChoice>
        )}
        {target.mode === 'new' && (
          <div className="overflow-hidden rounded-2xl bg-surface-2">
            <Toggle
              label="Répéter chaque semaine"
              checked={draft.repeat}
              onChange={(repeat) => {
                update({ ...draft, repeat })
              }}
            />
          </div>
        )}
        {repeats && (
          <>
            <LabeledChoice label="Jours">
              <WeekdayPicker
                label="Jours de la semaine"
                value={draft.weekdays}
                onChange={(weekdays) => {
                  update({ ...draft, weekdays })
                }}
              />
            </LabeledChoice>
            <SelectField
              label="Fréquence"
              value={String(draft.intervalWeeks)}
              options={INTERVAL_OPTIONS}
              onChange={(value) => {
                update({ ...draft, intervalWeeks: Number(value) })
              }}
            />
            <TextField
              label="Jusqu’au (facultatif)"
              type="date"
              value={draft.endDate}
              hint="Sans date, elle se répète sans fin."
              onChange={(endDate) => {
                update({ ...draft, endDate })
              }}
            />
          </>
        )}
        <TextAreaField
          label="Notes"
          value={draft.notes}
          rows={2}
          maxLength={2000}
          onChange={(notes) => {
            update({ ...draft, notes })
          }}
        />
        {deletable && (
          <Button
            variant="danger"
            block
            onClick={() => {
              setConfirming(true)
            }}
          >
            {target.mode === 'series' ? 'Supprimer la répétition' : 'Supprimer la séance'}
          </Button>
        )}
      </form>
    </Sheet>
  )
}
