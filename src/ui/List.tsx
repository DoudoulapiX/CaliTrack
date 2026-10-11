import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <ul className={cn('divide-y divide-line overflow-hidden rounded-2xl bg-surface', className)}>
      {children}
    </ul>
  )
}

export interface ListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  to?: string
  onClick?: () => void
  /** Affiche le chevron › (par défaut quand la ligne est cliquable). */
  chevron?: boolean
  danger?: boolean
  className?: string
}

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  to,
  onClick,
  chevron,
  danger,
  className,
}: ListRowProps) {
  const interactive = Boolean(to ?? onClick)
  const showChevron = chevron ?? interactive
  const content = (
    <>
      {leading && <span className="flex shrink-0 items-center text-ink-2">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[16px] leading-snug', danger ? 'text-danger' : 'text-ink')}>
          {title}
        </span>
        {subtitle && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{subtitle}</span>}
      </span>
      {trailing && (
        <span className="flex shrink-0 items-center gap-1 text-[15px] text-ink-3">{trailing}</span>
      )}
      {showChevron && <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />}
    </>
  )
  const base = cn('flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left', className)
  return (
    <li>
      {to ? (
        <Link to={to} className={cn(base, 'active:bg-surface-2')}>
          {content}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className={cn(base, 'active:bg-surface-2')}>
          {content}
        </button>
      ) : (
        <div className={base}>{content}</div>
      )}
    </li>
  )
}
