import { useState } from 'react'
import { ArrowDown, ArrowUp, BookOpen, Minus, Replace, Trash2, Weight } from 'lucide-react'
import { blockUsesLadder, findSlot, ladderIdFor, newSlot } from '@/content/programs/edit'
import { ladderFor } from '@/content/programs/ladders'
import { slotStepIndex } from '@/content/programs/progression'
import type { TrainingContext } from '@/content/programs/resolve'
import type { Scheme } from '@/content/programs/schemes'
import { targetForStep } from '@/content/programs/targets'
import {
  moveExercise,
  removeExercise,
  removeSet,
  replaceExercise,
  setExerciseNote,
} from '@/content/workouts/workout'
import type { Exercise, Program, Workout, WorkoutExercise } from '@/db/types'
import { newId } from '@/lib/ids'
import { frenchSpacing } from '@/lib/typography'
import { Button } from '@/ui/Button'
import { TextAreaField } from '@/ui/Field'
import { ListGroup, ListRow } from '@/ui/List'
import { Sheet } from '@/ui/Sheet'
import { useToast } from '@/ui/toast-context'
import { ExercisePicker } from '@/features/training/ExercisePicker'
import { useCatalog } from '@/features/library/catalog-context'
import type { SaveWorkout } from './ExerciseCard'
import { blockFor } from './workout-view'

/** Changer l'exercice de la séance : échelons de sa progression en premier, puis tout le répertoire. */
function ReplacePicker({
  exercise,
  definition,
  program,
  context,
  scheme,
  save,
  onDone,
}: {
  exercise: WorkoutExercise
  definition: Exercise | undefined
  program: Program | null
  context: TrainingContext
  scheme: Scheme
  save: SaveWorkout
  onDone: () => void
}) {
  const toast = useToast()
  const planned = program && exercise.slotId ? findSlot(program, exercise.slotId) : null
  const blockKind = exercise.block ?? (definition ? blockFor(definition) : 'strength')
  const plannedLadderId = planned?.slot.ladderId ?? null
  // Progression proposée : celle de l'exercice en cours, sinon celle prévue au programme.
  const ladderId = blockUsesLadder(blockKind)
    ? (ladderIdFor(exercise.exerciseId, plannedLadderId) ?? plannedLadderId)
    : null
  const ladder = ladderFor(ladderId)
  const step =
    ladder && exercise.target
      ? slotStepIndex(ladder, { exerciseId: exercise.exerciseId, target: exercise.target })
      : -1

  const pick = (chosen: Exercise, stepIndex?: number) => {
    // L'exercice en cours, choisi de nouveau : rien ne change.
    if (chosen.id === exercise.exerciseId && (stepIndex === undefined || stepIndex === step)) {
      onDone()
      return
    }
    const fresh = newSlot(chosen, blockKind, { scheme, loadsOf: context.loadsOf, newId }, ladderId)
    // Échelon choisi dans la progression : son objectif à lui (muscle-up : 1, puis 5).
    const target =
      ladder && stepIndex !== undefined && fresh.ladderId === ladder.id
        ? targetForStep(ladder, stepIndex, chosen, scheme)
        : fresh.target
    onDone()
    save((w) => replaceExercise(w, exercise.id, chosen.id, target, fresh.loadKg)).then(
      () => {
        toast(frenchSpacing(`« ${chosen.name} » à la place`))
      },
      () => undefined,
    )
  }

  return (
    <ExercisePicker
      ladderId={ladderId}
      currentId={exercise.exerciseId}
      currentStep={step >= 0 ? step : null}
      kinds={context.kinds}
      onPick={pick}
    />
  )
}

