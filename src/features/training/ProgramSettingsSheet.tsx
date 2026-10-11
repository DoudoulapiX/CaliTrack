import { useState } from 'react'
import type { Location, Program } from '@/db/types'
import { isISODate } from '@/lib/dates'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Controls'
import { SelectField, TextAreaField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'

const EVERYWHERE = 'everywhere'

type Deload = 'never' | '4' | '6' | '8'

export interface ProgramSettings {
  name: string
  locationId: string | null
  startDate: string
  deloadEveryWeeks: number | null
  notes: string
}

/** Nom, matériel, début, semaines allégées et notes d'un programme. */
export function ProgramSettingsSheet({
  open,
  onClose,
  program,
  locations,
  onSave,
}: {
  open: boolean
  onClose: () => void
  program: Program
  locations: readonly Location[]
  onSave: (settings: ProgramSettings) => Promise<void>
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Réglages du programme" tall>
      {open && <SettingsForm program={program} locations={locations} onSave={onSave} />}
    </Sheet>
  )
}

function SettingsForm({
  program,
  locations,
  onSave,
}: {
  program: Program
  locations: readonly Location[]
  onSave: (settings: ProgramSettings) => Promise<void>
}) {
  const [name, setName] = useState(program.name)
  const [location, setLocation] = useState(program.locationId ?? EVERYWHERE)
  const [startDate, setStartDate] = useState(program.startDate)
  const [deload, setDeload] = useState<Deload>(
    program.deloadEveryWeeks === null ? 'never' : (String(program.deloadEveryWeeks) as Deload),
  )
  const [notes, setNotes] = useState(program.notes)
  const [saving, setSaving] = useState(false)
  const dateError = isISODate(startDate) ? null : 'Choisis une date.'
  // Une fréquence réglée ailleurs (3, 5…) reste proposée telle quelle.
  const deloadOptions: { value: Deload; label: string }[] = [
    { value: 'never', label: 'Jamais' },
    { value: '4', label: '4 sem.' },
    { value: '6', label: '6 sem.' },
    { value: '8', label: '8 sem.' },
  ]
  if (!deloadOptions.some((o) => o.value === deload))
    deloadOptions.push({ value: deload, label: `${deload} sem.` })
  const knownLocation = location === EVERYWHERE || locations.some((l) => l.id === location)

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (dateError) return
        setSaving(true)
        void onSave({
          name: name.trim() || program.name,
          locationId: location === EVERYWHERE ? null : location,
          startDate,
          deloadEveryWeeks: deload === 'never' ? null : Number(deload),
          notes: notes.trim(),
        }).finally(() => {
          setSaving(false)
        })
      }}
    >
      <TextField label="Nom" value={name} onChange={setName} maxLength={60} />
      <SelectField
        label="Matériel"
        value={location}
        options={[
          { value: EVERYWHERE, label: 'Tout mon matériel' },
          ...locations.map((l) => ({ value: l.id, label: `${l.name} seulement` })),
          ...(knownLocation ? [] : [{ value: location, label: 'Lieu supprimé' }]),
        ]}
        hint="Les progressions ne proposent que des exercices faisables avec ce matériel."
        onChange={setLocation}
      />
      <TextField
        label="Début du programme"
        type="date"
        value={startDate}
        onChange={setStartDate}
        error={dateError}
        hint="Sert à compter les semaines."
      />
      <div>
        <p className="mb-2 px-1 text-[13px] font-semibold text-ink-2">Semaine allégée</p>
        <Segmented label="Semaine allégée" value={deload} onChange={setDeload} options={deloadOptions} />
        <p className="mt-2 px-1 text-[13px] text-ink-3">
          {frenchSpacing(
            'Une semaine avec moitié moins de séries, pour récupérer : toutes les 4, 6 ou 8 semaines.',
          )}
        </p>
      </div>
      <TextAreaField label="Notes" value={notes} onChange={setNotes} rows={3} maxLength={2000} />
      <Button type="submit" block size="lg" disabled={saving || dateError !== null}>
        Enregistrer
      </Button>
    </form>
  )
}
