import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useSettings } from '@/app/data-context'
import { useGoBack } from '@/app/useGoBack'
import { fontOf } from '@/content/climbing/labels'
import { builtInScale, MAX_GRADES } from '@/content/grades'
import { deleteGradeScale, gradeUsage, resetGradeScale } from '@/db/climbing'
import { updateSettings } from '@/db/settings'
import type { GradeScale } from '@/db/types'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { ChoiceChips } from '@/ui/Controls'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { GradeSheet } from './GradeSheet'
import { GradeSwatch } from './GradeSwatch'
import { ScaleSheet } from './ScaleSheet'
import { activeScaleOf, useGradeScales } from './useClimbing'

type Editing =
  | { kind: 'grade'; key: string | null }
  | { kind: 'scale'; mode: 'new' | 'rename' }
  | { kind: 'reset' }
  | { kind: 'delete' }

/** Une échelle fournie avec l'appli a-t-elle été modifiée depuis son origine ? */
function isModified(scale: GradeScale): boolean {
  const original = builtInScale(scale.id)
  if (!original) return false
  return original.name !== scale.name || JSON.stringify(original.grades) !== JSON.stringify(scale.grades)
}

function ScaleActions({ scale, onEdit }: { scale: GradeScale; onEdit: (editing: Editing) => void }) {
  const usage = useLiveQuery(async () => gradeUsage(scale.id, null), [scale.id])
  const used = usage ? usage.sessions > 0 || usage.goals > 0 : true
  return (
    <ListGroup>
      <ListRow
        leading={<Pencil size={20} aria-hidden />}
        title="Renommer l’échelle"
        onClick={() => {
          onEdit({ kind: 'scale', mode: 'rename' })
        }}
      />
      <ListRow
        leading={<Plus size={20} aria-hidden />}
        title="Nouvelle échelle pour une autre salle"
        subtitle={`Elle part des niveaux de ${scale.name}.`}
        onClick={() => {
          onEdit({ kind: 'scale', mode: 'new' })
        }}
      />
      {scale.builtIn && isModified(scale) && (
        <ListRow
          leading={<RotateCcw size={20} aria-hidden />}
          title="Revenir aux niveaux d’origine"
          onClick={() => {
            onEdit({ kind: 'reset' })
          }}
        />
      )}
      {!scale.builtIn && (
        <ListRow
          leading={<Trash2 size={20} aria-hidden />}
          title="Supprimer l’échelle"
          subtitle={used && usage ? 'Impossible : des séances ou des objectifs l’utilisent.' : undefined}
          danger
          chevron={false}
          onClick={
            used
              ? undefined
              : () => {
                  onEdit({ kind: 'delete' })
                }
          }
        />
      )}
    </ListGroup>
  )
}

/**
 * Couleurs et cotations : l'échelle des nouvelles séances et ses niveaux (nom, couleur, équivalence
 * Fontainebleau, ordre), d'autres échelles pour d'autres salles.
 */
export function GradesPage() {
  const settings = useSettings()
  const scales = useGradeScales()
  const goBack = useGoBack('/climbing')
  const toast = useToast()
  const [editing, setEditing] = useState<Editing | null>(null)
  const scale = scales ? activeScaleOf(scales, settings) : null
  if (!scales) return <PageSpinner />

  const close = () => {
    setEditing(null)
  }

  const reset = async (target: GradeScale) => {
    try {
      await resetGradeScale(target.id)
      toast('Niveaux d’origine rétablis')
    } catch (e) {
      toast(userMessage(e, 'Opération impossible, réessaie.'), 'error')
    }
  }

  const remove = async (target: GradeScale) => {
    try {
      await deleteGradeScale(target.id)
      toast('Échelle supprimée')
    } catch (e) {
      toast(userMessage(e, 'Suppression impossible, réessaie.'), 'error')
    }
  }

  return (
    <Page title="Couleurs et cotations" back onBack={goBack} backLabel="Escalade" large>
      {scales.length > 1 && scale && (
        <Section title="Échelle des nouvelles séances">
          <ChoiceChips
            label="Échelle des nouvelles séances"
            value={scale.id}
            onChange={(id) => {
              void updateSettings({ activeGradeScaleId: id })
            }}
            options={scales.map((s) => ({
              value: s.id,
              label: s.name,
              icon: <GradeSwatch color={s.grades[0]?.color ?? '#71717a'} size="xs" />,
            }))}
          />
        </Section>
      )}

      {scale ? (
        <>
          <Section title={`Niveaux · ${scale.name}`}>
            <p className="mb-3 px-1 text-[14px] text-ink-3">
              Du plus facile au plus dur. Touche un niveau pour changer son nom, sa couleur, son équivalence
              ou sa place&nbsp;: les blocs déjà notés suivent.
            </p>
            <ListGroup>
              {scale.grades.map((grade) => (
                <ListRow
                  key={grade.key}
                  leading={<GradeSwatch color={grade.color} size="md" />}
                  title={grade.label}
                  subtitle={
                    fontOf(grade) ?? (grade.font === '' ? 'Sans équivalence Fontainebleau' : undefined)
                  }
                  onClick={() => {
                    setEditing({ kind: 'grade', key: grade.key })
                  }}
                />
              ))}
            </ListGroup>
            <Button
              variant="secondary"
              block
              className="mt-3"
              disabled={scale.grades.length >= MAX_GRADES}
              icon={<Plus size={18} aria-hidden />}
              onClick={() => {
                setEditing({ kind: 'grade', key: null })
              }}
            >
              Ajouter un niveau
            </Button>
          </Section>

          <Section title="Échelle">
            <ScaleActions scale={scale} onEdit={setEditing} />
          </Section>

          {editing?.kind === 'grade' && <GradeSheet scale={scale} gradeKey={editing.key} onClose={close} />}
          {editing?.kind === 'scale' && (
            <ScaleSheet mode={editing.mode} scale={scale} scales={scales} onClose={close} />
          )}
          <ConfirmSheet
            open={editing?.kind === 'reset'}
            onClose={close}
            onConfirm={() => void reset(scale)}
            title={frenchSpacing('Revenir aux niveaux d’origine ?')}
            message={`Les niveaux de ${scale.name} reprennent leur nom, leur couleur et leur ordre d’origine. Ceux que tu as ajoutés et déjà utilisés restent, à la fin.`}
            confirmLabel="Revenir à l’origine"
          />
          <ConfirmSheet
            open={editing?.kind === 'delete'}
            onClose={close}
            onConfirm={() => void remove(scale)}
            title={frenchSpacing('Supprimer l’échelle ?')}
            message={`${scale.name} et ses niveaux disparaissent. Les nouvelles séances reprennent l’échelle Vertical’Art.`}
            confirmLabel="Supprimer l’échelle"
          />
        </>
      ) : (
        <p className="px-1 text-[15px] text-ink-3">Aucune échelle de cotation.</p>
      )}
    </Page>
  )
}
