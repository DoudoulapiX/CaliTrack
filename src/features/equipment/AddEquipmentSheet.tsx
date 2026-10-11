import type { EquipmentKind } from '@/db/types'
import { EQUIPMENT_GROUP_LABEL, EQUIPMENT_PRESETS, type EquipmentPreset } from '@/content/equipment'
import { Badge } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Section } from '@/ui/Page'
import { Sheet } from '@/ui/Sheet'

const GROUP_ORDER: readonly EquipmentPreset['group'][] = [
  'calisthenics',
  'weights',
  'climbing',
  'home',
  'gym',
]

export interface AddEquipmentSheetProps {
  open: boolean
  onClose: () => void
  onPick: (kind: EquipmentKind) => void
  /** Matériel déjà dans l'inventaire (on peut en ajouter un autre, par exemple des haltères au parc). */
  owned: ReadonlySet<EquipmentKind>
}

export function AddEquipmentSheet({ open, onClose, onPick, owned }: AddEquipmentSheetProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Ajouter du matériel" tall>
      {GROUP_ORDER.map((group) => (
        <Section key={group} title={EQUIPMENT_GROUP_LABEL[group]}>
          <ListGroup>
            {EQUIPMENT_PRESETS.filter((preset) => preset.group === group).map((preset) => (
              <ListRow
                key={preset.kind}
                title={preset.label}
                subtitle={preset.hint || undefined}
                trailing={owned.has(preset.kind) ? <Badge>Déjà ajouté</Badge> : undefined}
                onClick={() => {
                  onPick(preset.kind)
                }}
              />
            ))}
          </ListGroup>
        </Section>
      ))}
    </Sheet>
  )
}
