import { cn } from '@/lib/cn'

export interface StatTile {
  label: string
  value: string
}

/** Chiffres d'une séance, en tuiles. */
export function StatTiles({ items, className }: { items: StatTile[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-2 gap-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl bg-surface-2/60 px-3 py-2.5">
          <dt className="text-[13px] text-ink-3">{item.label}</dt>
          <dd className="text-[20px] leading-tight font-bold text-ink tabular">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
