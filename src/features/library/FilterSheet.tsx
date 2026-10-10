import { Link } from 'react-router'
import type { ExerciseFilter, EquipmentFilter } from '@/content/exercises/catalog'
import { EMPTY_FILTER, activeFilterCount } from '@/content/exercises/catalog'
import {
  CATEGORY_ORDER,
  CATEGORY_PLURAL,
  LEVEL_LABEL,
  LEVEL_ORDER,
  MUSCLE_LABEL,
  MUSCLE_ORDER,
  SOURCE_LABEL,
  SOURCE_ORDER,
} from '@/content/exercises/labels'
import { Button } from '@/ui/Button'
import { ChipGroup, Segmented, Toggle } from '@/ui/Controls'
import { Section } from '@/ui/Page'
import { Sheet } from '@/ui/Sheet'

export interface FilterSheetProps {
  open: boolean
  onClose: () => void
  filter: ExerciseFilter
  onChange: (filter: ExerciseFilter) => void
  resultCount: number
  hasInventory: boolean
}

const EQUIPMENT_OPTIONS: { value: EquipmentFilter; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'mine', label: 'Mon matériel' },
  { value: 'none', label: 'Sans matériel' },
]

export function FilterSheet({
  open,
  onClose,
  filter,
  onChange,
  resultCount,
  hasInventory,
}: FilterSheetProps) {
  const set = (patch: Partial<ExerciseFilter>) => {
    onChange({ ...filter, ...patch })
  }
  const count = activeFilterCount(filter)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filtres"
      tall
      footer={
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="lg"
            className="shrink-0"
            disabled={count === 0}
            onClick={() => {
              onChange({ ...EMPTY_FILTER, query: filter.query })
            }}
          >
            Effacer
          </Button>
          <Button size="lg" className="min-w-0 flex-1" onClick={onClose}>
            {resultCount === 0
              ? 'Aucun exercice'
              : `Voir ${resultCount} exercice${resultCount > 1 ? 's' : ''}`}
          </Button>
        </div>
      }
    >
      <Section title="Matériel">
        <Segmented
          label="Matériel"
          value={filter.equipment}
          options={EQUIPMENT_OPTIONS}
          onChange={(equipment) => {
            set({ equipment })
          }}
        />
        {filter.equipment === 'mine' && !hasInventory && (
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            Ton inventaire est vide : seuls les exercices sans matériel s’affichent.{' '}
            <Link to="/more/equipment" className="font-medium text-accent-text" onClick={onClose}>
              Ajouter mon matériel
            </Link>
          </p>
        )}
      </Section>

      <div className="mb-6 overflow-hidden rounded-2xl bg-surface-2">
        <Toggle
          label="Favoris uniquement"
          checked={filter.favorites}
          onChange={(favorites) => {
            set({ favorites })
          }}
        />
      </div>

      <Section title="Type">
        <ChipGroup
          label="Type d’exercice"
          options={CATEGORY_ORDER.map((value) => ({ value, label: CATEGORY_PLURAL[value] }))}
          selected={filter.categories}
          onChange={(categories) => {
            set({ categories })
          }}
        />
      </Section>

      <Section title="Muscle principal">
        <ChipGroup
          label="Muscle principal"
          options={MUSCLE_ORDER.map((value) => ({ value, label: MUSCLE_LABEL[value] }))}
          selected={filter.muscles}
          onChange={(muscles) => {
            set({ muscles })
          }}
        />
      </Section>

      <Section title="Niveau">
        <ChipGroup
          label="Niveau"
          options={LEVEL_ORDER.map((value) => ({ value, label: LEVEL_LABEL[value] }))}
          selected={filter.levels}
          onChange={(levels) => {
            set({ levels })
          }}
        />
      </Section>

      <Section title="Origine">
        <ChipGroup
          label="Origine"
          options={SOURCE_ORDER.map((value) => ({ value, label: SOURCE_LABEL[value] }))}
          selected={filter.sources}
          onChange={(sources) => {
            set({ sources })
          }}
        />
      </Section>
    </Sheet>
  )
}
