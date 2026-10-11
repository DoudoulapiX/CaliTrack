import { useState } from 'react'
import { useSettings } from '@/app/data-context'
import { PROFILE_LIMITS } from '@/content/profile'
import { logWeight } from '@/db/goals'
import { isISODate, today as todayISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { formatBodyWeight, kgToUnit, unitToKg } from '@/lib/units'
import { Button } from '@/ui/Button'
import { NumberField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { weightInUnit } from './goal-view'

/** Noter son poids du jour (ou d'un jour passé). */
export function WeightSheet({ lastKg, onClose }: { lastKg: number | null; onClose: () => void }) {
  const { weightUnit: unit } = useSettings()
  const toast = useToast()
  const day = todayISO()
  const [value, setValue] = useState<number | null>(lastKg === null ? null : weightInUnit(lastKg, unit))
  const [date, setDate] = useState(day)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { min, max } = PROFILE_LIMITS.weightKg

  const save = async () => {
    const kg = value === null ? null : unitToKg(value, unit)
    if (kg === null) {
      setError('Indique ton poids.')
      return
    }
    if (kg < min - 0.5 || kg > max + 0.5) {
      setError(`Le poids doit être entre ${formatBodyWeight(min, unit)} et ${formatBodyWeight(max, unit)}.`)
      return
    }
    if (!isISODate(date) || date > day) {
      setError('Choisis un jour passé ou aujourd’hui.')
      return
    }
    setBusy(true)
    try {
      await logWeight(date, kg)
      toast('Poids noté')
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Noter mon poids"
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <NumberField
          label="Poids"
          value={value}
          decimal
          min={Math.floor(kgToUnit(min, unit))}
          max={Math.ceil(kgToUnit(max, unit))}
          suffix={unit}
          onChange={(next) => {
            setValue(next)
            setError(null)
          }}
        />
        <TextField
          label="Jour"
          type="date"
          value={date}
          max={day}
          hint="Une pesée par jour : la nouvelle remplace celle déjà notée."
          onChange={(next) => {
            setDate(next)
            setError(null)
          }}
        />
      </form>
    </Sheet>
  )
}
