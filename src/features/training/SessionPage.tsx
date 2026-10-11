import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowDown, ArrowUp, ChevronRight, Copy, Play, Plus, Settings2, Trash2 } from 'lucide-react'
import { useProfile, useSettings } from '@/app/data-context'
import { NotFound } from '@/app/NotFound'
import {
  addSlot,
  BLOCK_ORDER,
  BLOCK_TITLE,
  duplicateSession,
  moveSlot,
  newSlot,
  removeSession,
  updateSession,
} from '@/content/programs/edit'
import { formatPrescription, formatRest } from '@/content/programs/format'
import type { TrainingContext } from '@/content/programs/resolve'
import { isDeloadWeek } from '@/content/programs/schedule'
import { schemeFor, type Scheme } from '@/content/programs/schemes'
import { updateProgram } from '@/db/programs'
import type { BlockKind, Exercise, Program, ProgramBlock, ProgramSession } from '@/db/types'
import { today } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { userMessage } from '@/lib/errors'
import { frenchSpacing } from '@/lib/typography'
import { Button, ButtonLink, IconButton } from '@/ui/Button'
import { ChoiceChips, EmptyState } from '@/ui/Controls'
import { Page, Section } from '@/ui/Page'
import { PageSpinner } from '@/ui/PageSpinner'
import { ConfirmSheet, Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { ExerciseThumb } from '@/features/library/ExerciseThumb'
import { useCatalog } from '@/features/library/catalog-context'
import { programSessionBuilder } from '@/features/workout/build-session'
import { StartWorkoutButton } from '@/features/workout/StartWorkoutButton'
import { useActiveWorkout, workoutPath } from '@/features/workout/useWorkouts'
import { ExercisePicker } from './ExercisePicker'
import { daysLabel, sessionSummary } from './program-view'
import { SessionSheet } from './SessionSheet'
import { SlotSheet } from './SlotSheet'
import { useProgram, useTrainingContext } from './useTraining'

function BlockSection({
  block,
  reorder,
  onOpen,
  onMove,
}: {
  block: ProgramBlock
  reorder: boolean
  onOpen: (slotId: string) => void
  onMove: (slotId: string, direction: -1 | 1) => void
}) {
  const catalog = useCatalog()
  const settings = useSettings()
  return (
    <Section title={block.title}>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {block.slots.map((slot, index) => {
          const exercise = catalog.byId.get(slot.exerciseId)
          const name = exercise?.name ?? 'Exercice supprimé'
          const detail = [formatPrescription(slot, exercise, settings.weightUnit), formatRest(slot.restSec)]
            .filter(Boolean)
            .join(' · ')
          const body = (
            <>
              {exercise && <ExerciseThumb exercise={exercise} className="size-11" />}
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-snug text-ink">{name}</span>
                <span className="mt-0.5 block text-[13px] text-ink-3">{detail}</span>
                {slot.note && (
                  <span className="mt-0.5 block truncate text-[13px] text-ink-2 italic">{slot.note}</span>
                )}
              </span>
            </>
          )
          return (
            <li key={slot.id}>
              {reorder ? (
                <div className="flex min-h-15 items-center gap-3 px-3 py-2">
                  {body}
                  <IconButton
                    label={`Monter ${name}`}
                    size="sm"
                    variant="filled"
                    disabled={index === 0}
                    onClick={() => {
                      onMove(slot.id, -1)
                    }}
                  >
                    <ArrowUp size={16} aria-hidden />
                  </IconButton>
                  <IconButton
                    label={`Descendre ${name}`}
                    size="sm"
                    variant="filled"
                    disabled={index === block.slots.length - 1}
                    onClick={() => {
                      onMove(slot.id, 1)
                    }}
                  >
                    <ArrowDown size={16} aria-hidden />
                  </IconButton>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onOpen(slot.id)
                  }}
                  className="flex min-h-15 w-full items-center gap-3 px-3 py-2 text-left active:bg-surface-2"
                >
                  {body}
                  <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

/** Ajout d'un exercice : le bloc, puis l'exercice. */
function AddExerciseSheet({
  open,
  onClose,
  context,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  context: TrainingContext
  onAdd: (exercise: Exercise, blockKind: BlockKind) => Promise<void>
}) {
  const [blockKind, setBlockKind] = useState<BlockKind>('strength')
  return (
    <Sheet open={open} onClose={onClose} title="Ajouter un exercice" tall>
      {open && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 px-1 text-[13px] font-semibold text-ink-2">Dans le bloc</p>
            <ChoiceChips
              label="Bloc"
              value={blockKind}
              onChange={setBlockKind}
              options={BLOCK_ORDER.map((kind) => ({ value: kind, label: BLOCK_TITLE[kind] }))}
            />
          </div>
          <ExercisePicker
            ladderId={null}
            currentId={null}
            kinds={context.kinds}
            onPick={(exercise) => void onAdd(exercise, blockKind)}
          />
        </div>
      )}
    </Sheet>
  )
}

function SessionContent({
  program,
  session,
  context,
  scheme,
}: {
  program: Program
  session: ProgramSession
  context: TrainingContext
  scheme: Scheme
}) {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const toast = useToast()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reorder, setReorder] = useState(false)
  const programPath = `/training/programs/${program.id}`
  const takenDays = [
    ...new Set(program.sessions.filter((s) => s.id !== session.id).flatMap((s) => s.weekdays)),
  ]
  const empty = session.blocks.every((block) => block.slots.length === 0)
  const active = useActiveWorkout()
  const resumable = active?.programSessionId === session.id ? active : null
  const deload = isDeloadWeek(program, today())

  const change = async (fn: (current: Program) => Program, failure: string): Promise<boolean> => {
    try {
      await updateProgram(program.id, fn)
      return true
    } catch (e) {
      toast(userMessage(e, failure), 'error')
      return false
    }
  }

  return (
    <Page
      title={session.name}
      back
      backTo={programPath}
      backLabel="Programme"
      className="pt-2"
      footer={
        empty ? undefined : resumable ? (
          <ButtonLink to={workoutPath(resumable.id)} block size="lg" icon={<Play size={18} aria-hidden />}>
            Reprendre la séance
          </ButtonLink>
        ) : (
          <StartWorkoutButton
            block
            size="lg"
            icon={<Play size={18} aria-hidden />}
            build={programSessionBuilder(program, session)}
          >
            Commencer la séance
          </StartWorkoutButton>
        )
      }
      actions={
        <IconButton
          label="Réglages de la séance"
          onClick={() => {
            setSettingsOpen(true)
          }}
        >
          <Settings2 size={22} aria-hidden />
        </IconButton>
      }
    >
      <p className="mb-5 px-1 text-[14px] text-ink-3">
        {daysLabel(session.weekdays)} · {sessionSummary(session, catalog.byId)}
        {!program.active && ` · ${program.name}`}
      </p>
      {deload && program.active && (
        <p className="mb-5 rounded-2xl bg-success/10 px-4 py-3 text-[14px] text-ink-2">
          Semaine allégée&nbsp;: la séance aura moitié moins de séries.
        </p>
      )}

      {empty ? (
        <EmptyState
          title="Séance vide"
          text={frenchSpacing('Ajoute des exercices : échauffement, renforcement, gainage, étirements…')}
        />
      ) : (
        session.blocks.map((block) => (
          <BlockSection
            key={block.id}
            block={block}
            reorder={reorder}
            onOpen={setEditing}
            onMove={(slotId, direction) =>
              void change((p) => moveSlot(p, slotId, direction), 'Déplacement impossible.')
            }
          />
        ))
      )}

      <div className="mt-2 flex gap-2">
        <Button
          variant="soft"
          className="flex-1"
          icon={<Plus size={18} aria-hidden />}
          onClick={() => {
            setAdding(true)
          }}
        >
          Ajouter un exercice
        </Button>
        {!empty && (
          <Button
            variant="secondary"
            aria-pressed={reorder}
            onClick={() => {
              setReorder(!reorder)
            }}
          >
            {reorder ? 'Terminé' : 'Réorganiser'}
          </Button>
        )}
      </div>

      <SlotSheet
        program={program}
        slotId={editing}
        onClose={() => {
          setEditing(null)
        }}
        context={context}
        scheme={scheme}
      />

      <AddExerciseSheet
        open={adding}
        onClose={() => {
          setAdding(false)
        }}
        context={context}
        onAdd={async (exercise, blockKind) => {
          const slot = newSlot(exercise, blockKind, { scheme, loadsOf: context.loadsOf, newId })
          const ok = await change((p) => addSlot(p, session.id, blockKind, slot, newId), 'Ajout impossible.')
          if (ok) {
            setAdding(false)
            toast(frenchSpacing(`« ${exercise.name} » ajouté`))
          }
        }}
      />

      <SessionSheet
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false)
        }}
        session={session}
        takenDays={takenDays}
        onSave={async (draft) => {
          const ok = await change((p) => updateSession(p, session.id, draft), 'Enregistrement impossible.')
          if (ok) {
            setSettingsOpen(false)
            toast('Séance enregistrée')
          }
        }}
      >
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <Button
            variant="secondary"
            block
            icon={<Copy size={18} aria-hidden />}
            onClick={() =>
              void (async () => {
                const copyId = newId()
                const ok = await change(
                  (p) => duplicateSession(p, session.id, newId, copyId),
                  'Copie impossible.',
                )
                if (ok) {
                  setSettingsOpen(false)
                  toast('Séance dupliquée')
                  void navigate(`${programPath}/sessions/${copyId}`)
                }
              })()
            }
          >
            Dupliquer la séance
          </Button>
          <Button
            variant="ghost"
            block
            className="text-danger"
            icon={<Trash2 size={18} aria-hidden />}
            onClick={() => {
              setSettingsOpen(false)
              setDeleting(true)
            }}
          >
            Supprimer la séance
          </Button>
        </div>
      </SessionSheet>

      <ConfirmSheet
        open={deleting}
        onClose={() => {
          setDeleting(false)
        }}
        title={frenchSpacing('Supprimer la séance ?')}
        message={frenchSpacing(`« ${session.name} » et ses exercices seront retirés du programme.`)}
        confirmLabel="Supprimer"
        onConfirm={() =>
          void (async () => {
            // On quitte l'écran avant : la séance va disparaître.
            void navigate(programPath, { replace: true })
            if (await change((p) => removeSession(p, session.id), 'Suppression impossible.')) {
              toast('Séance supprimée')
            }
          })()
        }
      />
    </Page>
  )
}

/** Une séance du programme : ses exercices, à régler un par un. */
export function SessionPage() {
  const { id, sessionId } = useParams()
  const program = useProgram(id)
  const profile = useProfile()
  const context = useTrainingContext(program?.locationId ?? null)
  if (program === undefined || !context) return <PageSpinner />
  const session = program?.sessions.find((s) => s.id === sessionId)
  if (!program || !session) return <NotFound />
  return (
    <SessionContent
      program={program}
      session={session}
      context={context}
      scheme={schemeFor(program.focuses, profile.experience)}
    />
  )
}
