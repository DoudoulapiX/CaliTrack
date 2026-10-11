import { MEAL_LABEL, MEAL_ORDER } from '@/content/nutrition/meals'
import type { MealKey } from '@/db/types'
import { ChoiceChips } from '@/ui/Controls'

/** Le repas où ranger un aliment. */
export function MealPicker({ value, onChange }: { value: MealKey; onChange: (meal: MealKey) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[13px] font-medium text-ink-2" aria-hidden>
        Repas
      </p>
      <ChoiceChips
        label="Repas"
        value={value}
        onChange={onChange}
        options={MEAL_ORDER.map((key) => ({ value: key, label: MEAL_LABEL[key] }))}
      />
    </div>
  )
}
