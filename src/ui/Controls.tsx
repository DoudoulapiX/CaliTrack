import { useId, type ReactNode } from 'react'
import { Check, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}

/** Interrupteur style iOS, sur une ligne de liste. */
export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId()
  return (
    <div className="flex min-h-13 items-center gap-3 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block text-[16px] text-ink">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="mt-0.5 block text-[13px] text-ink-3">
            {description}
          </span>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => {
          onChange(!checked)
        }}
        className={cn(
          'relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors disabled:opacity-40',
          checked ? 'bg-success' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-5',
          )}
        />
      </button>
    </div>
  )
}

export interface SegmentedProps<T extends string> {
  label: string
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode }[]
  className?: string
}

/** Choix unique parmi quelques options (contrôle segmenté). */
export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex gap-1 rounded-xl bg-surface-2 p-1', className)}
    >
      {options.map((o) => {
        const selected = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(o.value)
            }}
            className={cn(
              'min-h-9 flex-1 rounded-lg px-2 text-[14px] font-medium transition-colors',
              selected ? 'bg-surface text-ink shadow-sm dark:bg-surface-3' : 'text-ink-2',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export interface ChipProps {
  selected: boolean
  onToggle: () => void
  children: ReactNode
  icon?: ReactNode
  className?: string
}

/** Pastille sélectionnable (choix multiples). */
export function Chip({ selected, onToggle, children, icon, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium transition-colors',
        selected ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2 active:bg-surface-3',
        className,
      )}
    >
      {selected ? <Check size={15} aria-hidden /> : icon}
      {children}
    </button>
  )
}

export interface ChipGroupProps<T extends string | number> {
  label: string
  options: { value: T; label: ReactNode }[]
  selected: readonly T[]
  onChange: (selected: T[]) => void
  className?: string
}

export function ChipGroup<T extends string | number>({
  label,
  options,
  selected,
  onChange,
  className,
}: ChipGroupProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const isOn = selected.includes(o.value)
        return (
          <Chip
            key={String(o.value)}
            selected={isOn}
            onToggle={() => {
              onChange(isOn ? selected.filter((v) => v !== o.value) : [...selected, o.value])
            }}
          >
            {o.label}
          </Chip>
        )
      })}
    </div>
  )
}

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  format?: (value: number) => ReactNode
  className?: string
}

/** Bouton − valeur + pour régler un nombre au pouce. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  format,
  className,
}: StepperProps) {
  const set = (next: number) => {
    onChange(Math.min(max, Math.max(min, Math.round(next * 100) / 100)))
  }
  return (
    <div className={cn('flex items-center gap-2', className)} role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`${label} : moins`}
        disabled={value <= min}
        onClick={() => {
          set(value - step)
        }}
        className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink active:bg-surface-3 disabled:opacity-30"
      >
        <Minus size={18} aria-hidden />
      </button>
      <output aria-live="polite" className="min-w-12 text-center text-[17px] font-semibold text-ink tabular">
        {format ? format(value) : value}
      </output>
      <button
        type="button"
        aria-label={`${label} : plus`}
        disabled={value >= max}
        onClick={() => {
          set(value + step)
        }}
        className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink active:bg-surface-3 disabled:opacity-30"
      >
        <Plus size={18} aria-hidden />
      </button>
    </div>
  )
}

export interface ProgressBarProps {
  value: number
  label: string
  /** Couleur de remplissage (par défaut la couleur d'accent). */
  color?: string
  size?: 'sm' | 'md'
  className?: string
}

/** Barre de progression de 0 à 100. */
export function ProgressBar({ value, label, color, size = 'md', className }: ProgressBarProps) {
  const pct = Math.round(Math.min(100, Math.max(0, value)))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn(
        'w-full overflow-hidden rounded-full bg-surface-3',
        size === 'md' ? 'h-2.5' : 'h-1.5',
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500"
        style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : {}) }}
      />
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon?: ReactNode
  title: string
  text?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface px-6 py-8 text-center">
      {icon && <div className="mb-1 text-ink-3">{icon}</div>}
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      {text && <p className="text-[14px] text-ink-3">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold',
        tone === 'neutral' && 'bg-surface-2 text-ink-2',
        tone === 'accent' && 'bg-accent-soft text-accent-text',
        tone === 'success' && 'bg-success/15 text-success',
        tone === 'warning' && 'bg-warning/15 text-warning',
        tone === 'danger' && 'bg-danger/15 text-danger',
        className,
      )}
    >
      {children}
    </span>
  )
}
