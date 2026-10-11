import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import { readableOn } from '@/lib/color'

export interface ColorPickerProps {
  label: string
  /** Couleur choisie, « #rrggbb ». */
  value: string
  options: readonly { color: string; name: string }[]
  onChange: (color: string) => void
}

/** Pastilles de couleurs proposées, et le sélecteur de l'iPhone pour en prendre une autre. */
export function ColorPicker({ label, value, options, onChange }: ColorPickerProps) {
  const current = value.toLowerCase()
  const custom = !options.some((option) => option.color.toLowerCase() === current)
  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-[13px] font-medium text-ink-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
        {options.map((option) => {
          const selected = option.color.toLowerCase() === current
          return (
            <button
              key={option.color}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.name}
              title={option.name}
              onClick={() => {
                onChange(option.color)
              }}
              className={cn(
                'flex size-10 items-center justify-center rounded-full ring-1 ring-ink/25 ring-inset',
                selected && 'outline-2 outline-offset-2 outline-accent outline-solid',
              )}
              style={{ backgroundColor: option.color }}
            >
              {selected && <Check size={18} style={{ color: readableOn(option.color) }} aria-hidden />}
            </button>
          )
        })}
      </div>
      <label className="flex items-center gap-3 self-start px-1 py-1 text-[15px] text-ink-2">
        <input
          type="color"
          value={current}
          onChange={(e) => {
            onChange(e.target.value)
          }}
          className={cn(
            'size-10 cursor-pointer rounded-full border-0 bg-transparent p-0',
            custom && 'outline-2 outline-offset-2 outline-accent outline-solid',
          )}
        />
        Autre couleur
      </label>
    </div>
  )
}
