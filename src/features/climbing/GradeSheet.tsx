import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, Check, Trash2 } from 'lucide-react'
import {
  findGrade,
  GRADE_COLORS,
  GRADE_LABEL_MAX,
  gradeDraftError,
  gradeDraftOf,
  gradeIndex,
  withGradeAdded,
  withGradeChanged,
  withGradeMoved,
  withoutGrade,
  type GradeDraft,
} from '@/content/grades'
import { gradeUsage, saveGradeScale } from '@/db/climbing'
import type { GradeScale } from '@/db/types'
import { cn } from '@/lib/cn'
import { readableOn } from '@/lib/color'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'

/** Une couleur proposée que l'échelle n'utilise pas encore (pour un nouveau niveau). */
function freeColor(scale: GradeScale): string {
  const used = new Set(scale.grades.map((g) => g.color.toLowerCase()))
  return (GRADE_COLORS.find((c) => !used.has(c.color)) ?? GRADE_COLORS[0] ?? { color: '#71717a' }).color
}

export interface GradeSheetProps {
  scale: GradeScale
  /** Le niveau à modifier ; null pour en ajouter un (le plus dur). */
  gradeKey: string | null
  onClose: () => void
}

/** Nom, couleur, équivalence Fontainebleau et place d'un niveau. Montée à l'ouverture. */
export function GradeSheet({ scale, gradeKey, onClose }: GradeSheetProps) {
  const toast = useToast()
  const grade = gradeKey === null ? undefined : findGrade(scale, gradeKey)
  const [draft, setDraft] = useState<GradeDraft>(() =>
    grade ? gradeDraftOf(grade) : { label: '', color: freeColor(scale), font: '' },
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usage = useLiveQuery(
    async () => (gradeKey === null ? null : gradeUsage(scale.id, gradeKey)),
    [scale.id, gradeKey],
  )
  const index = gradeKey === null ? -1 : gradeIndex(scale, gradeKey)
  const custom = !GRADE_COLORS.some((c) => c.color === draft.color.toLowerCase())

  const update = (patch: Partial<GradeDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setError(null)
  }

  const run = async (action: () => Promise<void>, done: string, close: boolean) => {
    setBusy(true)
    try {
      await action()
      toast(done)
      if (close) onClose()
      else setBusy(false)
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  const save = () => {
    const problem = gradeDraftError(scale, draft, gradeKey)
    if (problem) {
      setError(problem)
      return
    }
    const next = gradeKey === null ? withGradeAdded(scale, draft) : withGradeChanged(scale, gradeKey, draft)
    void run(
      async () => {
        await saveGradeScale(next)
      },
      gradeKey === null ? 'Niveau ajouté' : 'Niveau enregistré',
      true,
    )
  }

  const move = (delta: -1 | 1) => {
    if (gradeKey === null) return
    void run(
      async () => {
        await saveGradeScale(withGradeMoved(scale, gradeKey, delta))
      },
      delta < 0 ? 'Niveau déplacé vers les plus faciles' : 'Niveau déplacé vers les plus durs',
      false,
    )
  }

  const used = usage ? usage.boulders > 0 || usage.goals > 0 : false
  const last = scale.grades.length <= 1
  const remove = () => {
    if (gradeKey === null || used || last) return
    void run(
      async () => {
        await saveGradeScale(withoutGrade(scale, gradeKey))
      },
      'Niveau supprimé',
      true,
    )
  }

  let removeNote: string | null = null
  if (usage && used) {
    const parts = [
      usage.boulders > 0 ? `${String(usage.boulders)} bloc${usage.boulders > 1 ? 's' : ''}` : null,
      usage.goals > 0 ? `${String(usage.goals)} objectif${usage.goals > 1 ? 's' : ''}` : null,
    ].filter(Boolean)
    removeNote = frenchSpacing(`Utilisé par ${parts.join(' et ')} : renomme-le plutôt que de le supprimer.`)
  } else if (last) {
    removeNote = 'Une échelle garde au moins un niveau.'
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={grade ? `Niveau ${grade.label}` : 'Nouveau niveau'}
      tall
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="px-1 text-center text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={save}>
            {grade ? 'Enregistrer' : 'Ajouter le niveau'}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <TextField
          label="Nom"
          value={draft.label}
          maxLength={GRADE_LABEL_MAX}
          autoCapitalize="sentences"
          enterKeyHint="done"
          placeholder="Ex. Jaune"
          onChange={(label) => {
            update({ label })
          }}
        />

        <div className="flex flex-col gap-2">
          <span className="px-1 text-[13px] font-medium text-ink-2">Couleur</span>
          <div role="radiogroup" aria-label="Couleur" className="flex flex-wrap gap-2.5">
            {GRADE_COLORS.map((option) => {
              const selected = draft.color.toLowerCase() === option.color
              return (
                <button
                  key={option.color}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.name}
                  title={option.name}
                  onClick={() => {
                    update({ color: option.color })
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
              value={draft.color}
              onChange={(e) => {
                update({ color: e.target.value })
              }}
              className={cn(
                'size-10 cursor-pointer rounded-full border-0 bg-transparent p-0',
                custom && 'outline-2 outline-offset-2 outline-accent outline-solid',
              )}
            />
            Autre couleur
          </label>
        </div>

        <TextField
          label="Équivalence Fontainebleau (facultatif)"
          value={draft.font}
          maxLength={20}
          enterKeyHint="done"
          placeholder="Ex. 5A – 5C"
          onChange={(font) => {
            update({ font })
          }}
        />

        {grade && (
          <div className="flex flex-col gap-2">
            <span className="px-1 text-[13px] font-medium text-ink-2">
              Place&nbsp;: {String(index + 1)} sur {String(scale.grades.length)}, du plus facile au plus dur
            </span>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={busy || index <= 0}
                icon={<ArrowUp size={18} aria-hidden />}
                onClick={() => {
                  move(-1)
                }}
              >
                Plus facile
              </Button>
              <Button
                variant="secondary"
                disabled={busy || index >= scale.grades.length - 1}
                icon={<ArrowDown size={18} aria-hidden />}
                onClick={() => {
                  move(1)
                }}
              >
                Plus dur
              </Button>
            </div>
          </div>
        )}

        {grade && (
          <div className="flex flex-col gap-2">
            <Button
              variant="danger"
              block
              disabled={busy || usage === undefined || used || last}
              icon={<Trash2 size={18} aria-hidden />}
              onClick={remove}
            >
              Supprimer le niveau
            </Button>
            {removeNote && <p className="px-1 text-[13px] text-ink-3">{removeNote}</p>}
          </div>
        )}
      </form>
    </Sheet>
  )
}
