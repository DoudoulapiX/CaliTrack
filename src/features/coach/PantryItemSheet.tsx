import { useState } from 'react'
import { PANTRY_NAME_MAX, PANTRY_QUANTITY_MAX, PLACE_LABEL, PLACE_ORDER } from '@/content/coach/kitchen'
import { addPantryItem, deletePantryItem, updatePantryItem } from '@/db/coach'
import type { PantryItem, PantryPlace } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { Segmented } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'

/** Le choix du rangement : frigo, congélateur ou placards. */
export function PlacePicker({
  value,
  onChange,
}: {
  value: PantryPlace
  onChange: (place: PantryPlace) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="px-1 text-[13px] font-medium text-ink-2" aria-hidden>
        {frenchSpacing('Où ?')}
      </p>
      <Segmented
        label="Où ?"
        value={value}
        onChange={onChange}
        options={PLACE_ORDER.map((place) => ({ value: place, label: PLACE_LABEL[place] }))}
      />
    </div>
  )
}

/**
 * Ajouter un aliment au frigo, au congélateur ou aux placards (`item` null), ou le modifier, ou le
 * supprimer après confirmation. Montée à l'ouverture.
 */
export function PantryItemSheet({ item, onClose }: { item: PantryItem | null; onClose: () => void }) {
  const toast = useToast()
  const [name, setName] = useState(item?.name ?? '')
  const [quantity, setQuantity] = useState(item?.quantity ?? '')
  const [place, setPlace] = useState<PantryPlace>(item?.place ?? 'fridge')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    if (name.trim() === '') {
      setError('Donne un nom à cet aliment.')
      return
    }
    setBusy(true)
    try {
      if (item) await updatePantryItem(item.id, { name, quantity, place })
      else await addPantryItem({ name, quantity, place })
      toast(item ? 'Aliment enregistré' : 'Aliment ajouté')
      onClose()
    } catch (e) {
      setBusy(false)
      toast(userMessage(e, 'Enregistrement impossible, réessaie.'), 'error')
    }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try {
      await deletePantryItem(id)
      toast('Aliment supprimé')
      onClose()
    } catch (e) {
      setBusy(false)
      toast(userMessage(e, 'Suppression impossible, réessaie.'), 'error')
    }
  }

  if (item && confirming) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={frenchSpacing(`Supprimer « ${item.name} » ?`)}
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="danger" block size="lg" disabled={busy} onClick={() => void remove(item.id)}>
              Supprimer
            </Button>
            <Button
              variant="secondary"
              block
              size="lg"
              onClick={() => {
                setConfirming(false)
              }}
            >
              Annuler
            </Button>
          </div>
        }
      >
        <p className="text-[15px] text-ink-2">Il disparaît de ta liste. Le coach n’en tiendra plus compte.</p>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={item ? 'Modifier l’aliment' : 'Ajouter un aliment'}
      footer={
        <div className="flex flex-col gap-2">
          <Button block size="lg" disabled={busy} onClick={() => void save()}>
            {item ? 'Enregistrer' : 'Ajouter'}
          </Button>
          {item && (
            <Button
              block
              size="lg"
              variant="danger"
              disabled={busy}
              onClick={() => {
                setConfirming(true)
              }}
            >
              Supprimer
            </Button>
          )}
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
        <TextField
          label="Nom"
          value={name}
          maxLength={PANTRY_NAME_MAX}
          autoCapitalize="sentences"
          placeholder="Ex. Œufs"
          error={error}
          onChange={(value) => {
            setName(value)
            setError(null)
          }}
        />
        <TextField
          label="Quantité (facultatif)"
          value={quantity}
          maxLength={PANTRY_QUANTITY_MAX}
          placeholder="Ex. 6, 1 L, un demi-paquet"
          onChange={setQuantity}
        />
        <PlacePicker value={place} onChange={setPlace} />
      </form>
    </Sheet>
  )
}
