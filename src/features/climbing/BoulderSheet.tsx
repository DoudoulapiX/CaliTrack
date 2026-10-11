import { useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { CLIMB_STYLES, fontOf, STYLE_LABEL } from '@/content/climbing/labels'
import { inputOf, MAX_ATTEMPTS, newBoulderInput, type BoulderInput } from '@/content/climbing/session'
import type { BoulderAttempt, GradeScale } from '@/db/types'
import { cn } from '@/lib/cn'
import { frenchSpacing, lowerFirst } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChipGroup, ChoiceChips, Segmented, Stepper, Toggle } from '@/ui/Controls'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { shownGrade } from './climb-view'
import { GradeSwatch } from './GradeSwatch'

/** Un nouveau bloc à ce niveau, ou un bloc déjà noté. */
export type BoulderTarget = { mode: 'new'; gradeKey: string } | { mode: 'edit'; boulder: BoulderAttempt }

export interface BoulderSheetProps {
  scale: GradeScale
  target: BoulderTarget
  onClose: () => void
  /** Enregistre le bloc (la feuille se ferme ensuite ; en cas d'échec, l'appelant prévient). */
  onSave: (input: BoulderInput) => Promise<void>
  onDelete?: () => Promise<void>
}

type Outcome = 'sent' | 'notSent'

const OUTCOME_OPTIONS: { value: Outcome; label: string }[] = [
  { value: 'sent', label: 'Réussi' },
  { value: 'notSent', label: 'Pas réussi' },
]

const STYLE_OPTIONS = CLIMB_STYLES.map((style) => ({ value: style, label: STYLE_LABEL[style] }))

function attemptsHint(input: BoulderInput): string {
  if (!input.sent) return `Tenté ${String(input.attempts)} fois.`
  if (input.attempts <= 1) return frenchSpacing('Flash : réussi du premier coup.')
  return `Réussi au ${String(input.attempts)}e essai.`
}

/** Noter un bloc : réussi ou pas, en combien d'essais, et au besoin son style et une note. */
export function BoulderSheet({ scale, target, onClose, onSave, onDelete }: BoulderSheetProps) {
  const [input, setInput] = useState<BoulderInput>(() =>
    target.mode === 'new' ? newBoulderInput(target.gradeKey) : inputOf(target.boulder),
  )
  const [more, setMore] = useState(
    target.mode === 'edit' && (target.boulder.styles.length > 0 || target.boulder.note !== ''),
  )
  const [busy, setBusy] = useState(false)
  const grade = shownGrade(scale, input.gradeKey)
  const font = fontOf(grade)

  const update = (patch: Partial<BoulderInput>) => {
    setInput((current) => ({ ...current, ...patch }))
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      onClose()
    } catch {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={target.mode === 'new' ? `Bloc ${lowerFirst(grade.label)}` : 'Modifier le bloc'}
      footer={
        <div className="flex flex-col gap-2">
          <Button
            block
            size="lg"
            disabled={busy}
            onClick={() => {
              void run(() => onSave(input))
            }}
          >
            {target.mode === 'new' ? 'Ajouter le bloc' : 'Enregistrer'}
          </Button>
          {onDelete && (
            <Button
              variant="danger"
              block
              size="lg"
              disabled={busy}
              icon={<Trash2 size={18} aria-hidden />}
              onClick={() => {
                void run(onDelete)
              }}
            >
              Supprimer le bloc
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {target.mode === 'new' ? (
          <div className="flex items-center gap-3">
            <GradeSwatch color={grade.color} size="lg" />
            <div className="min-w-0">
              <p className="text-[17px] font-semibold text-ink">{grade.label}</p>
              {font && <p className="text-[14px] text-ink-3">{font} en Fontainebleau</p>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-[13px] font-medium text-ink-2">Niveau</span>
            <ChoiceChips
              label="Niveau"
              value={input.gradeKey}
              onChange={(gradeKey) => {
                update({ gradeKey })
              }}
              options={scale.grades.map((g) => ({
                value: g.key,
                label: g.label,
                icon: <GradeSwatch color={g.color} size="xs" />,
              }))}
            />
          </div>
        )}

        <Segmented
          label="Résultat"
          value={input.sent ? 'sent' : 'notSent'}
          options={OUTCOME_OPTIONS}
          onChange={(outcome) => {
            update({ sent: outcome === 'sent' })
          }}
        />

        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-ink">Essais</p>
            <p className="text-[13px] text-ink-3">{attemptsHint(input)}</p>
          </div>
          <Stepper
            label="Essais"
            value={input.attempts}
            min={1}
            max={MAX_ATTEMPTS}
            onChange={(attempts) => {
              update({ attempts })
            }}
          />
        </div>

        {!input.sent && (
          <div className="overflow-hidden rounded-2xl bg-surface-2">
            <Toggle
              label="À retenter"
              description="Je le garde en projet pour une prochaine fois."
              checked={input.project}
              onChange={(project) => {
                update({ project })
              }}
            />
          </div>
        )}

        <button
          type="button"
          aria-expanded={more}
          onClick={() => {
            setMore(!more)
          }}
          className="-my-2 flex items-center gap-1 self-start py-2 text-[15px] font-medium text-accent-text"
        >
          Style et note (facultatif)
          <ChevronDown size={18} className={cn('transition-transform', more && 'rotate-180')} aria-hidden />
        </button>
        {more && (
          <>
            <ChipGroup
              label="Style du bloc"
              options={STYLE_OPTIONS}
              selected={input.styles}
              onChange={(styles) => {
                update({ styles })
              }}
            />
            <TextField
              label="Note"
              value={input.note}
              maxLength={120}
              placeholder="Ex. le dévers du fond"
              autoCapitalize="sentences"
              enterKeyHint="done"
              onChange={(note) => {
                update({ note })
              }}
            />
          </>
        )}
      </div>
    </Sheet>
  )
}
