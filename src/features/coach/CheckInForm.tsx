import type { ReactNode } from 'react'
import { frenchSpacing } from '@/lib/typography'
import { ChipGroup, Segmented } from '@/ui/Controls'
import { TextAreaField } from '@/ui/Field'
import {
  ENERGY_OPTIONS,
  NOTE_MAX,
  SLEEP_OPTIONS,
  SORENESS_OPTIONS,
  ZONE_OPTIONS,
  type CheckInDraft,
} from './coach-today-view'

function Question({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-[13px] font-medium text-ink-2">{label}</p>
      {children}
    </div>
  )
}

/**
 * Le ressenti du jour, donné au coach avec la demande : sommeil (quand la bague ne l'a pas mesuré),
 * énergie, courbatures et leurs zones, et une note libre.
 */
export function CheckInForm({
  value,
  onChange,
  showSleep,
}: {
  value: CheckInDraft
  onChange: (next: CheckInDraft) => void
  /** Faux quand la bague Oura a noté la nuit : on ne redemande pas le sommeil. */
  showSleep: boolean
}) {
  const set = <K extends keyof CheckInDraft>(key: K, next: CheckInDraft[K]) => {
    onChange({ ...value, [key]: next })
  }
  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-surface p-4">
      {showSleep && (
        <Question label="Sommeil">
          <Segmented
            label="Sommeil"
            value={value.sleep}
            options={SLEEP_OPTIONS}
            onChange={(sleep) => set('sleep', sleep)}
          />
        </Question>
      )}
      <Question label="Énergie">
        <Segmented
          label="Énergie"
          value={value.energy}
          options={ENERGY_OPTIONS}
          onChange={(energy) => set('energy', energy)}
        />
      </Question>
      <Question label="Courbatures">
        <Segmented
          label="Courbatures"
          value={value.soreness}
          options={SORENESS_OPTIONS}
          onChange={(soreness) => set('soreness', soreness)}
        />
        {value.soreness !== 'none' && (
          <ChipGroup
            label="Zones courbaturées"
            options={ZONE_OPTIONS}
            selected={value.zones}
            onChange={(zones) => set('zones', zones)}
            className="mt-1"
          />
        )}
      </Question>
      <TextAreaField
        label={frenchSpacing('Autre chose à dire au coach ?')}
        hint="Facultatif"
        value={value.note}
        maxLength={NOTE_MAX}
        autoCapitalize="sentences"
        placeholder="Ex. genou un peu sensible, grosse journée de travail"
        onChange={(note) => set('note', note)}
      />
    </div>
  )
}
