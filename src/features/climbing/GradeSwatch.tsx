import { cn } from '@/lib/cn'

const SIZE = {
  xs: 'size-3',
  sm: 'size-5',
  md: 'size-8',
  lg: 'size-11',
} as const

/** Pastille de la couleur d'un niveau, cerclée pour rester visible sur tous les fonds (noir, blanc). */
export function GradeSwatch({
  color,
  size = 'md',
  className,
}: {
  color: string
  size?: keyof typeof SIZE
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block shrink-0 rounded-full ring-1 ring-ink/25 ring-inset',
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: color }}
    />
  )
}
