import type { PendingSet, SetValues } from '@/content/workouts/workout'
import { FIXTURE_JOINTS } from '@/content/reps/fixture'
import type { CountedVariant } from '@/content/reps/types'
import type { Workout, WorkoutExercise, WorkoutSet } from '@/db/types'
import { Sheet } from '@/ui/Sheet'
import type { CueOptions } from '../cues'
import type { SaveWorkout } from '../ExerciseCard'
import { usePoseCamera } from './usePoseCamera'

export interface RepCounterSheetProps {
  readonly workout: Workout
  /** La ligne de la séance, à jour (la séance ne rend plus la feuille si elle disparaît). */
  readonly exercise: WorkoutExercise
  readonly exerciseName: string
  readonly variant: CountedVariant
  readonly cues: CueOptions
  /** Coche la série (repos lancé, compté depuis restFrom) ; rend la série suivante de la séance. */
  readonly onComplete: (set: WorkoutSet, values: SetValues, restFrom?: number) => Promise<PendingSet | null>
  readonly save: SaveWorkout
  readonly onClose: () => void
}

const ignore = () => undefined

/** Rang de la série comptée : la première à faire, sinon la dernière. */
function countedIndex(exercise: WorkoutExercise): number {
  const pending = exercise.sets.findIndex((set) => !set.done)
  return pending === -1 ? Math.max(0, exercise.sets.length - 1) : pending
}

/**
 * Le compteur caméra d'une série, en feuille plein écran. Version d'attente : la feuille s'ouvre et se ferme,
 * la caméra ne démarre pas encore. Les props restent celles-ci.
 */
export function RepCounterSheet({ exercise, exerciseName, onClose }: RepCounterSheetProps) {
  usePoseCamera({
    open: true,
    cameraOn: false,
    analysing: false,
    facing: 'user',
    delegate: 'CPU',
    joints: FIXTURE_JOINTS,
    onFrame: ignore,
    onHidden: ignore,
  })

  return (
    <Sheet
      open
      tall
      guardClose
      title={`${exerciseName}, série ${String(countedIndex(exercise) + 1)}`}
      onClose={onClose}
    >
      <p role="status" className="py-6 text-center text-[15px] text-ink-2">
        Préparation du compteur…
      </p>
    </Sheet>
  )
}
