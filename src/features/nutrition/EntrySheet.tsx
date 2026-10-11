import { useState } from 'react'
import { scaleNutrients } from '@/content/nutrition/nutrients'
import { deleteEntries, updateEntry, type EntryPatch } from '@/db/nutrition'
import type { FoodEntry, Nutrients } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { Button } from '@/ui/Button'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { MacroFields } from './MacroFields'
import { MealPicker } from './MealPicker'
import { macrosOf, type MacroDraft } from './nutrition-view'
import { QuantityPicker } from './QuantityPicker'

const SOURCE_LABEL: Record<FoodEntry['source'], string> = {
  ciqual: 'Table Ciqual',
  off: 'Open Food Facts',
  custom: 'Mes aliments',
  ai: 'Estimé par l’IA sur une photo',
  quick: 'Saisie rapide',
}

/** Modifier un aliment noté : quantité (ou valeurs d'une saisie rapide), repas ; ou le retirer. */
export function EntrySheet({ entry, onClose }: { entry: FoodEntry; onClose: () => void }) {
  const toast = useToast()
  const [grams, setGrams] = useState<number | null>(entry.grams)
  const [macros, setMacros] = useState<MacroDraft>({
    kcal: entry.nutrients.kcal,
    protein: entry.nutrients.protein,
    carbs: entry.nutrients.carbs,
    fat: entry.nutrients.fat,
  })
  const [meal, setMeal] = useState(entry.meal)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const byWeight = entry.per100 !== null
  const preview: Nutrients | null =
    entry.per100 !== null ? (grams !== null && grams > 0 ? scaleNutrients(entry.per100, grams) : null) : null

  const save = async () => {
    const patch: EntryPatch = { meal }
    if (byWeight) {
      if (grams === null || grams <= 0) {
        setError('Indique la quantité mangée.')
        return
      }
      patch.grams = grams
    } else {
      const nutrients = macrosOf(macros, entry.nutrients)
      if (nutrients === null) {
        setError('Indique les calories.')
        return
      }
      patch.nutrients = nutrients
    }
    setBusy(true)
    try {
      await updateEntry(entry.id, patch)
      toast('Modifié')
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteEntries([entry.id])
      toast('Retiré du journal')
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Suppression impossible, réessaie.'))
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry.name}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void save()}>
            Enregistrer
          </Button>
          <Button block size="lg" variant="danger" disabled={busy} onClick={() => void remove()}>
            Retirer du journal
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <p className="text-[14px] text-ink-3">{SOURCE_LABEL[entry.source]}</p>
        {byWeight ? (
          <QuantityPicker
            grams={grams}
            portionG={null}
            nutrients={preview}
            onChange={(next) => {
              setGrams(next)
              setError(null)
            }}
          />
        ) : (
          <MacroFields
            value={macros}
            onChange={(next) => {
              setMacros(next)
              setError(null)
            }}
          />
        )}
        <MealPicker value={meal} onChange={setMeal} />
      </form>
    </Sheet>
  )
}
