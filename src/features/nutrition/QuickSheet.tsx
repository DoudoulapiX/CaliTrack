import { useState } from 'react'
import { addEntries, quickEntry } from '@/db/nutrition'
import type { MealKey } from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { MacroFields } from './MacroFields'
import { MealPicker } from './MealPicker'
import { EMPTY_MACROS, macrosOf, mealTo, type MacroDraft } from './nutrition-view'

/** Longueur maximale d'un nom d'aliment. */
export const FOOD_NAME_MAX = 120

/** Noter des calories sans chercher d'aliment (repas au restaurant, plat d'un ami…). */
export function QuickSheet({
  day,
  meal: initialMeal,
  onClose,
  onAdded,
}: {
  day: ISODate
  meal: MealKey
  onClose: () => void
  onAdded: (meal: MealKey) => void
}) {
  const [name, setName] = useState('')
  const [macros, setMacros] = useState<MacroDraft>(EMPTY_MACROS)
  const [meal, setMeal] = useState(initialMeal)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const nutrients = macrosOf(macros)
    if (nutrients === null) {
      setError('Indique les calories.')
      return
    }
    setBusy(true)
    try {
      await addEntries([quickEntry(name.trim() || 'Saisie rapide', nutrients, day, meal)])
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
      title="Saisie rapide"
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
        <TextField
          label="Nom"
          value={name}
          maxLength={FOOD_NAME_MAX}
          placeholder="Ex. Burger au resto"
          autoCapitalize="sentences"
          enterKeyHint="next"
          onChange={setName}
        />
        <MacroFields
          value={macros}
          onChange={(next) => {
            setMacros(next)
            setError(null)
          }}
        />
        <MealPicker value={meal} onChange={setMeal} />
      </form>
    </Sheet>
  )
}
