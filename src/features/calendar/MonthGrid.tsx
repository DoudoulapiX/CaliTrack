import { useEffect, useRef } from 'react'
import { itemKind, type Agenda } from '@/content/calendar/agenda'
import { cn } from '@/lib/cn'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { dayLabel, dotItems, KIND_STYLE } from './calendar-view'

/** Initiales des jours, du lundi au dimanche. */
const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const
const MAX_DOTS = 3
/** Glissement horizontal minimal (en pixels) pour changer de mois. */
const SWIPE_PX = 50
/** Flèches du clavier : jour d'avant ou d'après, même jour la semaine d'avant ou d'après. */
const KEY_STEP: Partial<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

export interface MonthGridProps {
  /** Les jours affichés : semaines complètes, du lundi au dimanche. */
  days: readonly ISODate[]
  /** Le mois affiché, « AAAA-MM » (les jours des mois voisins sont en retrait). */
  month: string
  agenda: Agenda | undefined
  selected: ISODate
  today: ISODate
  onSelect: (date: ISODate) => void
  /** Glissement vers la gauche (mois suivant, 1) ou vers la droite (mois précédent, -1). */
  onSwipe: (direction: 1 | -1) => void
}

/**
 * Le mois en grille : une pastille par séance (pleine quand elle est faite, en creux sinon). Un seul
 * jour se rejoint avec Tab, les flèches passent d'un jour à l'autre.
 */
export function MonthGrid({ days, month, agenda, selected, today, onSelect, onSwipe }: MonthGridProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const focusAfterMove = useRef(false)

  // Après un déplacement au clavier (parfois dans un autre mois), le jour choisi reprend le focus.
  useEffect(() => {
    if (!focusAfterMove.current) return
    focusAfterMove.current = false
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus()
  }, [selected])

  return (
    <div
      ref={gridRef}
      className="touch-pan-y rounded-2xl bg-surface px-1 pt-2 pb-1"
      onTouchStart={(e) => {
        const touch = e.touches[0]
        touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current
        const touch = e.changedTouches[0]
        touchStart.current = null
        if (!start || !touch) return
        const dx = touch.clientX - start.x
        const dy = touch.clientY - start.y
        if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1)
      }}
    >
      <div aria-hidden className="grid grid-cols-7 pb-1 text-center text-[12px] font-semibold text-ink-3">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={i}>{initial}</span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const items = agenda?.get(date) ?? []
          const dots = dotItems(items).slice(0, MAX_DOTS)
          const isSelected = date === selected
          const isToday = date === today
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              tabIndex={isSelected ? 0 : -1}
              aria-pressed={isSelected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={dayLabel(date, items, today)}
              onClick={() => {
                onSelect(date)
              }}
              onKeyDown={(e) => {
                const step = KEY_STEP[e.key]
                if (step === undefined) return
                e.preventDefault()
                focusAfterMove.current = true
                onSelect(addDaysISO(date, step))
              }}
              className="flex h-13 flex-col items-center gap-1 rounded-xl pt-1 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-[16px] tabular',
                  isSelected
                    ? 'bg-accent font-semibold text-accent-ink'
                    : isToday
                      ? 'font-bold text-accent-text'
                      : date.startsWith(month)
                        ? 'text-ink'
                        : 'text-ink-3',
                )}
              >
                {Number(date.slice(8))}
              </span>
              <span className="flex h-1.5 items-center gap-0.5">
                {dots.map((item) => {
                  const style = KIND_STYLE[itemKind(item)]
                  const filled = item.status === 'done' || item.status === 'active'
                  return (
                    <span
                      key={item.key}
                      className={cn(
                        'size-1.5 rounded-full',
                        filled ? style.dot : cn('ring-1 ring-inset', style.ring),
                      )}
                    />
                  )
                })}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
