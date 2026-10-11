import { useState } from 'react'
import { FORGOTTEN_AFTER_MIN, suggestedDurationMin } from '@/content/climbing/session'
import { summarize } from '@/content/climbing/stats'
import type { ClimbingSession, GradeScale } from '@/db/types'
import { minutesBetween, nowISO } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChoiceChips } from '@/ui/Controls'
import { NumberField, TextAreaField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { StatTiles } from '@/features/workout/StatTiles'
import { RPE_OPTIONS } from '@/features/workout/workout-view'
import { climbTiles } from './climb-view'

export interface FinishClimbValues {
  durationMin: number | null
  rpe: number | null
  notes: string
}

export interface FinishClimbSheetProps {
  session: ClimbingSession
  scale: GradeScale | null
  busy: boolean
  onClose: () => void
  onFinish: (values: FinishClimbValues) => void
  onAbandon: () => void
}

const RPE_CHOICES = RPE_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))

/** Fin de la séance d'escalade : durée (proposée), ressenti et notes. Montée à l'ouverture. */
export function FinishClimbSheet({
  session,
  scale,
  busy,
  onClose,
  onFinish,
  onAbandon,
}: FinishClimbSheetProps) {
  const [opened] = useState(nowISO)
  const [durationMin, setDurationMin] = useState(() => suggestedDurationMin(session, opened))
  const [rpe, setRpe] = useState(session.rpe === null ? '' : String(session.rpe))
  const [notes, setNotes] = useState(session.notes)
  const forgotten = minutesBetween(session.startedAt, opened) > FORGOTTEN_AFTER_MIN
  const empty = session.boulders.length === 0

  return (
    <Sheet
      open
      onClose={onClose}
      title="Terminer la séance"
      footer={
        <div className="flex flex-col gap-2">
          <Button
            block
            size="lg"
            disabled={busy}
            onClick={() => {
              onFinish({ durationMin, rpe: rpe === '' ? null : Number(rpe), notes })
            }}
          >
            Enregistrer la séance
          </Button>
          <Button variant="secondary" block size="lg" onClick={onClose}>
            Continuer la séance
          </Button>
          {empty && (
            <Button variant="danger" block size="lg" disabled={busy} onClick={onAbandon}>
              Abandonner la séance
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <StatTiles items={climbTiles(summarize(session.boulders, scale), durationMin)} />
        {empty && (
          <p className="rounded-xl bg-warning/10 px-3 py-2 text-[14px] text-ink-2">
            {frenchSpacing(
              'Aucun bloc noté : la séance compte quand même (durée, ressenti), ou abandonne-la.',
            )}
          </p>
        )}
        <NumberField
          label="Durée"
          suffix="min"
          value={durationMin}
          min={1}
          max={1440}
          onChange={setDurationMin}
          hint={
            forgotten
              ? frenchSpacing(
                  'La séance est restée ouverte longtemps : durée estimée d’après ton dernier bloc.',
                )
              : undefined
          }
        />
        <div>
          <p className="mb-2 px-1 text-[13px] font-medium text-ink-2">Comment c’était&nbsp;?</p>
          <ChoiceChips label="Ressenti" value={rpe} onChange={setRpe} options={RPE_CHOICES} />
        </div>
        <TextAreaField
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Forme du jour, blocs à retenter, peau…"
          maxLength={2000}
        />
      </div>
    </Sheet>
  )
}
