import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check, CircleAlert, Copy, Lightbulb, Pencil, SearchX, Star, Trash2 } from 'lucide-react'
import { db } from '@/db/db'
import type { Exercise } from '@/db/types'
import { deleteCustomExercise, exerciseUsage, isUsed, type ExerciseUsage } from '@/db/custom-exercises'
import { setExerciseNote, setFavorite } from '@/db/exercise-meta'
import { EQUIPMENT_LABEL } from '@/content/equipment'
import { canDoWith } from '@/content/exercises/catalog'
import {
  CATEGORY_LABEL,
  FORCE_LABEL,
  LEVEL_LABEL,
  MEASURE_LABEL,
  MUSCLE_LABEL,
} from '@/content/exercises/labels'
import { useSettings } from '@/app/data-context'
import { useAvailableKinds } from '@/features/equipment/useAvailableKinds'
import { Button, ButtonLink, IconButton } from '@/ui/Button'
import { Badge, EmptyState } from '@/ui/Controls'
import { TextAreaField } from '@/ui/Field'
import { ListGroup, ListRow } from '@/ui/List'
import { Page, Section } from '@/ui/Page'
import { ConfirmSheet, Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { ExerciseMedia } from './ExerciseMedia'
import { useCatalog } from './catalog-context'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'

function NoteEditor({ exerciseId, initial }: { exerciseId: string; initial: string }) {
  const [note, setNote] = useState(initial)
  return (
    <TextAreaField
      label="Ma note"
      hint="Réglages, sensations, prise… Enregistrée automatiquement."
      value={note}
      onChange={setNote}
      onBlur={() => {
        if (note !== initial) void setExerciseNote(exerciseId, note)
      }}
      placeholder={frenchSpacing('Ex. : prise neutre, élastique rouge')}
    />
  )
}

function usageText(usage: ExerciseUsage): string {
  const parts: string[] = []
  if (usage.programs.length > 0) parts.push(`le programme ${usage.programs.join(', ')}`)
  if (usage.workouts > 0)
    parts.push(`${usage.workouts} séance${usage.workouts > 1 ? 's' : ''} de ton historique`)
  if (usage.goals.length > 0) parts.push(`l’objectif ${usage.goals.join(', ')}`)
  return parts.join(', ')
}

function CustomActions({ exercise }: { exercise: Exercise }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [blockedBy, setBlockedBy] = useState<ExerciseUsage | null>(null)

  const askDelete = async () => {
    const usage = await exerciseUsage(exercise.id)
    if (isUsed(usage)) setBlockedBy(usage)
    else setConfirmOpen(true)
  }

  return (
    <div className="flex flex-col gap-2">
      <ButtonLink
        to={`/library/${exercise.id}/edit`}
        variant="secondary"
        block
        icon={<Pencil size={18} aria-hidden />}
      >
        Modifier
      </ButtonLink>
      <Button
        variant="danger"
        block
        icon={<Trash2 size={18} aria-hidden />}
        onClick={() => {
          void askDelete()
        }}
      >
        Supprimer
      </Button>
      <ConfirmSheet
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false)
        }}
        title={frenchSpacing('Supprimer cet exercice ?')}
        message={frenchSpacing(`« ${exercise.name} » sera supprimé définitivement.`)}
        confirmLabel="Supprimer"
        onConfirm={() => {
          deleteCustomExercise(exercise.id).then(
            () => {
              toast('Exercice supprimé')
              void navigate('/library', { replace: true })
            },
            (error: unknown) => {
              toast(userMessage(error, 'Suppression impossible'), 'error')
            },
          )
        }}
      />
      <Sheet
        open={blockedBy !== null}
        onClose={() => {
          setBlockedBy(null)
        }}
        title="Exercice utilisé"
      >
        <p className="text-[15px] text-ink-2">
          {blockedBy &&
            `Cet exercice apparaît dans ${usageText(blockedBy)}. Pour garder ton historique intact, il ne peut pas être supprimé. Tu peux le renommer ou le modifier.`}
        </p>
      </Sheet>
    </div>
  )
}

