import { Check } from 'lucide-react'
import type { ExperienceLevel, Sex } from '@/db/types'
import type { ProfileDraft } from '@/db/profile'
import {
  EXPERIENCE_DESCRIPTION,
  EXPERIENCE_LABEL,
  EXPERIENCE_ORDER,
  GOAL_FOCUS_LABEL,
  GOAL_FOCUS_ORDER,
  PROFILE_LIMITS,
  SESSION_LENGTHS,
  SEX_LABEL,
} from '@/content/profile'
import { SKILLS } from '@/content/skills'
import { cn } from '@/lib/cn'
import { kgToUnit, unitToKg, type WeightUnit } from '@/lib/units'
import { ChipGroup, Segmented } from '@/ui/Controls'
import { NumberField, SelectField, TextField } from '@/ui/Field'
import { Section } from '@/ui/Page'
import { WeekdayPicker } from '@/ui/WeekdayPicker'

export interface ProfileFieldsProps {
  draft: ProfileDraft
  onChange: (patch: Partial<ProfileDraft>) => void
}

const SEX_OPTIONS: { value: Sex | ''; label: string }[] = [
  { value: '', label: 'Non précisé' },
  { value: 'male', label: SEX_LABEL.male },
  { value: 'female', label: SEX_LABEL.female },
  { value: 'other', label: SEX_LABEL.other },
]

/** Poids affiché dans l'unité choisie, à 0,1 près. */
function shownWeight(weightKg: number | null, unit: WeightUnit): number | null {
  return weightKg === null ? null : Math.round(kgToUnit(weightKg, unit) * 10) / 10
}

export function IdentityFields({
  draft,
  onChange,
  weightUnit,
}: ProfileFieldsProps & { weightUnit: WeightUnit }) {
  const { heightCm, weightKg, birthYear } = PROFILE_LIMITS
  const thisYear = new Date().getFullYear()
  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Prénom"
        value={draft.firstName}
        onChange={(firstName) => {
          onChange({ firstName })
        }}
        autoComplete="given-name"
        autoCapitalize="words"
        maxLength={40}
        placeholder="Facultatif"
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Année de naissance"
          value={draft.birthYear}
          min={birthYear.min}
          max={thisYear}
          placeholder="1995"
          onChange={(value) => {
            onChange({ birthYear: value })
          }}
        />
        <SelectField
          label="Sexe"
          value={draft.sex ?? ''}
          options={SEX_OPTIONS}
          onChange={(value) => {
            onChange({ sex: value === '' ? null : value })
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Taille"
          suffix="cm"
          value={draft.heightCm}
          min={heightCm.min}
          max={heightCm.max}
          placeholder="175"
          onChange={(value) => {
            onChange({ heightCm: value })
          }}
        />
        <NumberField
          label="Poids"
          suffix={weightUnit}
          decimal
          value={shownWeight(draft.weightKg, weightUnit)}
          min={Math.round(kgToUnit(weightKg.min, weightUnit))}
          max={Math.round(kgToUnit(weightKg.max, weightUnit))}
          placeholder={weightUnit === 'kg' ? '70' : '155'}
          onChange={(value) => {
            onChange({ weightKg: value === null ? null : unitToKg(value, weightUnit) })
          }}
        />
      </div>
    </div>
  )
}

export function GoalFields({
  draft,
  onChange,
  titled = true,
}: ProfileFieldsProps & {
  /** Titre de la première section (inutile quand l'écran s'appelle déjà « Tes objectifs »). */
  titled?: boolean
}) {
  return (
    <>
      <Section title={titled ? 'Tes objectifs' : undefined}>
        <ChipGroup
          label="Tes objectifs"
          options={GOAL_FOCUS_ORDER.map((focus) => ({ value: focus, label: GOAL_FOCUS_LABEL[focus] }))}
          selected={draft.focuses}
          onChange={(focuses) => {
            onChange({ focuses })
          }}
        />
      </Section>
      <Section title="Figures visées">
        <ChipGroup
          label="Figures visées"
          options={SKILLS.map((skill) => ({ value: skill.id, label: skill.name }))}
          selected={draft.targetSkills}
          onChange={(targetSkills) => {
            onChange({ targetSkills })
          }}
        />
        <p className="mt-2 px-1 text-[13px] text-ink-3">
          Elles orientent ton programme et deviennent des objectifs avec leurs étapes.
        </p>
      </Section>
    </>
  )
}

export function PlanningFields({ draft, onChange }: ProfileFieldsProps) {
  const count = draft.trainingDays.length
  return (
    <>
      <Section title="Jours d’entraînement">
        <WeekdayPicker
          label="Jours d’entraînement"
          value={draft.trainingDays}
          marked={draft.climbingDays}
          onChange={(trainingDays) => {
            onChange({ trainingDays })
          }}
        />
        <p className="mt-2 px-1 text-[13px] text-ink-3" aria-live="polite">
          {count === 0
            ? 'Choisis les jours où tu veux t’entraîner.'
            : `${count} séance${count > 1 ? 's' : ''} par semaine`}
        </p>
      </Section>
      <Section title="Durée d’une séance">
        <Segmented
          label="Durée d’une séance"
          value={String(draft.sessionMinutes)}
          options={SESSION_LENGTHS.map((minutes) => ({ value: String(minutes), label: `${minutes} min` }))}
          onChange={(value) => {
            onChange({ sessionMinutes: Number(value) })
          }}
        />
      </Section>
      <Section title="Jours d’escalade">
        <WeekdayPicker
          label="Jours d’escalade"
          value={draft.climbingDays}
          marked={draft.trainingDays}
          onChange={(climbingDays) => {
            onChange({ climbingDays })
          }}
        />
        <p className="mt-2 px-1 text-[13px] text-ink-3">
          Facultatif. Ton programme en tient compte pour ménager tes bras et tes doigts.
        </p>
      </Section>
    </>
  )
}

export function ExperiencePicker({
  value,
  onChange,
}: {
  value: ExperienceLevel
  onChange: (value: ExperienceLevel) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Ton niveau"
      className="divide-y divide-line overflow-hidden rounded-2xl bg-surface"
    >
      {EXPERIENCE_ORDER.map((level) => {
        const selected = level === value
        return (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(level)
            }}
            className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-medium text-ink">{EXPERIENCE_LABEL[level]}</span>{' '}
              <span className="mt-0.5 block text-[13px] text-ink-3">{EXPERIENCE_DESCRIPTION[level]}</span>
            </span>
            <span
              aria-hidden
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                selected ? 'border-accent bg-accent text-accent-ink' : 'border-line',
              )}
            >
              {selected && <Check size={14} strokeWidth={3} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
