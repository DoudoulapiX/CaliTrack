import { itemKind, itemTitle, type AgendaItem } from '@/content/calendar/agenda'
import type { EventKind } from '@/db/types'
import { cn } from '@/lib/cn'
import { Badge } from '@/ui/Controls'
import { ListRow } from '@/ui/List'
import { KIND_STYLE, statusBadge } from './calendar-view'
import { CARDIO_ICON, KIND_ICON } from './kind-icons'

/** L'icône d'une séance, à sa couleur : celle de l'activité cardio si on la connaît, sinon celle du genre. */
export function KindGlyph({ kind, title, size = 20 }: { kind: EventKind; title: string; size?: number }) {
  const Icon = (kind === 'cardio' ? CARDIO_ICON[title.trim()] : undefined) ?? KIND_ICON[kind]
  return <Icon size={size} className={cn('shrink-0', KIND_STYLE[kind].icon)} aria-hidden />
}

/** L'icône d'une séance dans une pastille colorée. */
export function KindIcon({ kind, title }: { kind: EventKind; title: string }) {
  return (
    <span
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', KIND_STYLE[kind].soft)}
    >
      <KindGlyph kind={kind} title={title} />
    </span>
  )
}

export interface AgendaRowProps {
  item: AgendaItem
  subtitle: string
  /** Adresse à ouvrir, ou action au toucher. */
  to?: string
  onSelect?: () => void
}

/** Une ligne de la journée : genre, titre, détail et statut. */
export function AgendaRow({ item, subtitle, to, onSelect }: AgendaRowProps) {
  const badge = statusBadge(item)
  const title = itemTitle(item)
  return (
    <ListRow
      title={item.status === 'skipped' ? <span className="text-ink-3 line-through">{title}</span> : title}
      subtitle={subtitle}
      leading={<KindIcon kind={itemKind(item)} title={title} />}
      trailing={badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
      to={to}
      onClick={onSelect}
    />
  )
}
