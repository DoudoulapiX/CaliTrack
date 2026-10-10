import { useState } from 'react'
import { useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { db } from '@/db/db'
import { deleteEquipmentItem, newEquipmentItem, saveEquipmentItem } from '@/db/equipment'
import { equipmentKind } from '@/db/schema'
import type { EquipmentItem, EquipmentKind, Location } from '@/db/types'
import { EQUIPMENT_LABEL, presetFor } from '@/content/equipment'
import { frenchSpacing } from '@/lib/typography'
import type { WeightUnit } from '@/lib/units'
import { Button, ButtonLink } from '@/ui/Button'
import { ChipGroup, EmptyState } from '@/ui/Controls'
import { TextAreaField, TextField } from '@/ui/Field'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { BandLevelsEditor, WeightsEditor } from './EquipmentEditors'
import { defaultLocationIds, sortLocations } from './equipment-view'

interface EquipmentFormProps {
  initial: EquipmentItem
  isNew: boolean
  locations: readonly Location[]
  unit: WeightUnit
}

function EquipmentForm({ initial, isNew, locations, unit }: EquipmentFormProps) {
  const toast = useToast()
  const goBack = useGoBack('/more/equipment')
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const preset = presetFor(draft.kind)
  const dirty = isNew || JSON.stringify(draft) !== JSON.stringify(initial)

  const patch = (next: Partial<EquipmentItem>) => {
    setDraft((current) => ({ ...current, ...next }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await saveEquipmentItem(draft)
      toast(isNew ? 'Matériel ajouté' : 'Matériel enregistré')
      goBack()
    } catch {
      setSaving(false)
      toast('Enregistrement impossible', 'error')
    }
  }

  const remove = async () => {
    setSaving(true)
    try {
      await deleteEquipmentItem(draft.id)
      toast('Matériel supprimé')
      goBack()
    } catch {
      setSaving(false)
      toast('Suppression impossible', 'error')
    }
  }

  return (
    <Page
      title={isNew ? 'Nouveau matériel' : initial.name}
      back
      backTo="/more/equipment"
      backLabel={isNew ? 'Annuler' : 'Matériel'}
      noTabBar
      footer={
        <Button block size="lg" disabled={saving || !dirty} onClick={() => void save()}>
          {isNew ? 'Ajouter le matériel' : 'Enregistrer'}
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pt-2">
        <TextField
          label="Nom"
          value={draft.name}
          maxLength={60}
          autoCapitalize="sentences"
          placeholder={EQUIPMENT_LABEL[draft.kind]}
          hint={preset?.hint || undefined}
          onChange={(name) => {
            patch({ name })
          }}
        />

        {preset?.hasWeights && (
          <WeightsEditor
            weightsKg={draft.weightsKg}
            unit={unit}
            onChange={(weightsKg) => {
              patch({ weightsKg })
            }}
          />
        )}

        {(preset?.hasLevels === true || draft.bandLevels.length > 0) && (
          <BandLevelsEditor
            levels={draft.bandLevels}
            onChange={(bandLevels) => {
              patch({ bandLevels })
            }}
          />
        )}

        {locations.length > 0 && (
          <Section title={frenchSpacing('Où ?')}>
            <ChipGroup
              label="Lieux"
              options={locations.map((location) => ({ value: location.id, label: location.name }))}
              selected={draft.locationIds}
              onChange={(locationIds) => {
                patch({ locationIds })
              }}
            />
            <p className="mt-2 px-1 text-[13px] text-ink-3" aria-live="polite">
              {draft.locationIds.length === 0
                ? frenchSpacing('Aucun lieu coché : disponible partout.')
                : 'Disponible seulement dans les lieux cochés.'}
            </p>
          </Section>
        )}

        <TextAreaField
          label="Note"
          value={draft.note}
          maxLength={500}
          placeholder="Marque, réglages, état…"
          onChange={(note) => {
            patch({ note })
          }}
        />

        {!isNew && (
          <Button
            variant="danger"
            block
            disabled={saving}
            onClick={() => {
              setConfirming(true)
            }}
          >
            Supprimer ce matériel
          </Button>
        )}
      </div>
      <ConfirmSheet
        open={confirming}
        onClose={() => {
          setConfirming(false)
        }}
        onConfirm={() => void remove()}
        title={frenchSpacing('Supprimer ce matériel ?')}
        message="Il disparaît de ton inventaire. Tes séances passées ne changent pas."
        confirmLabel="Supprimer"
      />
    </Page>
  )
}

function Missing() {
  return (
    <Page title="Matériel" back backTo="/more/equipment" backLabel="Matériel" noTabBar>
      <EmptyState
        title="Ce matériel n’existe plus"
        text="Il a peut-être été supprimé."
        action={<ButtonLink to="/more/equipment">Voir mon matériel</ButtonLink>}
      />
    </Page>
  )
}

function NewEquipment({ kind, locations }: { kind: EquipmentKind; locations: readonly Location[] }) {
  const settings = useSettings()
  // Créé une seule fois : l'identifiant reste le même pendant la saisie.
  const [item] = useState(() =>
    newEquipmentItem(kind, defaultLocationIds(locations, settings.currentLocationId)),
  )
  return <EquipmentForm initial={item} isNew locations={locations} unit={settings.weightUnit} />
}

/** Fiche d'un objet de l'inventaire (/more/equipment/:id) ou ajout d'un objet (/more/equipment/new/:kind). */
export function EquipmentItemPage() {
  const { id, kind } = useParams()
  const settings = useSettings()
  const data = useLiveQuery(async () => {
    const locations = sortLocations(await db.locations.toArray())
    const item = id === undefined ? null : ((await db.equipment.get(id)) ?? null)
    return { locations, item }
  }, [id])

  if (!data) return <PageSpinner />
  if (kind !== undefined) {
    const parsed = equipmentKind.safeParse(kind)
    if (!parsed.success) return <Missing />
    return <NewEquipment key={parsed.data} kind={parsed.data} locations={data.locations} />
  }
  if (!data.item) return <Missing />
  return (
    <EquipmentForm
      key={data.item.id}
      initial={data.item}
      isNew={false}
      locations={data.locations}
      unit={settings.weightUnit}
    />
  )
}
