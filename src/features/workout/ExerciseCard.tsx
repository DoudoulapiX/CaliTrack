import { useId, useState } from 'react'
import { Camera, Check, Ellipsis, Plus, Timer } from 'lucide-react'
import { needsLoad } from '@/content/programs/edit'
import { formatRest } from '@/content/programs/format'
import { countableVariant } from '@/content/reps/movements'
import {
  measureOf,
  setValue,
  suggestedValue,
  updateLoad,
  updateSet,
  type SetValues,
} from '@/content/workouts/workout'
import type { Exercise, ExerciseMeasure, Workout, WorkoutExercise, WorkoutSet } from '@/db/types'
import { cn } from '@/lib/cn'
import type { WeightUnit } from '@/lib/units'
import { Button, IconButton } from '@/ui/Button'
import { NumberInput } from '@/ui/Field'
import { ExerciseThumb } from '@/features/library/ExerciseThumb'
import type { CueOptions } from './cues'
import { HoldSheet } from './HoldSheet'
import { useSavedNumber } from './useSavedNumber'
import { exerciseAnchor, loadFromDisplay, loadToDisplay, prescriptionOf, typedLoad } from './workout-view'

/** Bornes de saisie d'une série. */
const MAX_REPS = 500
const MAX_SEC = 3600
const MAX_LOAD = 1000

/** Enregistre une modification de la séance (et signale un échec). */
export type SaveWorkout = (change: (workout: Workout) => Workout) => Promise<Workout>

/** Colonnes fixes : les champs restent alignés d'une série à l'autre (chrono ou non, faite ou non). */
const COLUMNS = {
  reps: 'grid-cols-[1.5rem_1fr_3rem]',
  repsWithLoad: 'grid-cols-[1.5rem_1fr_1fr_3rem]',
  time: 'grid-cols-[1.5rem_1fr_5.5rem]',
  timeWithLoad: 'grid-cols-[1.5rem_1fr_1fr_5.5rem]',
} as const

function columns(measure: ExerciseMeasure, withLoad: boolean): string {
  if (measure === 'time') return withLoad ? COLUMNS.timeWithLoad : COLUMNS.time
  return withLoad ? COLUMNS.repsWithLoad : COLUMNS.reps
}

function SetRow({
  exercise,
  set,
  index,
  name,
  measure,
  unit,
  withLoad,
  current,
  cues,
  save,
  onComplete,
  onReopen,
}: {
  exercise: WorkoutExercise
  set: WorkoutSet
  index: number
  name: string
  measure: ExerciseMeasure
  unit: WeightUnit
  withLoad: boolean
  current: boolean
  cues: CueOptions
  save: SaveWorkout
  onComplete: (values: SetValues) => void
  onReopen: () => void
}) {
  const inputId = useId()
  const [holding, setHolding] = useState(false)
  const label = `${name}, série ${String(index + 1)}`
  const suggested = suggestedValue(exercise, index, measure)
  const [value, changeValue] = useSavedNumber(setValue(set, measure), (next) =>
    save((w) =>
      updateSet(w, exercise.id, set.id, measure === 'time' ? { durationSec: next } : { reps: next }),
    ),
  )
  const [load, changeLoad] = useSavedNumber(loadToDisplay(set.loadKg, unit), (next) =>
    save((w) => updateLoad(w, exercise.id, set.id, loadFromDisplay(next, unit))),
  )

  const withValues = (main: number): SetValues => {
    const values: SetValues = measure === 'time' ? { durationSec: main } : { reps: main }
    if (withLoad) values.loadKg = loadFromDisplay(load, unit)
    return values
  }

  const toggle = () => {
    if (set.done) {
      onReopen()
      return
    }
    // Rien de tapé : la valeur proposée (celle de la série d'avant, ou l'objectif).
    const done = value ?? suggested
    if (done === null) {
      document.getElementById(inputId)?.focus()
      return
    }
    onComplete(withValues(done))
  }

  return (
    <li
      className={cn(
        'grid items-center gap-2 rounded-xl py-1 pr-1 pl-0.5 transition-colors',
        columns(measure, withLoad),
        set.done && 'bg-success/10',
        current && 'ring-2 ring-accent',
      )}
    >
      <span aria-hidden className="text-center text-[15px] font-semibold text-ink-3 tabular">
        {index + 1}
      </span>
      <NumberInput
        id={inputId}
        value={value}
        onChange={changeValue}
        min={0}
        max={measure === 'time' ? MAX_SEC : MAX_REPS}
        placeholder={suggested === null ? undefined : String(suggested)}
        suffix={measure === 'time' ? 's' : 'rép.'}
        ariaLabel={`${label} : ${measure === 'time' ? 'secondes' : 'répétitions'}`}
        inputClassName="pl-3"
      />
      {withLoad && (
        <NumberInput
          value={load}
          onChange={(next) => {
            changeLoad(typedLoad(next, unit))
          }}
          decimal
          min={0}
          max={MAX_LOAD}
          suffix={unit}
          ariaLabel={`${label} : charge en ${unit}`}
          inputClassName="pl-3"
        />
      )}
      <div className="flex items-center justify-end gap-1">
        {measure === 'time' && !set.done && (
          <IconButton
            label={`${label} : chrono`}
            variant="filled"
            size="sm"
            onClick={() => {
              setHolding(true)
            }}
          >
            <Timer size={18} aria-hidden />
          </IconButton>
        )}
        <button
          type="button"
          aria-pressed={set.done}
          aria-label={`${label} faite`}
          onClick={toggle}
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-full transition-colors',
            set.done ? 'bg-success text-canvas' : 'bg-surface-2 text-ink-3 active:bg-surface-3',
          )}
        >
          <Check size={22} strokeWidth={2.6} aria-hidden />
        </button>
      </div>
      {measure === 'time' && (
        <HoldSheet
          open={holding}
          title={label}
          targetSec={value ?? suggested}
          cues={cues}
          onClose={() => {
            setHolding(false)
          }}
          onStop={(seconds) => {
            setHolding(false)
            onComplete(withValues(seconds))
          }}
        />
      )}
    </li>
  )
}

