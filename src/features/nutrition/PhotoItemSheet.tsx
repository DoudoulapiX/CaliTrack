import { useRef, useState } from 'react'
import type { EstimatedItem } from '@/content/ai/meal-photo'
import { Button } from '@/ui/Button'
import { NumberField, TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { MacroFields } from './MacroFields'
import { macrosOf, type MacroDraft } from './nutrition-view'
import { rescaleItem, type PhotoItem } from './photo-view'
import { FOOD_NAME_MAX } from './QuickSheet'

/** Portion maximale d'un aliment reconnu, en grammes. */
const MAX_ITEM_GRAMS = 3000

function draftOf(item: EstimatedItem): MacroDraft {
  const { kcal, protein, carbs, fat } = item.nutrients
  return { kcal, protein, carbs, fat }
}

/**
 * Corriger un aliment reconnu sur la photo. Changer la quantité recalcule les valeurs dans la même
 * proportion ; des valeurs tapées à la main servent ensuite de base.
 */
export function PhotoItemSheet({
  item,
  onClose,
  onSave,
  onRemove,
}: {
  item: PhotoItem
  onClose: () => void
  onSave: (item: PhotoItem) => void
  onRemove: () => void
}) {
  const [name, setName] = useState(item.name)
  const [grams, setGrams] = useState<number | null>(item.grams)
  const [macros, setMacros] = useState<MacroDraft>(() => draftOf(item))
  const [error, setError] = useState<string | null>(null)
  // La base des proportions : l'estimation, puis les dernières valeurs tapées.
  const base = useRef<EstimatedItem>(item)

  const changeGrams = (next: number | null) => {
    setGrams(next)
    setError(null)
    if (next !== null && next > 0) setMacros(draftOf(rescaleItem(base.current, next)))
  }

  const changeMacros = (next: MacroDraft) => {
    setMacros(next)
    setError(null)
    const nutrients = macrosOf(next)
    if (nutrients && grams !== null && grams > 0) base.current = { name, grams, nutrients }
  }

  const save = () => {
    const trimmed = name.trim()
    const nutrients = macrosOf(macros)
    if (trimmed === '') setError('Donne un nom à cet aliment.')
    else if (grams === null || grams <= 0) setError('Indique la quantité en grammes.')
    else if (nutrients === null) setError('Indique les calories.')
    else onSave({ ...item, name: trimmed, grams, nutrients })
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Corriger l’aliment"
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" onClick={save}>
            Enregistrer
          </Button>
          <Button block variant="ghost" onClick={onRemove}>
            Retirer de ce repas
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <TextField
          label="Nom"
          value={name}
          maxLength={FOOD_NAME_MAX}
          autoCapitalize="sentences"
          onChange={(value) => {
            setName(value)
            setError(null)
          }}
        />
        <NumberField
          label="Quantité"
          value={grams}
          decimal
          min={1}
          max={MAX_ITEM_GRAMS}
          suffix="g"
          onChange={changeGrams}
        />
        <MacroFields value={macros} onChange={changeMacros} />
      </form>
    </Sheet>
  )
}
