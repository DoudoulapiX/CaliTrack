import type { Nutrients } from '@/db/types'
import { nutrientTiles } from './nutrition-view'

/** Calories, protéines, glucides et lipides côte à côte. */
export function NutrientTiles({
  nutrients,
}: {
  nutrients: Pick<Nutrients, 'kcal' | 'protein' | 'carbs' | 'fat'>
}) {
  return (
    <dl className="grid grid-cols-4 gap-1 text-center">
      {nutrientTiles(nutrients).map((tile) => (
        <div key={tile.label} className="flex flex-col-reverse">
          <dt className="text-[12px] text-ink-3">{tile.label}</dt>
          <dd className="text-[15px] font-semibold text-ink tabular">{tile.value}</dd>
        </div>
      ))}
    </dl>
  )
}
