import { useState } from 'react'
import { copyScale, SCALE_NAME_MAX, scaleNameError } from '@/content/grades'
import { saveGradeScale } from '@/db/climbing'
import { updateSettings } from '@/db/settings'
import type { GradeScale } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { newId } from '@/lib/ids'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'

export interface ScaleSheetProps {
  /** « new » : une nouvelle échelle qui part des niveaux de `scale` ; « rename » : renommer `scale`. */
  mode: 'new' | 'rename'
  scale: GradeScale
  scales: readonly GradeScale[]
  onClose: () => void
}

/** Créer une échelle (pour une autre salle) ou en changer le nom. Montée à l'ouverture. */
export function ScaleSheet({ mode, scale, scales, onClose }: ScaleSheetProps) {
  const toast = useToast()
  const [name, setName] = useState(mode === 'rename' ? scale.name : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const clean = name.trim()
    const problem = scaleNameError(clean)
    if (problem) {
      setError(problem)
      return
    }
    const same = clean.toLocaleLowerCase('fr')
    if (
      scales.some((s) => (mode === 'new' || s.id !== scale.id) && s.name.toLocaleLowerCase('fr') === same)
    ) {
      setError('Une échelle porte déjà ce nom.')
      return
    }
    setBusy(true)
    try {
      if (mode === 'new') {
        const created = await saveGradeScale(copyScale(scale, clean, newId()))
        // La nouvelle échelle sert aux prochaines séances : c'est celle que l'on vient de créer pour sa salle.
        await updateSettings({ activeGradeScaleId: created.id })
        toast('Échelle créée')
      } else {
        await saveGradeScale({ ...scale, name: clean })
        toast('Échelle renommée')
      }
      onClose()
    } catch (e) {
      setBusy(false)
      setError(userMessage(e, 'Enregistrement impossible, réessaie.'))
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'new' ? 'Nouvelle échelle' : 'Renommer l’échelle'}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="px-1 text-center text-[14px] font-medium text-danger">
              {error}
            </p>
          )}
          <Button block size="lg" disabled={busy} onClick={() => void save()}>
            {mode === 'new' ? 'Créer l’échelle' : 'Enregistrer'}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        {mode === 'new' && (
          <p className="text-[15px] text-ink-2">
            Pour une autre salle. Elle reprend les niveaux de {scale.name}, que tu peux ensuite renommer,
            recolorer, déplacer ou compléter.
          </p>
        )}
        <TextField
          label="Nom"
          value={name}
          maxLength={SCALE_NAME_MAX}
          autoCapitalize="words"
          enterKeyHint="done"
          placeholder="Ex. Ma salle"
          onChange={(value) => {
            setName(value)
            setError(null)
          }}
        />
      </form>
    </Sheet>
  )
}
