import { WEEKDAYS, WEEKDAY_LONG, WEEKDAY_SHORT, type Weekday } from '@/lib/dates'
import { cn } from '@/lib/cn'

export interface WeekdayPickerProps {
  label: string
  value: readonly Weekday[]
  onChange: (value: Weekday[]) => void
  /** Jours déjà pris ailleurs (affichés en pointillés). */
  marked?: readonly Weekday[]
}

export function WeekdayPicker({ label, value, onChange, marked = [] }: WeekdayPickerProps) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-7 gap-1.5">
      {WEEKDAYS.map((d) => {
        const on = value.includes(d)
        return (
          <button
            key={d}
            type="button"
            aria-pressed={on}
            aria-label={WEEKDAY_LONG[d]}
            onClick={() => {
              onChange(on ? value.filter((v) => v !== d) : [...value, d].sort((a, b) => a - b))
            }}
            className={cn(
              'flex h-11 items-center justify-center rounded-xl text-[13px] font-semibold transition-colors',
              on ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-2',
              !on && marked.includes(d) && 'border border-dashed border-ink-3',
            )}
          >
            {WEEKDAY_SHORT[d]}
          </button>
        )
      })}
    </div>
  )
}
