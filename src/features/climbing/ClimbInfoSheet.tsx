import { useState } from 'react'
import { useSettings } from '@/app/data-context'
import { updateClimb } from '@/db/climbing'
import { updateSettings } from '@/db/settings'
import type { ClimbingSession, GradeScale } from '@/db/types'
import { isISODate, today } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChoiceChips } from '@/ui/Controls'
import { NumberField, TextAreaField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { RPE_OPTIONS } from '@/features/workout/workout-view'
import { GradeSwatch } from './GradeSwatch'

const RPE_CHOICES = RPE_OPTIONS.map((option) => ({ value: String(option.value), label: option.label }))

export interface ClimbInfoSheetProps {
  session: ClimbingSession
  scales: readonly GradeScale[]
  onClose: () => void
  /** Séance en cours : on peut aussi l'abandonner d'ici. */
  onAbandon?: () => void
}

/**
 * La salle, l'échelle de cotation (tant qu'aucun bloc n'est noté), et pour une séance terminée son
 * jour, sa durée et son ressenti. Montée à l'ouverture.
 */
export function ClimbInfoSheet({ session, scales, onClose, onAbandon }: ClimbInfoSheetProps) {
  const settings = useSettings()
  const toast = useToast()
  const [gym, setGym] = useState(session.gym)
  const [scaleId, setScaleId] = useState(session.scaleId)
  const [date, setDate] = useState(session.date)
  const [durationMin, setDurationMin] = useState(session.durationMin)
  const [rpe, setRpe] = useState(session.rpe === null ? '' : String(session.rpe))
  const [notes, setNotes] = useState(session.notes)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const done = session.status === 'done'
  const day = today()
  const canChangeScale = session.boulders.length === 0 && scales.length > 1

  const save = async () => {
    if (done && (!isISODate(date) || date > day)) {
      setError('Choisis un jour passé, ou aujourd’hui.')
      return
    }
    setBusy(true)
    try {
      const place = gym.trim()
      await updateClimb(session.id, (s) => ({
        ...s,
        gym: place,
        // Les blocs déjà notés gardent leur échelle.
        scaleId: s.boulders.length === 0 ? scaleId : s.scaleId,
        notes: notes.trim(),
        ...(done ? { date, durationMin, rpe: rpe === '' ? null : Number(rpe) } : {}),
      }))
      // Une séance en cours donne la salle et l'échelle des prochaines.
      if (!done) {
        const patch = {
          ...(place !== '' && place !== settings.climbingGym ? { climbingGym: place } : {}),
          ...(scaleId !== settings.activeGradeScaleId && canChangeScale
            ? { activeGradeScaleId: scaleId }
            : {}),
        }
        if (Object.keys(patch).length > 0) await updateSettings(patch)
      }
      toast('Séance enregistrée')
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  if (confirming && onAbandon) {
    const count = session.boulders.length
    return (
      <Sheet
        open
        onClose={onClose}
        title={frenchSpacing('Abandonner la séance ?')}
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="danger" block size="lg" onClick={onAbandon}>
              Abandonner la séance
            </Button>
            <Button
              variant="secondary"
              block
              size="lg"
              onClick={() => {
                setConfirming(false)
              }}
            >
              Continuer la séance
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-ink-2">
          {count === 0
            ? 'Elle n’apparaîtra nulle part.'
            : `Elle disparaît avec ${count > 1 ? `ses ${String(count)} blocs notés` : 'son bloc noté'}.`}
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Séance d’escalade"
      tall={done}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="px-1 text-center text-[14px] font-medium text-danger">
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
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField
          label="Salle ou site"
          value={gym}
          maxLength={60}
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder="Ex. Vertical’Art"
          onChange={setGym}
        />
        {canChangeScale && (
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
        {done && (
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
              label="Durée"
              suffix="min"
              value={durationMin}
              min={1}
              max={1440}
              onChange={setDurationMin}
            />
          </div>
        )}
        {done && (
          <div>
            <p className="mb-2 px-1 text-[13px] font-medium text-ink-2">Ressenti</p>
            <ChoiceChips label="Ressenti" value={rpe} onChange={setRpe} options={RPE_CHOICES} />
          </div>
        )}
        <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={3} maxLength={2000} />
        {onAbandon && (
          <Button
            variant="danger"
            block
            onClick={() => {
              setConfirming(true)
            }}
          >
            Abandonner la séance
          </Button>
        )}
      </form>
    </Sheet>
  )
}
