import { useState } from 'react'
import type { EquipmentItem, EquipmentKind, Location, LocationIcon } from '@/db/types'
import { deleteLocation, newLocation, saveLocationWithEquipment } from '@/db/equipment'
import { EQUIPMENT_LABEL, LOCATION_PRESETS } from '@/content/equipment'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChipGroup, ChoiceChips } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import {
  LOCATION_ICON_COMPONENT,
  LOCATION_ICON_ORDER,
  defaultLocationName,
  locationTypeLabel,
  nextLocationIcon,
} from './equipment-view'
import { userMessage } from '@/lib/errors'

export interface LocationSheetProps {
  /** Lieu à modifier, ou null pour en ajouter un. */
  location: Location | null
  locations: readonly Location[]
  items: readonly EquipmentItem[]
  onClose: () => void
}

/** Ajout ou modification d'un lieu, avec le matériel qui s'y trouve. Montée à l'ouverture. */
export function LocationSheet({ location, locations, items, onClose }: LocationSheetProps) {
  const toast = useToast()
  const isNew = location === null
  const [draft, setDraft] = useState<Location>(() => {
    if (location) return location
    const icon = nextLocationIcon(locations)
    return newLocation(icon, defaultLocationName(icon))
  })
  // Le matériel déjà rangé ailleurs se coche ici ; celui disponible partout n'a pas besoin de lieu.
  const placed = items.filter((item) => item.locationIds.length > 0)
  const onlyHere = isNew
    ? []
    : placed.filter((item) => item.locationIds.length === 1 && item.locationIds[0] === draft.id)
  const toggleable = placed.filter((item) => !onlyHere.includes(item))
  const everywhere = items.filter((item) => item.locationIds.length === 0)
  const [chosen, setChosen] = useState<string[]>(() =>
    placed.filter((item) => item.locationIds.includes(draft.id)).map((item) => item.id),
  )
  // Matériel courant de ce type de lieu qui manque à l'inventaire, coché d'office pour un nouveau lieu.
  const owned = new Set(items.map((item) => item.kind))
  const presetOf = (icon: LocationIcon) => LOCATION_PRESETS.find((preset) => preset.icon === icon)
  const missing = (kinds: readonly EquipmentKind[]) => kinds.filter((kind) => !owned.has(kind))
  const suggestions = missing(presetOf(draft.icon)?.suggestions ?? [])
  const [added, setAdded] = useState<EquipmentKind[]>(() =>
    isNew ? missing(presetOf(draft.icon)?.preselected ?? []) : [],
  )
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const setIcon = (icon: LocationIcon) => {
    // Le nom suit le type tant qu'il n'a pas été personnalisé.
    const keepName = draft.name.trim() !== '' && draft.name !== defaultLocationName(draft.icon)
    setDraft({ ...draft, icon, name: keepName ? draft.name : defaultLocationName(icon) })
    if (isNew) setAdded(missing(presetOf(icon)?.preselected ?? []))
  }

  const save = async () => {
    setBusy(true)
    try {
      await saveLocationWithEquipment(
        draft,
        chosen,
        added.filter((kind) => suggestions.includes(kind)),
      )
      toast(isNew ? 'Lieu ajouté' : 'Lieu enregistré')
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await deleteLocation(draft.id)
      toast('Lieu supprimé')
      onClose()
    } catch {
      setBusy(false)
      toast('Suppression impossible', 'error')
    }
  }

  if (confirming) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={frenchSpacing(`Supprimer « ${draft.name} » ?`)}
        footer={
          <div className="flex flex-col gap-2">
            <Button variant="danger" block size="lg" disabled={busy} onClick={() => void remove()}>
              Supprimer le lieu
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
        <p className="text-[15px] text-ink-2">
          Ton matériel reste dans ton inventaire. Celui qui n’était rangé qu’ici devient disponible partout.
        </p>
      </Sheet>
    )
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={isNew ? 'Nouveau lieu' : 'Modifier le lieu'}
      footer={
        <Button block size="lg" disabled={busy} onClick={() => void save()}>
          {isNew ? 'Ajouter le lieu' : 'Enregistrer'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <span className="px-1 text-[13px] font-medium text-ink-2">Type</span>
          <ChoiceChips
            label="Type de lieu"
            value={draft.icon}
            options={LOCATION_ICON_ORDER.map((icon) => {
              const Icon = LOCATION_ICON_COMPONENT[icon]
              return { value: icon, label: locationTypeLabel(icon), icon: <Icon size={15} aria-hidden /> }
            })}
            onChange={setIcon}
          />
        </div>
        <TextField
          label="Nom"
          value={draft.name}
          maxLength={40}
          autoCapitalize="sentences"
          placeholder="Chez mes parents, bureau…"
          error={error}
          onChange={(name) => {
            setDraft({ ...draft, name })
            setError(null)
          }}
        />
        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[13px] font-medium text-ink-2">Matériel présent ici</span>
            {toggleable.length > 0 && (
              <ChipGroup
                label="Matériel présent ici"
                options={toggleable.map((item) => ({ value: item.id, label: item.name }))}
                selected={chosen}
                onChange={setChosen}
              />
            )}
            {onlyHere.length > 0 && (
              <p className="px-1 text-[13px] text-ink-3">
                {frenchSpacing(`Rangé seulement ici : ${onlyHere.map((item) => item.name).join(', ')}.`)}
              </p>
            )}
            {everywhere.length > 0 && (
              <p className="px-1 text-[13px] text-ink-3">
                {frenchSpacing(`Disponible partout : ${everywhere.map((item) => item.name).join(', ')}.`)}
              </p>
            )}
          </div>
        )}
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[13px] font-medium text-ink-2">
              {items.length > 0 ? 'Autre matériel sur place' : 'Matériel sur place'}
            </span>
            <ChipGroup
              label={items.length > 0 ? 'Autre matériel sur place' : 'Matériel sur place'}
              options={suggestions.map((kind) => ({ value: kind, label: EQUIPMENT_LABEL[kind] }))}
              selected={added}
              onChange={setAdded}
            />
            <p className="px-1 text-[13px] text-ink-3">Ce que tu coches rejoint ton inventaire, rangé ici.</p>
          </div>
        )}
        {!isNew && (
          <Button
            variant="danger"
            block
            onClick={() => {
              setConfirming(true)
            }}
          >
            Supprimer ce lieu
          </Button>
        )}
      </div>
    </Sheet>
  )
}