function ExerciseDetail({ exercise }: { exercise: Exercise }) {
  const settings = useSettings()
  const equipment = useAvailableKinds(settings.currentLocationId)
  const meta = useLiveQuery(() => db.exerciseMeta.get(exercise.id), [exercise.id], null)
  const favorite = meta?.favorite ?? false
  const doable = canDoWith(exercise, equipment.kinds)

  return (
    <Page
      title={exercise.name}
      back
      backTo="/library"
      backLabel="Exercices"
      large
      actions={
        <IconButton
          label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          aria-pressed={favorite}
          onClick={() => {
            void setFavorite(exercise.id, !favorite)
          }}
        >
          <Star size={22} className={favorite ? 'fill-current text-accent-text' : ''} aria-hidden />
        </IconButton>
      }
    >
      <ExerciseMedia exercise={exercise} />

      <div className="mb-5 flex flex-wrap gap-1.5">
        <Badge tone="accent">{LEVEL_LABEL[exercise.level]}</Badge>
        <Badge>{CATEGORY_LABEL[exercise.category]}</Badge>
        {exercise.force && <Badge>{FORCE_LABEL[exercise.force]}</Badge>}
        <Badge>{MEASURE_LABEL[exercise.measure]}</Badge>
        {exercise.unilateral && <Badge>Un côté puis l’autre</Badge>}
        {exercise.source === 'custom' && <Badge tone="success">Mon exercice</Badge>}
      </div>

      <Section title="Muscles">
        <div className="rounded-2xl bg-surface p-4">
          <p className="text-[13px] text-ink-3">Principaux</p>
          <p className="mb-2 text-[16px] font-medium text-ink">
            {exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ') || 'Non précisé'}
          </p>
          {exercise.secondaryMuscles.length > 0 && (
            <>
              <p className="text-[13px] text-ink-3">Secondaires</p>
              <p className="text-[15px] text-ink-2">
                {exercise.secondaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')}
              </p>
            </>
          )}
        </div>
      </Section>

      <Section
        title="Matériel"
        action={
          exercise.equipment.length > 0 && equipment.hasInventory ? (
            <span className={doable ? 'text-[13px] text-success' : 'text-[13px] text-warning'}>
              {doable ? 'Tu as ce qu’il faut' : 'Il te manque du matériel'}
            </span>
          ) : undefined
        }
      >
        {exercise.equipment.length === 0 ? (
          <ListGroup>
            <ListRow
              title="Aucun matériel"
              leading={<Check size={18} className="text-success" aria-hidden />}
            />
          </ListGroup>
        ) : (
          <>
            {exercise.equipment.length > 1 && (
              <p className="mb-2 px-1 text-[13px] text-ink-3">Une de ces options suffit&nbsp;:</p>
            )}
            <ListGroup>
              {exercise.equipment.map((group) => {
                const ok = group.every((kind) => equipment.kinds.has(kind))
                return (
                  <ListRow
                    key={group.join('+')}
                    title={group.map((kind) => EQUIPMENT_LABEL[kind]).join(' + ')}
                    leading={
                      equipment.hasInventory ? (
                        ok ? (
                          <Check size={18} className="text-success" role="img" aria-label="Disponible" />
                        ) : (
                          <CircleAlert
                            size={18}
                            className="text-ink-3"
                            role="img"
                            aria-label="Pas dans ton inventaire"
                          />
                        )
                      ) : undefined
                    }
                  />
                )
              })}
            </ListGroup>
          </>
        )}
      </Section>

      {exercise.instructions.length > 0 && (
        <Section title="Comment faire">
          <ol className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            {exercise.instructions.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-bold text-accent-text">
                  {index + 1}
                </span>
                <span className="text-[16px] leading-snug text-ink">{step}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {exercise.tips.length > 0 && (
        <Section title="Conseils">
          <ul className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            {exercise.tips.map((tip, index) => (
              <li key={index} className="flex gap-3">
                <Lightbulb size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
                <span className="text-[15px] leading-snug text-ink-2">{tip}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section>
        {meta !== null && (
          <NoteEditor key={exercise.id} exerciseId={exercise.id} initial={meta?.note ?? ''} />
        )}
      </Section>

      {exercise.nameEn && (
        <p className="mb-6 px-1 text-[13px] text-ink-3">
          Nom anglais (pratique pour chercher une vidéo)&nbsp;: <span lang="en">{exercise.nameEn}</span>
        </p>
      )}

      <Section>
        {exercise.source === 'custom' ? (
          <CustomActions exercise={exercise} />
        ) : (
          <ButtonLink
            to={`/library/new?from=${encodeURIComponent(exercise.id)}`}
            variant="secondary"
            block
            icon={<Copy size={18} aria-hidden />}
          >
            Créer ma version de cet exercice
          </ButtonLink>
        )}
      </Section>
    </Page>
  )
}

export function ExercisePage() {
  const { id = '' } = useParams()
  const catalog = useCatalog()
  const exercise = catalog.byId.get(id)

  if (!exercise) {
    return (
      <Page title="Exercice" back backTo="/library" backLabel="Exercices">
        <EmptyState
          icon={<SearchX size={32} aria-hidden />}
          title="Exercice introuvable"
          text="Il a peut-être été supprimé."
          action={<ButtonLink to="/library">Voir tous les exercices</ButtonLink>}
        />
      </Page>
    )
  }
  return <ExerciseDetail key={exercise.id} exercise={exercise} />
}
