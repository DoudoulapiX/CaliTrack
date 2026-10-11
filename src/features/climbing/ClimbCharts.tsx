import { bouldersOf } from '@/content/climbing/labels'
import type { GradeStats, SessionColumn } from '@/content/climbing/stats'
import { capitalize, formatDay } from '@/lib/dates'
import { frenchSpacing, joinFrench } from '@/lib/typography'
import { GradeSwatch } from './GradeSwatch'

/**
 * Pyramide des blocs réussis, du niveau le plus dur au plus facile. La partie plus foncée de chaque
 * barre : les blocs réussis au premier essai.
 */
export function Pyramid({ rows }: { rows: readonly GradeStats[] }) {
  const max = Math.max(1, ...rows.map((row) => row.sends))
  return (
    <div className="rounded-2xl bg-surface p-4">
      <ul aria-label="Pyramide des blocs réussis" className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.grade.key} className="flex items-center gap-3">
            <span className="flex w-24 shrink-0 items-center gap-2 text-[14px] text-ink">
              <GradeSwatch color={row.grade.color} size="sm" />
              <span className="truncate">{row.grade.label}</span>
            </span>
            <span aria-hidden className="relative h-5 flex-1 overflow-hidden rounded-md bg-surface-2">
              {row.sends > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-md ring-1 ring-ink/20 ring-inset"
                  style={{ width: `${String((row.sends / max) * 100)}%`, backgroundColor: row.grade.color }}
                />
              )}
              {row.flashes > 0 && (
                <span
                  className="absolute inset-y-0 left-0 rounded-l-md bg-black/35"
                  style={{ width: `${String((row.flashes / max) * 100)}%` }}
                />
              )}
            </span>
            <span className="w-8 shrink-0 text-right text-[15px] font-semibold text-ink tabular">
              {row.sends}
              <span className="sr-only">
                {` réussi${row.sends > 1 ? 's' : ''}`}
                {row.flashes > 0 ? `, dont ${String(row.flashes)} flash` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-ink-3">Partie foncée&nbsp;: réussis au premier essai (flash).</p>
    </div>
  )
}

function columnLabel({ session, segments, total }: SessionColumn): string {
  const day = capitalize(formatDay(session.date))
  if (total === 0) return frenchSpacing(`${day} : aucun bloc réussi`)
  const detail = joinFrench(segments.map((segment) => bouldersOf(segment.count, segment.grade)))
  return frenchSpacing(`${day} : ${String(total)} réussi${total > 1 ? 's' : ''} (${detail})`)
}

/** Blocs réussis séance par séance, empilés par couleur (du plus facile en bas au plus dur en haut). */
export function SessionChart({ columns }: { columns: readonly SessionColumn[] }) {
  const max = Math.max(1, ...columns.map((column) => column.total))
  return (
    <div className="rounded-2xl bg-surface p-4">
      <ol aria-label="Blocs réussis par séance" className="flex h-44 items-stretch gap-1.5">
        {columns.map((column) => (
          <li key={column.session.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span aria-hidden className="text-[11px] font-semibold text-ink-2 tabular">
              {column.total}
            </span>
            <span aria-hidden className="relative w-full flex-1">
              <span
                className="absolute inset-x-0 bottom-0 mx-auto flex max-w-7 flex-col-reverse overflow-hidden rounded-md"
                style={{ height: `${String((column.total / max) * 100)}%` }}
              >
                {column.segments.map((segment) => (
                  <span
                    key={segment.grade.key}
                    className="w-full ring-1 ring-ink/20 ring-inset"
                    style={{
                      height: `${String((segment.count / column.total) * 100)}%`,
                      backgroundColor: segment.grade.color,
                    }}
                  />
                ))}
              </span>
            </span>
            <span aria-hidden className="text-[10px] text-ink-3 tabular">
              {formatDay(column.session.date, 'd/MM')}
            </span>
            <span className="sr-only">{columnLabel(column)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
