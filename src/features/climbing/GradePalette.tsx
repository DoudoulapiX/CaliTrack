import { fontOf } from '@/content/climbing/labels'
import type { GradeScale } from '@/db/types'
import { cn } from '@/lib/cn'
import { readableOn } from '@/lib/color'
import { frenchSpacing } from '@/lib/typography'

export interface GradePaletteProps {
  scale: GradeScale
  /** Blocs réussis par niveau dans la séance (pastille sur la couleur). */
  sends: ReadonlyMap<string, number>
  onPick: (gradeKey: string) => void
}

/** Les couleurs de la salle, en grandes touches : une touche pour noter un bloc à ce niveau. */
export function GradePalette({ scale, sends, onPick }: GradePaletteProps) {
  return (
    <ul className={cn('grid gap-2', scale.grades.length > 9 ? 'grid-cols-4' : 'grid-cols-3')}>
      {scale.grades.map((grade) => {
        const font = fontOf(grade)
        const ink = readableOn(grade.color)
        const count = sends.get(grade.key) ?? 0
        const name = font ? `${grade.label}, ${font}` : grade.label
        const done = count > 0 ? ` (${String(count)} réussi${count > 1 ? 's' : ''})` : ''
        return (
          <li key={grade.key}>
            <button
              type="button"
              aria-label={frenchSpacing(`${name} : ajouter un bloc${done}`)}
              onClick={() => {
                onPick(grade.key)
              }}
              className="relative flex h-16 w-full flex-col items-center justify-center rounded-2xl px-1 ring-1 ring-ink/15 ring-inset transition-transform active:scale-95"
              style={{ backgroundColor: grade.color, color: ink }}
            >
              <span className="max-w-full truncate text-[15px] leading-tight font-semibold">
                {grade.label}
              </span>
              {font && <span className="max-w-full truncate text-[11px] leading-tight">{font}</span>}
              {count > 0 && (
                <span
                  aria-hidden
                  className="absolute top-1 right-1 min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold tabular"
                  style={{ backgroundColor: ink, color: grade.color }}
                >
                  {count}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
