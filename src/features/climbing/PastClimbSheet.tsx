import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSettings } from '@/app/data-context'
import { pastSession } from '@/content/climbing/session'
import { addClimb } from '@/db/climbing'
import { isISODate, nowISO, today, type ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { Button } from '@/ui/Button'
import { ChoiceChips } from '@/ui/Controls'
import { NumberField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { climbHistoryPath } from './climb-view'
import { GradeSwatch } from './GradeSwatch'
import { activeScaleOf, useGradeScales } from './useClimbing'

export interface PastClimbSheetProps {
  onClose: () => void
  /** Jour proposé (aujourd'hui par défaut). */
  date?: ISODate
}

/** Noter une séance déjà faite : son jour, sa durée et sa salle ; ses blocs s'ajoutent ensuite. */
export function PastClimbSheet({ onClose, date: initialDate }: PastClimbSheetProps) {
  const settings = useSettings()
  const scales = useGradeScales()
  const navigate = useNavigate()
  const toast = useToast()
  const day = today()
  const [date, setDate] = useState(initialDate ?? day)
  const [durationMin, setDurationMin] = useState<number | null>(null)
  const [gym, setGym] = useState(settings.climbingGym)
  const [scaleId, setScaleId] = useState(settings.activeGradeScaleId)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!isISODate(date) || date > day) {
      setError('Choisis un jour passé, ou aujourd’hui.')
      return
    }
    const scale = scales ? (scales.find((s) => s.id === scaleId) ?? activeScaleOf(scales, settings)) : null
    if (!scale) {
      setError('Aucune échelle de cotation disponible.')
      return
    }
    setBusy(true)
    try {
      const session = await addClimb(
        pastSession({ gym, scaleId: scale.id, date, durationMin }, nowISO(), newId()),
      )
      toast('Séance ajoutée')
      void navigate(climbHistoryPath(session.id))
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Séance passée"
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="px-1 text-center text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy || !scales} onClick={() => void create()}>
            Créer la séance
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <p className="text-[15px] text-ink-2">Tu ajoutes ensuite ses blocs, couleur par couleur.</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Jour"
            type="date"
            value={date}
            max={day}
            onChange={(value) => {
              setDate(value)
              setError(null)
            }}
          />
          <NumberField
            label="Durée (facultatif)"
            suffix="min"
            value={durationMin}
            min={1}
            max={1440}
            placeholder="90"
            onChange={setDurationMin}
          />
        </div>
        <TextField
          label="Salle ou site"
          value={gym}
          maxLength={60}
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder="Ex. Vertical’Art"
          onChange={setGym}
        />
        {scales && scales.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[13px] font-medium text-ink-2">Cotation</span>
            <ChoiceChips
              label="Cotation"
              value={scaleId}
              onChange={setScaleId}
              options={scales.map((scale) => ({
                value: scale.id,
                label: scale.name,
                icon: <GradeSwatch color={scale.grades[0]?.color ?? '#71717a'} size="xs" />,
              }))}
            />
          </div>
        )}
      </form>
    </Sheet>
  )
}
