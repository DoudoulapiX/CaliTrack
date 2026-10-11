import { useState } from 'react'
import { Lightbulb } from 'lucide-react'
import { Card } from '@/ui/Card'

/** Lignes visibles avant « Tout afficher ». */
const PREVIEW = 4

/** Les explications du programme, repliées quand elles sont longues. */
export function RationaleList({ lines }: { lines: readonly string[] }) {
  const [open, setOpen] = useState(false)
  const shown = open || lines.length <= PREVIEW + 1 ? lines : lines.slice(0, PREVIEW)
  return (
    <Card>
      <ul className="flex flex-col gap-2.5">
        {shown.map((line) => (
          <li key={line} className="flex gap-2.5 text-[14px] leading-snug text-ink-2">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-accent-text" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {shown.length < lines.length && (
        <button
          type="button"
          onClick={() => {
            setOpen(true)
          }}
          className="mt-3 text-[14px] font-semibold text-accent-text"
        >
          Tout afficher ({lines.length})
        </button>
      )}
    </Card>
  )
}
