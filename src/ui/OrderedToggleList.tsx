import { useId, type ReactNode } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

export interface OrderedItem<K extends string> {
  key: K
  label: string
  icon?: ReactNode
}

export interface OrderedToggleListProps<K extends string> {
  /** Nom de la liste pour les lecteurs d'écran. */
  label: string
  items: readonly OrderedItem<K>[]
  /** Les éléments choisis, dans leur ordre. */
  selected: readonly K[]
  /** Au plus tant d'éléments choisis. */
  max?: number
  /** Au moins tant d'éléments choisis. */
  min?: number
  onChange: (next: K[]) => void
}

function Row<K extends string>({
  item,
  on,
  first,
  last,
  locked,
  onToggle,
  onMove,
}: {
  item: OrderedItem<K>
  on: boolean
  first: boolean
  last: boolean
  locked: boolean
  onToggle: () => void
  onMove: (delta: -1 | 1) => void
}) {
  const id = useId()
  return (
    <li className="flex min-h-13 items-center gap-1 py-1 pr-4 pl-4">
      {item.icon && <span className="mr-2 flex shrink-0 text-ink-2">{item.icon}</span>}
      <span id={id} className={cn('min-w-0 flex-1 truncate text-[16px]', on ? 'text-ink' : 'text-ink-2')}>
        {item.label}
      </span>
      {on && (
        <>
          <IconButton
            label={`${item.label} : monter`}
            disabled={first}
            onClick={() => {
              onMove(-1)
            }}
          >
            <ArrowUp size={18} aria-hidden />
          </IconButton>
          <IconButton
            label={`${item.label} : descendre`}
            disabled={last}
            onClick={() => {
              onMove(1)
            }}
          >
            <ArrowDown size={18} aria-hidden />
          </IconButton>
        </>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={id}
        disabled={locked}
        onClick={onToggle}
        className={cn(
          'relative ml-1 h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40',
          on ? 'bg-success' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow transition-transform',
            on && 'translate-x-5',
          )}
        />
      </button>
    </li>
  )
}

/**
 * Éléments à afficher ou non, dans l'ordre choisi : les éléments choisis d'abord (avec leurs flèches
 * pour les déplacer), puis les autres.
 */
export function OrderedToggleList<K extends string>({
  label,
  items,
  selected,
  max,
  min = 0,
  onChange,
}: OrderedToggleListProps<K>) {
  const known = new Set(items.map((item) => item.key))
  const chosen = selected.filter((key, index) => known.has(key) && selected.indexOf(key) === index)
  const ordered = [
    ...chosen.flatMap((key) => items.filter((item) => item.key === key)),
    ...items.filter((item) => !chosen.includes(item.key)),
  ]
  const full = max !== undefined && chosen.length >= max
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
      {ordered.map((item) => {
        const on = chosen.includes(item.key)
        const position = chosen.indexOf(item.key)
        return (
          <Row
            key={item.key}
            item={item}
            on={on}
            first={position === 0}
            last={position === chosen.length - 1}
            locked={on ? chosen.length <= min : full}
            onToggle={() => {
              onChange(on ? chosen.filter((key) => key !== item.key) : [...chosen, item.key])
            }}
            onMove={(delta) => {
              const index = chosen.indexOf(item.key)
              const other = chosen[index + delta]
              if (other === undefined) return
              const next = [...chosen]
              next[index + delta] = item.key
              next[index] = other
              onChange(next)
            }}
          />
        )
      })}
    </ul>
  )
}
