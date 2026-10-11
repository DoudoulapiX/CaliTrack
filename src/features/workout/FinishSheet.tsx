import { useState } from 'react'
import { useSettings } from '@/app/data-context'
import { workoutDurationSec, workoutStats } from '@/content/workouts/stats'
import type { Workout } from '@/db/types'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChoiceChips } from '@/ui/Controls'
import { TextAreaField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { StatTiles } from './StatTiles'
import { useNow } from './useNow'
import { RPE_OPTIONS, statItems } from './workout-view'

export interface FinishValues {
  rpe: number | null
  notes: string
}

function LiveStats({ workout }: { workout: Workout }) {
  const settings = useSettings()
  const now = useNow(1000)
  return <StatTiles items={statItems(workout, workoutDurationSec(workout, now), settings.weightUnit)} />
}

/** Fin de séance : chiffres, ressenti et notes, puis enregistrement. Sans série faite : abandon. */
export function FinishSheet({
  open,
  workout,
  busy,
  onClose,
  onFinish,
  onAbandon,
}: {
  open: boolean
  workout: Workout
  busy: boolean
  onClose: () => void
  onFinish: (values: FinishValues) => void
  onAbandon: () => void
}) {
  const [rpe, setRpe] = useState('')
  const [notes, setNotes] = useState('')
  const { setsDone, setsTotal } = workoutStats(workout)
  const left = setsTotal - setsDone

  if (setsDone === 0) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        title="Terminer la séance"
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="danger" block size="lg" onClick={onAbandon}>
              Abandonner la séance
            </Button>
            <Button variant="secondary" block size="lg" onClick={onClose}>
              Continuer la séance
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-ink-2">
          Aucune série n’est cochée&nbsp;: il n’y a rien à enregistrer. Coche les séries faites, ou abandonne
          la séance.
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Terminer la séance"
      footer={
        <div className="flex flex-col gap-2">
          <Button
            block
            size="lg"
            disabled={busy}
            onClick={() => {
              onFinish({ rpe: rpe === '' ? null : Number(rpe), notes })
            }}
          >
            Enregistrer la séance
          </Button>
          <Button variant="secondary" block size="lg" onClick={onClose}>
            Continuer la séance
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <LiveStats workout={workout} />
        {left > 0 && (
          <p className="rounded-xl bg-warning/10 px-3 py-2 text-[14px] text-ink-2">
            {frenchSpacing(
              `${String(left)} série${left > 1 ? 's' : ''} pas cochée${left > 1 ? 's' : ''} : ` +
                `${left > 1 ? 'elles ne compteront' : 'elle ne comptera'} pas.`,
            )}
          </p>
        )}
        <div>
          <p className="mb-2 px-1 text-[13px] font-medium text-ink-2">Comment c’était&nbsp;?</p>
          <ChoiceChips
            label="Ressenti"
            value={rpe}
            onChange={setRpe}
            options={RPE_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))}
          />
        </div>
        <TextAreaField
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Sensations, douleurs, réglages…"
          maxLength={2000}
        />
      </div>
    </Sheet>
  )
}
