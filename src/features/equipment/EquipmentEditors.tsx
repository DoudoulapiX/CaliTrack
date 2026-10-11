import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { normalizeWeights } from '@/db/equipment'
import { formatNumber, unitToKg, type WeightUnit } from '@/lib/units'
import { frenchSpacing } from '@/lib/typography'
import { Button, IconButton } from '@/ui/Button'
import { ChipGroup } from '@/ui/Controls'
import { Field, INPUT_CLASS, NumberInput } from '@/ui/Field'
import { Section } from '@/ui/Page'
import { commonWeights, shownWeight, weightsFromShown } from './equipment-view'

export interface WeightsEditorProps {
  weightsKg: readonly number[]
  unit: WeightUnit
  onChange: (weightsKg: number[]) => void
}

/** Charges disponibles : les plus courantes d'un tap, les autres à la main. */
export function WeightsEditor({ weightsKg, unit, onChange }: WeightsEditorProps) {
  const [custom, setCustom] = useState<number | null>(null)
  const shown = weightsKg.map((kg) => shownWeight(kg, unit))
  const options = [...new Set([...commonWeights(unit), ...shown])].sort((a, b) => a - b)

  const add = () => {
    if (custom === null || custom <= 0) return
    if (!shown.some((value) => Math.abs(value - custom) < 0.01)) {
      onChange(normalizeWeights([...weightsKg, unitToKg(custom, unit)]))
    }
    setCustom(null)
  }

  return (
    <Section title="Charges">
      <ChipGroup
        label="Charges"
        options={options.map((value) => ({ value, label: `${formatNumber(value)} ${unit}` }))}
        selected={shown}
        onChange={(values) => {
          onChange(normalizeWeights(weightsFromShown(values, weightsKg, unit)))
        }}
      />
      {/* Un formulaire : la touche « OK » du clavier ajoute aussi la charge. */}
      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Field label="Autre charge">
          {({ id, describedBy }) => (
            <div className="flex items-center gap-2">
              <NumberInput
                id={id}
                describedBy={describedBy}
                className="flex-1"
                value={custom}
                decimal
                min={0}
                max={500}
                suffix={unit}
                placeholder={unit === 'kg' ? '7,5' : '17,5'}
                onChange={setCustom}
              />
              <Button type="submit" variant="secondary" disabled={custom === null || custom <= 0}>
                Ajouter
              </Button>
            </div>
          )}
        </Field>
      </form>
      <p className="mt-2 px-1 text-[13px] text-ink-3" aria-live="polite">
        {weightsKg.length === 0
          ? frenchSpacing('Touche les charges que tu as : ton programme s’en servira.')
          : `${weightsKg.length} charge${weightsKg.length > 1 ? 's' : ''} enregistrée${weightsKg.length > 1 ? 's' : ''}`}
      </p>
    </Section>
  )
}

export interface BandLevelsEditorProps {
  levels: readonly string[]
  onChange: (levels: string[]) => void
}

/** Niveaux d'élastiques, du plus léger au plus fort. */
export function BandLevelsEditor({ levels, onChange }: BandLevelsEditorProps) {
  return (
    <Section title="Niveaux de résistance">
      <ol className="flex flex-col gap-2">
        {levels.map((level, index) => (
          // Les niveaux n'ont pas d'identifiant : leur rang sert de clé (champs contrôlés).
          <li key={index} className="flex items-center gap-2">
            <input
              aria-label={`Niveau ${index + 1}`}
              value={level}
              maxLength={30}
              placeholder={`Niveau ${index + 1}`}
              className={INPUT_CLASS}
              onChange={(e) => {
                onChange(levels.map((other, i) => (i === index ? e.target.value : other)))
              }}
            />
            <IconButton
              label={`Retirer le niveau ${index + 1}`}
              onClick={() => {
                onChange(levels.filter((_, i) => i !== index))
              }}
            >
              <Trash2 size={18} aria-hidden />
            </IconButton>
          </li>
        ))}
      </ol>
      <Button
        variant="secondary"
        className="mt-3"
        icon={<Plus size={18} aria-hidden />}
        disabled={levels.length >= 10}
        onClick={() => {
          onChange([...levels, ''])
        }}
      >
        Ajouter un niveau
      </Button>
      <p className="mt-2 px-1 text-[13px] text-ink-3">
        Du plus léger au plus fort (couleur ou charge indiquée).
      </p>
    </Section>
  )
}
