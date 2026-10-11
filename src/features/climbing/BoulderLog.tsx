import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  boulderFrom,
  isSend,
  withBoulder,
  withBoulderChanged,
  withoutBoulder,
  type BoulderInput,
} from '@/content/climbing/session'
import { updateClimb } from '@/db/climbing'
import type { BoulderAttempt, ClimbingSession, GradeScale } from '@/db/types'
import { cn } from '@/lib/cn'
import { nowISO } from '@/lib/dates'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { frenchSpacing, lowerFirst } from '@/lib/typography'
import { Section } from '@/ui/Page'
import { useToast } from '@/ui/toast-context'
import { BoulderList } from './BoulderList'
import { BoulderSheet, type BoulderTarget } from './BoulderSheet'
import { shownGrade } from './climb-view'
import { GradePalette } from './GradePalette'

/** Blocs réussis par niveau. */
function sendsByGrade(boulders: readonly BoulderAttempt[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const boulder of boulders) {
    if (isSend(boulder.result)) counts.set(boulder.gradeKey, (counts.get(boulder.gradeKey) ?? 0) + 1)
  }
  return counts
}

export interface BoulderLogProps {
  session: ClimbingSession
  scale: GradeScale | null
  /** Les couleurs pour ajouter un bloc : affichées, derrière un bouton, ou pas du tout (lecture seule). */
  palette: 'shown' | 'toggle' | 'none'
  /** Heure de chaque bloc (séance suivie en direct). */
  showTime: boolean
}

/** Les blocs d'une séance : on en ajoute d'une touche sur leur couleur, on les modifie en les touchant. */
export function BoulderLog({ session, scale, palette, showTime }: BoulderLogProps) {
  const toast = useToast()
  const [target, setTarget] = useState<BoulderTarget | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(session.boulders.length === 0)
  const sends = useMemo(() => sendsByGrade(session.boulders), [session.boulders])
  const editable = palette !== 'none' && scale !== null
  const count = session.boulders.length

  const change = async (edit: (s: ClimbingSession) => ClimbingSession, done: string) => {
    try {
      await updateClimb(session.id, edit)
      toast(done)
    } catch (error) {
      toast(userMessage(error, 'Enregistrement impossible, réessaie.'), 'error')
      throw error
    }
  }

  const save = (input: BoulderInput) => {
    const grade = lowerFirst(shownGrade(scale, input.gradeKey).label)
    if (target?.mode === 'edit') {
      const { id, createdAt } = target.boulder
      return change((s) => withBoulderChanged(s, boulderFrom(input, id, createdAt)), 'Bloc modifié')
    }
    return change((s) => withBoulder(s, boulderFrom(input, newId(), nowISO())), `Bloc ${grade} ajouté`)
  }

  const remove = (boulder: BoulderAttempt) => change((s) => withoutBoulder(s, boulder.id), 'Bloc supprimé')

  return (
    <>
      {editable && palette === 'shown' && (
        <Section title="Ajouter un bloc">
          <GradePalette
            scale={scale}
            sends={sends}
            onPick={(gradeKey) => {
              setTarget({ mode: 'new', gradeKey })
            }}
          />
        </Section>
      )}

      <Section title={count > 0 ? `Blocs notés (${String(count)})` : 'Blocs notés'}>
        {editable && palette === 'toggle' && (
          <div className="mb-3">
            <button
              type="button"
              aria-expanded={paletteOpen}
              onClick={() => {
                setPaletteOpen(!paletteOpen)
              }}
              className="-my-2 mb-1 flex items-center gap-1 py-2 text-[15px] font-medium text-accent-text"
            >
              Ajouter un bloc
              <ChevronDown
                size={18}
                className={cn('transition-transform', paletteOpen && 'rotate-180')}
                aria-hidden
              />
            </button>
            {paletteOpen && (
              <GradePalette
                scale={scale}
                sends={sends}
                onPick={(gradeKey) => {
                  setTarget({ mode: 'new', gradeKey })
                }}
              />
            )}
          </div>
        )}
        {count === 0 ? (
          <p className="rounded-2xl bg-surface px-4 py-4 text-[15px] text-ink-3">
            {editable
              ? frenchSpacing('Touche la couleur d’un bloc après l’avoir tenté : réussi ou pas, il compte.')
              : 'Aucun bloc noté.'}
          </p>
        ) : (
          <BoulderList
            boulders={session.boulders}
            scale={scale}
            showTime={showTime}
            onSelect={
              editable
                ? (boulder) => {
                    setTarget({ mode: 'edit', boulder })
                  }
                : undefined
            }
          />
        )}
        {scale === null && (
          <p className="mt-2 px-1 text-[13px] text-ink-3">
            L’échelle de cotation de cette séance n’existe plus&nbsp;: ses blocs ne peuvent plus être
            modifiés.
          </p>
        )}
      </Section>

      {target && scale && (
        <BoulderSheet
          key={target.mode === 'edit' ? target.boulder.id : target.gradeKey}
          scale={scale}
          target={target}
          onClose={() => {
            setTarget(null)
          }}
          onSave={save}
          onDelete={target.mode === 'edit' ? () => remove(target.boulder) : undefined}
        />
      )}
    </>
  )
}
