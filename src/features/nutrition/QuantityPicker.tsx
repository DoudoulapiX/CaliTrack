import type { Nutrients } from '@/db/types'
import { MAX_GRAMS } from '@/db/nutrition'
import { cn } from '@/lib/cn'
import { NumberField } from '@/ui/Field'
import { NutrientTiles } from './NutrientTiles'
import { quantityOptions } from './nutrition-view'

/**
 * La quantité mangée : un champ, des quantités courantes en un geste (portion habituelle, 100 g…) et
 * ce que la quantité apporte.
 */
export function QuantityPicker({
  grams,
  onChange,
  portionG,
  nutrients,
}: {
  grams: number | null
  onChange: (grams: number | null) => void
  portionG: number | null
  /** Ce qu'apporte la quantité (null : quantité vide). */
  nutrients: Nutrients | null
}) {
  return (
    <>
      <NumberField
        label="Quantité"
        value={grams}
        decimal
        min={1}
        max={MAX_GRAMS}
        suffix="g"
        onChange={onChange}
      />
      <div className="-mt-1 flex flex-wrap gap-2" role="group" aria-label="Quantités courantes">
        {quantityOptions(portionG).map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={grams === option.grams}
            onClick={() => {
              onChange(option.grams)
            }}
            className={cn(
              'min-h-9 rounded-full px-3.5 text-[14px] font-medium transition-colors',
              grams === option.grams
                ? 'bg-accent text-accent-ink'
                : 'bg-surface-2 text-ink-2 active:bg-surface-3',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="rounded-xl bg-surface-2 px-2 py-3">
        {nutrients ? (
          <NutrientTiles nutrients={nutrients} />
        ) : (
          <p className="px-1.5 text-[14px] text-ink-3">Indique une quantité pour voir ce qu’elle apporte.</p>
        )}
      </div>
    </>
  )
}
