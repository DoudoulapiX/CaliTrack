import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Backpack, Plus } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { db } from '@/db/db'
import { updateSettings } from '@/db/settings'
import type { Location } from '@/db/types'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { SelectField } from '@/ui/Field'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { AddEquipmentSheet } from './AddEquipmentSheet'
import { LocationSheet } from './LocationSheet'
import {
  LOCATION_ICON_COMPONENT,
  equipmentAt,
  equipmentSummary,
  sortEquipment,
  sortLocations,
} from './equipment-view'

const EVERYWHERE = 'everywhere'

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={label}
      icon={<Plus size={16} aria-hidden />}
      onClick={onClick}
    >
      Ajouter
    </Button>
  )
}

/** Inventaire du matériel, rangé par lieu (maison, salle, parc…). */
export function EquipmentPage() {
  const settings = useSettings()
  const navigate = useNavigate()
  const data = useLiveQuery(async () => {
    const locations = await db.locations.toArray()
    const items = await db.equipment.toArray()
    return { locations: sortLocations(locations), items: sortEquipment(items) }
  }, [])
  // Lieu ouvert dans la feuille : 'new' pour en ajouter un.
  const [editing, setEditing] = useState<Location | 'new' | null>(null)
  const [adding, setAdding] = useState(false)

  if (!data) return <PageSpinner />
  const { locations, items } = data
  const current = locations.some((l) => l.id === settings.currentLocationId)
    ? (settings.currentLocationId ?? EVERYWHERE)
    : EVERYWHERE

  return (
    <Page title="Matériel et lieux" back backTo="/more" backLabel="Plus" className="pt-2">
      {locations.length > 0 && (
        <Section>
          <SelectField
            label="Je m’entraîne"
            value={current}
            options={[
              { value: EVERYWHERE, label: 'Partout (tout mon matériel)' },
              ...locations.map((location) => ({ value: location.id, label: location.name })),
            ]}
            hint={frenchSpacing('Le filtre « Mon matériel » des exercices suit ce choix.')}
            onChange={(value) => {
              void updateSettings({ currentLocationId: value === EVERYWHERE ? null : value })
            }}
          />
        </Section>
      )}

      <Section
        title="Lieux"
        action={
          <AddButton
            label="Ajouter un lieu"
            onClick={() => {
              setEditing('new')
            }}
          />
        }
      >
        {locations.length === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-3 text-[14px] text-ink-3">
            Ajoute tes lieux (maison, salle, parc…) pour savoir ce que tu as sous la main à chaque séance.
          </p>
        ) : (
          <ListGroup>
            {locations.map((location) => {
              const Icon = LOCATION_ICON_COMPONENT[location.icon]
              const count = equipmentAt(items, location.id).length
              return (
                <ListRow
                  key={location.id}
                  title={location.name}
                  subtitle={count === 0 ? 'Aucun matériel' : `${count} objet${count > 1 ? 's' : ''}`}
                  leading={<Icon size={22} aria-hidden />}
                  onClick={() => {
                    setEditing(location)
                  }}
                />
              )
            })}
          </ListGroup>
        )}
      </Section>

      <Section
        title="Matériel"
        action={
          items.length > 0 && (
            <AddButton
              label="Ajouter du matériel"
              onClick={() => {
                setAdding(true)
              }}
            />
          )
        }
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Backpack size={36} aria-hidden />}
            title="Aucun matériel"
            text="Sans matériel, CaliTrack te propose des exercices au poids du corps."
            action={
              <Button
                icon={<Plus size={18} aria-hidden />}
                onClick={() => {
                  setAdding(true)
                }}
              >
                Ajouter du matériel
              </Button>
            }
          />
        ) : (
          <ListGroup>
            {items.map((item) => (
              <ListRow
                key={item.id}
                title={item.name}
                subtitle={equipmentSummary(item, locations, settings.weightUnit) || undefined}
                to={`/more/equipment/${item.id}`}
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <AddEquipmentSheet
        open={adding}
        owned={new Set(items.map((item) => item.kind))}
        onClose={() => {
          setAdding(false)
        }}
        onPick={(kind) => {
          setAdding(false)
          void navigate(`/more/equipment/new/${kind}`)
        }}
      />
      {editing !== null && (
        <LocationSheet
          key={editing === 'new' ? 'new' : editing.id}
          location={editing === 'new' ? null : editing}
          locations={locations}
          items={items}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
    </Page>
  )
}
