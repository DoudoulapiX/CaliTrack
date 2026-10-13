import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, ChefHat, Plus, Refrigerator } from 'lucide-react'
import { PLACE_LABEL } from '@/content/coach/kitchen'
import { db } from '@/db/db'
import type { PantryItem } from '@/db/types'
import { Button, ButtonLink } from '@/ui/Button'
import { EmptyState } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { EMPTY_PANTRY_TEXT, pantryByPlace } from './kitchen-view'
import { PantryItemSheet } from './PantryItemSheet'

/** La feuille ouverte : un aliment à modifier, ou un nouvel aliment. */
type Editing = { item: PantryItem | null } | null

/** Frigo et placards : ce qu'on a chez soi, noté à la main ou lu sur une photo, pour des idées de repas. */
export function KitchenPage() {
  const pantry = useLiveQuery(() => db.pantryItems.toArray(), [])
  const [editing, setEditing] = useState<Editing>(null)
  const pageProps = { title: 'Frigo et placards', back: true, backTo: '/nutrition', backLabel: 'Nutrition' }

  if (pantry === undefined) {
    return (
      <Page {...pageProps}>
        <PageSpinner />
      </Page>
    )
  }

  return (
    <Page {...pageProps}>
      <div className="mb-6 flex flex-col gap-2">
        <ButtonLink to="/nutrition/kitchen/photo" block size="lg" icon={<Camera size={20} aria-hidden />}>
          Photographier mon frigo
        </ButtonLink>
        <ButtonLink
          to="/nutrition/kitchen/ideas"
          block
          size="lg"
          variant="secondary"
          icon={<ChefHat size={20} aria-hidden />}
        >
          Trouver des idées de repas
        </ButtonLink>
      </div>

      {pantry.length === 0 ? (
        <div className="mb-6">
          <EmptyState
            icon={<Refrigerator size={36} aria-hidden />}
            title="Rien de noté pour l’instant"
            text={EMPTY_PANTRY_TEXT}
          />
        </div>
      ) : (
        pantryByPlace(pantry).map(({ place, items }) => (
          <Section key={place} title={PLACE_LABEL[place]}>
            {items.length > 0 ? (
              <ListGroup>
                {items.map((item) => (
                  <ListRow
                    key={item.id}
                    title={item.name}
                    trailing={item.quantity === '' ? undefined : item.quantity}
                    onClick={() => {
                      setEditing({ item })
                    }}
                  />
                ))}
              </ListGroup>
            ) : (
              <p className="px-1 text-[14px] text-ink-3">Rien de noté.</p>
            )}
          </Section>
        ))
      )}

      <Button
        block
        variant="secondary"
        icon={<Plus size={18} aria-hidden />}
        onClick={() => {
          setEditing({ item: null })
        }}
      >
        Ajouter un aliment
      </Button>

      {editing && (
        <PantryItemSheet
          key={editing.item?.id ?? 'new'}
          item={editing.item}
          onClose={() => {
            setEditing(null)
          }}
        />
      )}
    </Page>
  )
}
