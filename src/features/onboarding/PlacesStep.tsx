import type { LocationIcon } from '@/db/types'
import { EQUIPMENT_LABEL, LOCATION_PRESETS } from '@/content/equipment'
import { ChipGroup } from '@/ui/Controls'
import { frenchSpacing } from '@/lib/typography'
import { Section } from '@/ui/Page'
import type { PlaceDraft } from './complete'

const WHERE = frenchSpacing('Où t’entraînes-tu ?')

export interface PlacesStepProps {
  places: readonly PlaceDraft[]
  onChange: (places: PlaceDraft[]) => void
}

/** Lieux d'entraînement et matériel de chacun, cochés en quelques taps. */
export function PlacesStep({ places, onChange }: PlacesStepProps) {
  const chosen = places.map((place) => place.icon)

  const choose = (icons: LocationIcon[]) => {
    // Ordre fixe des lieux ; un lieu ajouté part avec son matériel le plus courant déjà coché.
    onChange(
      LOCATION_PRESETS.filter((preset) => icons.includes(preset.icon)).map(
        (preset) =>
          places.find((place) => place.icon === preset.icon) ?? {
            icon: preset.icon,
            name: preset.name,
            kinds: [...preset.preselected],
          },
      ),
    )
  }

  return (
    <>
      <Section title={WHERE}>
        <ChipGroup
          label={WHERE}
          options={LOCATION_PRESETS.map((preset) => ({ value: preset.icon, label: preset.name }))}
          selected={chosen}
          onChange={choose}
        />
        <p className="mt-2 px-1 text-[13px] text-ink-3">
          {places.length === 0
            ? 'Sans lieu ni matériel, ton programme se fera au poids du corps.'
            : 'Coche ce que tu as dans chaque lieu.'}
        </p>
      </Section>

      {places.map((place) => {
        const preset = LOCATION_PRESETS.find((p) => p.icon === place.icon)
        if (!preset) return null
        return (
          <Section key={place.icon} title={place.name}>
            <ChipGroup
              label={frenchSpacing(`Matériel : ${place.name}`)}
              options={preset.suggestions.map((kind) => ({ value: kind, label: EQUIPMENT_LABEL[kind] }))}
              selected={place.kinds}
              onChange={(kinds) => {
                onChange(places.map((p) => (p.icon === place.icon ? { ...p, kinds } : p)))
              }}
            />
          </Section>
        )
      })}

      {places.length > 0 && (
        <p className="px-1 text-[13px] text-ink-3">
          Tu pourras préciser tes charges (haltères de 2 kg…) et ajouter d’autre matériel dans Plus, puis
          Matériel et lieux.
        </p>
      )}
    </>
  )
}
