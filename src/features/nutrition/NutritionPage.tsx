import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight, Copy, Gauge, Plus, Salad } from 'lucide-react'
import { MEAL_LABEL, MEAL_ORDER } from '@/content/nutrition/meals'
import { copyEntries } from '@/db/nutrition'
import type { FoodEntry, MealKey } from '@/db/types'
import { addDaysISO, today as todayISO, type ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { Button, ButtonLink, IconButton } from '@/ui/Button'
import { Card } from '@/ui/Card'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { useToast } from '@/ui/toast-context'
import { dayLabel } from '@/features/goals/goal-view'
import { DaySummary } from './DaySummary'
import { EntrySheet } from './EntrySheet'
import {
  addFoodPath,
  dayFromParam,
  entriesByMeal,
  entryLine,
  formatKcal,
  goalsSummary,
  mealTo,
  totalOf,
} from './nutrition-view'
import { useDayEntries, useTargets } from './useNutrition'

/** Changer de jour : la veille, le lendemain (jusqu'à aujourd'hui). */
function DayNav({ day, today }: { day: ISODate; today: ISODate }) {
  const [, setParams] = useSearchParams()
  const go = (next: ISODate) => {
    setParams(next === today ? {} : { day: next })
  }
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <IconButton
        label="Jour précédent"
        variant="filled"
        size="sm"
        onClick={() => {
          go(addDaysISO(day, -1))
        }}
      >
        <ChevronLeft size={20} aria-hidden />
      </IconButton>
      <p aria-live="polite" className="text-[16px] font-semibold text-ink">
        {dayLabel(day, today)}
      </p>
      <IconButton
        label="Jour suivant"
        variant="filled"
        size="sm"
        disabled={day >= today}
        onClick={() => {
          go(addDaysISO(day, 1))
        }}
      >
        <ChevronRight size={20} aria-hidden />
      </IconButton>
    </div>
  )
}

/** Un repas : ses aliments, son total, de quoi ajouter un aliment ou reprendre le même repas que la veille. */
function MealSection({
  meal,
  day,
  entries,
  yesterday,
  onOpen,
}: {
  meal: MealKey
  day: ISODate
  entries: FoodEntry[]
  yesterday: FoodEntry[]
  onOpen: (entry: FoodEntry) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const total = totalOf(entries)
  const copyYesterday = async () => {
    setBusy(true)
    try {
      await copyEntries(yesterday, day, meal)
      toast(`${MEAL_LABEL[meal]} de la veille repris`)
    } catch (e) {
      toast(userMessage(e, 'Copie impossible, réessaie.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title={MEAL_LABEL[meal]}
      action={
        entries.length > 0 ? (
          <span className="text-[13px] font-semibold text-ink-2 tabular">{formatKcal(total.kcal)}</span>
        ) : undefined
      }
    >
      <div className="overflow-hidden rounded-2xl bg-surface">
        {entries.length > 0 && (
          <ul className="divide-y divide-line border-b border-line" aria-label={MEAL_LABEL[meal]}>
            {entries.map((entry) => (
              <ListRow
                key={entry.id}
                title={entry.name}
                subtitle={entryLine(entry)}
                onClick={() => {
                  onOpen(entry)
                }}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 p-2">
          <ButtonLink
            to={addFoodPath(day, meal)}
            variant="ghost"
            size="sm"
            icon={<Plus size={18} aria-hidden />}
            aria-label={`Ajouter ${mealTo(meal)}`}
          >
            Ajouter
          </ButtonLink>
          {entries.length === 0 && yesterday.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              icon={<Copy size={16} aria-hidden />}
              onClick={() => void copyYesterday()}
            >
              Comme la veille
            </Button>
          )}
        </div>
      </div>
    </Section>
  )
}

/** Onglet Nutrition : le journal des repas d'un jour, face aux objectifs. */
export function NutritionPage() {
  const [params] = useSearchParams()
  const today = todayISO()
  const day = dayFromParam(params.get('day'), today)
  const entries = useDayEntries(day)
  const previous = useDayEntries(addDaysISO(day, -1))
  const targets = useTargets()
  const [open, setOpen] = useState<FoodEntry | null>(null)
  if (entries === undefined || previous === undefined || targets === undefined) return <PageSpinner />

  const byMeal = entriesByMeal(entries)
  const yesterdayByMeal = entriesByMeal(previous)
  const kcalTarget = targets.result.ok ? targets.result.targets.kcal : null

  return (
    <Page title="Nutrition">
      <DayNav day={day} today={today} />
      <Card className="mb-6">
        <DaySummary eaten={totalOf(entries)} targets={targets.result} />
      </Card>
      {MEAL_ORDER.map((meal) => (
        <MealSection
          key={meal}
          meal={meal}
          day={day}
          entries={byMeal[meal]}
          yesterday={yesterdayByMeal[meal]}
          onOpen={setOpen}
        />
      ))}
      <Section title="Réglages">
        <ListGroup>
          <ListRow
            title="Objectifs caloriques"
            subtitle={goalsSummary(targets.goals.phase, kcalTarget)}
            to="/nutrition/targets"
            leading={<Gauge size={22} aria-hidden />}
          />
          <ListRow
            title="Mes aliments"
            subtitle="Aliments créés et produits scannés"
            to="/nutrition/foods"
            leading={<Salad size={22} aria-hidden />}
          />
        </ListGroup>
      </Section>
      {open && (
        <EntrySheet
          entry={open}
          onClose={() => {
            setOpen(null)
          }}
        />
      )}
    </Page>
  )
}
