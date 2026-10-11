import { useState, type ReactNode } from 'react'
import type { ProgramSession } from '@/db/types'
import type { Weekday } from '@/lib/dates'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { WeekdayPicker } from '@/ui/WeekdayPicker'

export interface SessionDraft {
  name: string
  weekdays: Weekday[]
}

/** Nom et jours d'une séance (nouvelle ou existante). */
export function SessionSheet({
  open,
  onClose,
  session,
  takenDays,
  onSave,
  children,
}: {
  open: boolean
  onClose: () => void
  /** Séance à modifier ; absente pour en créer une. */
  session?: Pick<ProgramSession, 'name' | 'weekdays'>
  /** Jours déjà pris par d'autres séances (en pointillés). */
  takenDays: readonly Weekday[]
  onSave: (draft: SessionDraft) => Promise<void>
  /** Actions en plus (dupliquer, supprimer). */
  children?: ReactNode
}) {
  return (
    <Sheet open={open} onClose={onClose} title={session ? 'Séance' : 'Nouvelle séance'}>
      {open && <SessionForm session={session} takenDays={takenDays} onSave={onSave} extra={children} />}
    </Sheet>
  )
}

function SessionForm({
  session,
  takenDays,
  onSave,
  extra,
}: {
  session?: Pick<ProgramSession, 'name' | 'weekdays'>
  takenDays: readonly Weekday[]
  onSave: (draft: SessionDraft) => Promise<void>
  extra?: ReactNode
}) {
  const [name, setName] = useState(session?.name ?? '')
  const [weekdays, setWeekdays] = useState<Weekday[]>(session ? [...session.weekdays] : [])
  const [saving, setSaving] = useState(false)
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        setSaving(true)
        void onSave({ name, weekdays }).finally(() => {
          setSaving(false)
        })
      }}
    >
      <TextField
        label="Nom"
        value={name}
        onChange={setName}
        placeholder="Haut du corps, Jambes…"
        maxLength={60}
      />
      <div>
        <p className="mb-2 px-1 text-[13px] font-semibold text-ink-2">Jours</p>
        <WeekdayPicker
          label="Jours de la séance"
          value={weekdays}
          onChange={setWeekdays}
          marked={takenDays}
        />
        <p className="mt-2 px-1 text-[13px] text-ink-3">
          En pointillés, les jours déjà pris par une autre séance. Sans jour, la séance reste disponible à la
          demande.
        </p>
      </div>
      <Button type="submit" block size="lg" disabled={saving}>
        {session ? 'Enregistrer' : 'Créer la séance'}
      </Button>
      {extra}
    </form>
  )
}
