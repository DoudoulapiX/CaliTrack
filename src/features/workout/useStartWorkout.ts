import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { Workout } from '@/db/types'
import { deleteWorkout, startWorkout, WorkoutInProgressError } from '@/db/workouts'
import { userMessage } from '@/lib/errors'
import { useToast } from '@/ui/toast-context'
import { skipRest } from './rest-timer'
import { workoutPath } from './useWorkouts'

/** Une autre séance est déjà en cours : on la reprend, ou on l'abandonne pour commencer la nouvelle. */
export interface StartConflict {
  active: Workout
  /** Prépare la nouvelle séance (à l'heure où on la commence vraiment). */
  build: () => Workout
}

export interface WorkoutStarter {
  start: (build: () => Workout) => void
  busy: boolean
  conflict: StartConflict | null
  resume: () => void
  replace: () => void
  dismiss: () => void
}

/** Commence une séance et ouvre son écran ; signale une séance déjà en cours. */
export function useStartWorkout(): WorkoutStarter {
  const navigate = useNavigate()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [conflict, setConflict] = useState<StartConflict | null>(null)

  const start = async (build: () => Workout) => {
    setBusy(true)
    try {
      const workout = await startWorkout(build())
      skipRest()
      setConflict(null)
      void navigate(workoutPath(workout.id))
    } catch (error) {
      if (error instanceof WorkoutInProgressError) setConflict({ active: error.active, build })
      else toast(userMessage(error, 'Impossible de commencer la séance.'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return {
    start: (build) => void start(build),
    busy,
    conflict,
    resume: () => {
      if (!conflict) return
      setConflict(null)
      void navigate(workoutPath(conflict.active.id))
    },
    replace: () => {
      if (!conflict) return
      const { active, build } = conflict
      void (async () => {
        try {
          await deleteWorkout(active.id)
        } catch (error) {
          toast(userMessage(error, 'Impossible d’abandonner la séance en cours.'), 'error')
          return
        }
        await start(build)
      })()
    },
    dismiss: () => {
      setConflict(null)
    },
  }
}
