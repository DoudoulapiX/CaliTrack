import { Link } from 'react-router'
import { PROTEIN_PER_KG } from '@/content/nutrition/targets'
import { updateNutritionGoals, type NutritionGoalsPatch } from '@/db/nutrition'
import { userMessage } from '@/lib/errors'
import { frenchSpacing, NBSP } from '@/lib/typography'
import { formatNumber } from '@/lib/units'
import { Button } from '@/ui/Button'
import { ChoiceChips, Segmented } from '@/ui/Controls'
import { NumberField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import {
  ACTIVITY_HINT,
  ACTIVITY_OPTIONS,
  autoPlaceholder,
  calculationLines,
  missingLine,
  PHASE_HINT,
  PHASE_OPTIONS,
} from './nutrition-view'
import { useTargets } from './useNutrition'

/** Bornes des valeurs fixées à la main. */
const LIMITS = {
  kcal: { min: 800, max: 6000 },
  proteinG: { min: 0, max: 500 },
  carbsG: { min: 0, max: 1000 },
  fatG: { min: 0, max: 400 },
} as const

/** Objectifs caloriques : phase, activité, calcul détaillé et valeurs fixées à la main. */
export function TargetsPage() {
  const targets = useTargets()
  const toast = useToast()
  if (targets === undefined) return <PageSpinner />
  const { goals, result } = targets

  const save = (patch: NutritionGoalsPatch) => {
    updateNutritionGoals(patch).catch((e: unknown) => {
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    })
  }
  const auto = result.ok ? result.targets : null
  const lines = calculationLines(result, goals)
  const overridden =
    goals.kcal !== null || goals.proteinG !== null || goals.carbsG !== null || goals.fatG !== null
  // La valeur calculée, montrée dans un champ laissé vide.
  const placeholder = (key: 'proteinG' | 'carbsG' | 'fatG') =>
    autoPlaceholder(goals[key] === null && auto ? auto[key] : null)

  return (
    <Page title="Objectifs caloriques" back backTo="/nutrition" backLabel="Nutrition">
      <Section title="Objectif">
        <div className="rounded-2xl bg-surface p-4">
          <Segmented
            label="Objectif"
            value={goals.phase}
            onChange={(phase) => {
              save({ phase })
            }}
            options={PHASE_OPTIONS}
          />
          <p className="mt-3 px-1 text-[14px] text-ink-2">{PHASE_HINT[goals.phase]}</p>
        </div>
      </Section>
      <Section title="Activité physique">
        <div className="rounded-2xl bg-surface p-4">
          <ChoiceChips
            label="Activité physique"
            value={goals.activity}
            onChange={(activity) => {
              save({ activity })
            }}
            options={ACTIVITY_OPTIONS}
          />
          <p className="mt-3 px-1 text-[14px] text-ink-2">{ACTIVITY_HINT[goals.activity]}</p>
        </div>
      </Section>
      <Section title="Calcul">
        <div className="rounded-2xl bg-surface p-4 text-[15px] text-ink">
          {lines.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
          {result.missing.length > 0 && (
            <p>
              {missingLine(result.missing)}{' '}
              <Link to="/more/profile" className="font-medium text-accent-text">
                Compléter mon profil
              </Link>
            </p>
          )}
          <p className="mt-3 text-[13px] text-ink-3">
            {frenchSpacing(
              `Protéines : ${formatNumber(PROTEIN_PER_KG[goals.phase])}${NBSP}g par kilo de poids de corps. Lipides : 25 % des calories. Glucides : le reste.`,
            )}
          </p>
        </div>
      </Section>
      <Section title="Fixer moi-même">
        <div className="flex flex-col gap-4 rounded-2xl bg-surface p-4">
          <p className="px-1 text-[14px] text-ink-2">Laisse un champ vide pour garder la valeur calculée.</p>
          <NumberField
            label="Calories par jour"
            value={goals.kcal}
            min={LIMITS.kcal.min}
            max={LIMITS.kcal.max}
            suffix="kcal"
            inputClassName="pr-14"
            placeholder={autoPlaceholder(result.ok ? result.computedKcal : null)}
            onChange={(kcal) => {
              save({ kcal })
            }}
          />
          <div className="grid grid-cols-3 gap-3">
            <NumberField
              label="Protéines"
              value={goals.proteinG}
              min={LIMITS.proteinG.min}
              max={LIMITS.proteinG.max}
              suffix="g"
              placeholder={placeholder('proteinG')}
              onChange={(proteinG) => {
                save({ proteinG })
              }}
            />
            <NumberField
              label="Glucides"
              value={goals.carbsG}
              min={LIMITS.carbsG.min}
              max={LIMITS.carbsG.max}
              suffix="g"
              placeholder={placeholder('carbsG')}
              onChange={(carbsG) => {
                save({ carbsG })
              }}
            />
            <NumberField
              label="Lipides"
              value={goals.fatG}
              min={LIMITS.fatG.min}
              max={LIMITS.fatG.max}
              suffix="g"
              placeholder={placeholder('fatG')}
              onChange={(fatG) => {
                save({ fatG })
              }}
            />
          </div>
          {overridden && (
            <Button
              variant="secondary"
              onClick={() => {
                save({ kcal: null, proteinG: null, carbsG: null, fatG: null })
              }}
            >
              Revenir au calcul automatique
            </Button>
          )}
        </div>
      </Section>
    </Page>
  )
}