export interface ExerciseCardProps {
  exercise: WorkoutExercise
  definition: Exercise | undefined
  unit: WeightUnit
  /** Série à faire maintenant (mise en avant). */
  currentSetId: string | null
  /** Colonne de charge ajoutée depuis les options. */
  forceLoad: boolean
  cues: CueOptions
  save: SaveWorkout
  onComplete: (set: WorkoutSet, values: SetValues) => void
  onReopen: (set: WorkoutSet) => void
  onAddSet: () => void
  onOptions: () => void
  /** Compte la première série à faire avec la caméra (séance en cours, exercice compté). */
  onCount?: () => void
}

/** Un exercice de la séance : ses séries à remplir et à cocher. */
export function ExerciseCard({
  exercise,
  definition,
  unit,
  currentSetId,
  forceLoad,
  cues,
  save,
  onComplete,
  onReopen,
  onAddSet,
  onOptions,
  onCount,
}: ExerciseCardProps) {
  const headingId = useId()
  const name = definition?.name ?? 'Exercice supprimé'
  const measure = measureOf(exercise, definition?.measure ?? 'reps')
  const withLoad =
    forceLoad ||
    exercise.sets.some((set) => set.loadKg !== null) ||
    (definition !== undefined && needsLoad(definition))
  const detail = [prescriptionOf(exercise, unit, definition?.unilateral), formatRest(exercise.restSec)]
    .filter(Boolean)
    .join(' · ')
  const countable =
    onCount !== undefined &&
    countableVariant(exercise.exerciseId, measure) !== null &&
    exercise.sets.some((set) => !set.done)

  return (
    <article
      id={exerciseAnchor(exercise.id)}
      aria-labelledby={headingId}
      className="scroll-mt-[calc(var(--safe-top)+7.5rem)] rounded-2xl bg-surface p-3"
    >
      <div className="mb-2 flex items-start gap-3">
        {definition && <ExerciseThumb exercise={definition} className="size-11" />}
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 id={headingId} className="text-[16px] leading-snug font-semibold text-ink">
            {name}
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-3">{detail}</p>
          {exercise.note && <p className="mt-1 text-[13px] text-ink-2 italic">{exercise.note}</p>}
        </div>
        <IconButton label={`Options : ${name}`} size="sm" variant="filled" onClick={onOptions}>
          <Ellipsis size={18} aria-hidden />
        </IconButton>
      </div>
      <div
        aria-hidden
        className={cn(
          'grid gap-2 pr-1 pb-1 pl-0.5 text-[12px] font-semibold tracking-wide text-ink-3 uppercase',
          columns(measure, withLoad),
        )}
      >
        <span />
        <span className="pl-1">{measure === 'time' ? 'Secondes' : 'Répétitions'}</span>
        {withLoad && <span className="pl-1">Charge</span>}
        <span />
      </div>
      <ol className="flex flex-col gap-1.5">
        {exercise.sets.map((set, index) => (
          <SetRow
            key={set.id}
            exercise={exercise}
            set={set}
            index={index}
            name={name}
            measure={measure}
            unit={unit}
            withLoad={withLoad}
            current={set.id === currentSetId}
            cues={cues}
            save={save}
            onComplete={(values) => {
              onComplete(set, values)
            }}
            onReopen={() => {
              onReopen(set)
            }}
          />
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" icon={<Plus size={16} aria-hidden />} onClick={onAddSet}>
          Ajouter une série
        </Button>
        {countable && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Camera size={16} aria-hidden />}
            aria-label={`Compter à la caméra : ${name}`}
            onClick={onCount}
          >
            Compter à la caméra
          </Button>
        )}
      </div>
    </article>
  )
}