function ActionsMenu({
  workout,
  exercise,
  definition,
  loadShown,
  save,
  onReplace,
  onAddLoad,
  onClose,
}: {
  workout: Workout
  exercise: WorkoutExercise
  definition: Exercise | undefined
  loadShown: boolean
  save: SaveWorkout
  onReplace: () => void
  onAddLoad: () => void
  onClose: () => void
}) {
  const toast = useToast()
  // La note s'écrit ici et s'enregistre au fil de la frappe.
  const [note, setNote] = useState(exercise.note)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const index = workout.exercises.findIndex((e) => e.id === exercise.id)
  const done = exercise.sets.filter((set) => set.done).length
  const last = exercise.sets.at(-1)
  const ignore = () => undefined

  return (
    <div className="flex flex-col gap-5">
      <ListGroup>
        <ListRow
          title="Changer d’exercice"
          subtitle={
            done > 0
              ? `Les séries cochées seront effacées`
              : frenchSpacing('Matériel pris, trop dur, trop facile…')
          }
          leading={<Replace size={20} aria-hidden />}
          onClick={onReplace}
        />
        {definition && (
          <ListRow
            title="Voir la fiche"
            leading={<BookOpen size={20} aria-hidden />}
            to={`/library/${definition.id}`}
          />
        )}
        {index > 0 && (
          <ListRow
            title="Monter dans la séance"
            leading={<ArrowUp size={20} aria-hidden />}
            chevron={false}
            onClick={() => {
              save((w) => moveExercise(w, exercise.id, -1)).catch(ignore)
            }}
          />
        )}
        {index >= 0 && index < workout.exercises.length - 1 && (
          <ListRow
            title="Descendre dans la séance"
            leading={<ArrowDown size={20} aria-hidden />}
            chevron={false}
            onClick={() => {
              save((w) => moveExercise(w, exercise.id, 1)).catch(ignore)
            }}
          />
        )}
        {!loadShown && (
          <ListRow
            title="Ajouter une charge"
            subtitle="Lest, haltère, kettlebell…"
            leading={<Weight size={20} aria-hidden />}
            chevron={false}
            onClick={() => {
              onAddLoad()
              onClose()
            }}
          />
        )}
        {last && exercise.sets.length > 1 && (
          <ListRow
            title="Retirer la dernière série"
            leading={<Minus size={20} aria-hidden />}
            chevron={false}
            onClick={() => {
              save((w) => removeSet(w, exercise.id, last.id)).catch(ignore)
            }}
          />
        )}
      </ListGroup>

      <TextAreaField
        label="Note pour cet exercice"
        value={note}
        onChange={(value) => {
          setNote(value)
          save((w) => setExerciseNote(w, exercise.id, value.trim())).catch(ignore)
        }}
        placeholder={frenchSpacing('Prise, réglage, sensation…')}
        maxLength={500}
      />

      {confirmRemove ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-3">
          <p className="text-[14px] text-ink-2">
            {frenchSpacing(
              done > 0
                ? 'Retirer cet exercice et ses séries cochées de la séance ?'
                : 'Retirer cet exercice de la séance ?',
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmRemove(false)
              }}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onClose()
                save((w) => removeExercise(w, exercise.id)).then(() => {
                  toast('Exercice retiré')
                }, ignore)
              }}
            >
              Retirer
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          block
          className="text-danger"
          icon={<Trash2 size={18} aria-hidden />}
          onClick={() => {
            setConfirmRemove(true)
          }}
        >
          Retirer de la séance
        </Button>
      )}
    </div>
  )
}

/** Options d'un exercice de la séance (ouvertes quand `exerciseId` est donné). */
export function ExerciseActionsSheet({
  workout,
  exerciseId,
  program,
  context,
  scheme,
  loadShown,
  save,
  onAddLoad,
  onClose,
}: {
  workout: Workout
  exerciseId: string | null
  program: Program | null
  context: TrainingContext
  scheme: Scheme
  /** La colonne de charge est-elle déjà affichée pour cet exercice ? */
  loadShown: boolean
  save: SaveWorkout
  onAddLoad: (exerciseId: string) => void
  onClose: () => void
}) {
  const catalog = useCatalog()
  const [picking, setPicking] = useState(false)
  const exercise = exerciseId ? workout.exercises.find((e) => e.id === exerciseId) : undefined
  const definition = exercise ? catalog.byId.get(exercise.exerciseId) : undefined
  const close = () => {
    setPicking(false)
    onClose()
  }

  return (
    <Sheet
      open={exercise !== undefined}
      onClose={close}
      title={picking ? 'Changer d’exercice' : (definition?.name ?? 'Exercice')}
      tall={picking}
      scrollKey={picking ? 'picker' : 'menu'}
    >
      {exercise &&
        (picking ? (
          <ReplacePicker
            exercise={exercise}
            definition={definition}
            program={program}
            context={context}
            scheme={scheme}
            save={save}
            onDone={close}
          />
        ) : (
          <ActionsMenu
            key={exercise.id}
            workout={workout}
            exercise={exercise}
            definition={definition}
            loadShown={loadShown}
            save={save}
            onReplace={() => {
              setPicking(true)
            }}
            onAddLoad={() => {
              onAddLoad(exercise.id)
            }}
            onClose={close}
          />
        ))}
    </Sheet>
  )
}
