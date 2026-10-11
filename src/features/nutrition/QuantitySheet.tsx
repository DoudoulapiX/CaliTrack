import { useState } from 'react'
import type { FoodItem } from '@/content/nutrition/foods'
import { addEntries, entryFromFood } from '@/db/nutrition'
import type { MealKey } from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { MealPicker } from './MealPicker'
import { mealTo, nutrientsFor, per100Line } from './nutrition-view'
import { QuantityPicker } from './QuantityPicker'

export interface QuantitySheetProps {
  item: FoodItem
  day: ISODate
  meal: MealKey
  onClose: () => void
  /** Après l'ajout, avec le repas choisi. */
  onAdded: (meal: MealKey) => void
}

/** Choisir la quantité mangée d'un aliment (et le repas), voir ce qu'elle apporte, puis l'ajouter. */
export function QuantitySheet({ item, day, meal: initialMeal, onClose, onAdded }: QuantitySheetProps) {
  const [grams, setGrams] = useState<number | null>(item.portionG ?? 100)
  const [meal, setMeal] = useState(initialMeal)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nutrients = nutrientsFor(item, grams)

  const add = async () => {
    if (grams === null || grams <= 0) {
      setError('Indique la quantité mangée.')
      return
    }
    setBusy(true)
    try {
      await addEntries([entryFromFood(item, grams, day, meal)])
      onAdded(meal)
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void add()}>
            Ajouter {mealTo(meal)}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <p className="text-[14px] text-ink-3">
          {item.detail ? `${item.detail} · ` : ''}
          {per100Line(item.per100)}
        </p>
        <QuantityPicker
          grams={grams}
          portionG={item.portionG}
          nutrients={nutrients}
          onChange={(next) => {
            setGrams(next)
            setError(null)
          }}
        />
        <MealPicker value={meal} onChange={setMeal} />
      </form>
    </Sheet>
  )
}
