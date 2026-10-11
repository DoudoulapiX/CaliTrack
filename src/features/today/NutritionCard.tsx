import { Plus } from 'lucide-react'
import { mealAt } from '@/content/nutrition/meals'
import type { ISODate } from '@/lib/dates'
import { ButtonLink } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { Section } from '@/ui/Page'
import { DaySummary } from '@/features/nutrition/DaySummary'
import { addFoodPath, totalOf } from '@/features/nutrition/nutrition-view'
import { useDayEntries, useTargets } from '@/features/nutrition/useNutrition'
import { SectionLink } from './SectionLink'

/** Les calories du jour face à l'objectif, et de quoi noter le repas en cours. */
export function NutritionCard({ day }: { day: ISODate }) {
  const entries = useDayEntries(day)
  const targets = useTargets()
  if (entries === undefined || targets === undefined) return null
  return (
    <Section
      title="Calories du jour"
      action={
        <SectionLink to="/nutrition" label="Voir le journal des repas">
          Journal
        </SectionLink>
      }
    >
      <Card>
        <DaySummary eaten={totalOf(entries)} targets={targets.result} />
        <ButtonLink
          to={addFoodPath(day, mealAt(new Date()))}
          block
          variant="secondary"
          className="mt-4"
          icon={<Plus size={18} aria-hidden />}
        >
          Noter un repas
        </ButtonLink>
      </Card>
    </Section>
  )
}
