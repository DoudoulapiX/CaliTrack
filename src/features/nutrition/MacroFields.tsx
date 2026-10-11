import { frenchSpacing } from '@/lib/typography'
import { NumberField } from '@/ui/Field'
import type { MacroDraft } from './nutrition-view'

/** Calories, protéines, glucides et lipides tapés à la main (saisie rapide, aliment perso). */
export function MacroFields({
  value,
  onChange,
}: {
  value: MacroDraft
  onChange: (value: MacroDraft) => void
}) {
  const field = (key: keyof MacroDraft) => (next: number | null) => {
    onChange({ ...value, [key]: next })
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      <NumberField
        label="Calories"
        value={value.kcal}
        min={0}
        max={9000}
        suffix="kcal"
        inputClassName="pr-14"
        hint={frenchSpacing('Vide : calculées d’après les macronutriments')}
        onChange={field('kcal')}
        className="col-span-3"
      />
      <NumberField
        label="Protéines"
        value={value.protein}
        decimal
        min={0}
        max={1000}
        suffix="g"
        onChange={field('protein')}
      />
      <NumberField
        label="Glucides"
        value={value.carbs}
        decimal
        min={0}
        max={1000}
        suffix="g"
        onChange={field('carbs')}
      />
      <NumberField
        label="Lipides"
        value={value.fat}
        decimal
        min={0}
        max={1000}
        suffix="g"
        onChange={field('fat')}
      />
    </div>
  )
}
