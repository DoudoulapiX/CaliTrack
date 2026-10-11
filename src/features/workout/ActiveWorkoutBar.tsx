import { Link } from 'react-router'
import { ChevronRight, Dumbbell } from 'lucide-react'
import type { Workout } from '@/db/types'
import { formatClock } from '@/lib/dates'
import { restRemainingSec, useRest } from './rest-timer'
import { useNow } from './useNow'
import { workoutPath } from './useWorkouts'
import { formatElapsed } from './workout-view'

function Clock({ workout }: { workout: Workout }) {
  const rest = useRest()
  const now = useNow(1000)
  const resting = rest?.workoutId === workout.id ? rest : null
  return (
    <span className="text-[15px] font-semibold tabular">
      {resting
        ? `Repos ${formatClock(restRemainingSec(resting, now))}`
        : formatElapsed((now - Date.parse(workout.startedAt)) / 1000)}
    </span>
  )
}

/**
 * Barre « séance en cours », posée au-dessus des onglets (dans la même barre) : on peut naviguer,
 * puis revenir à la séance.
 */
export function ActiveWorkoutBar({ workout }: { workout: Workout }) {
  return (
    <div className="mx-auto h-[var(--workout-bar-height)] max-w-xl px-2 pt-2">
      <Link
        to={workoutPath(workout.id)}
        aria-label={`Reprendre la séance en cours : ${workout.title}`}
        className="flex h-full items-center gap-3 rounded-2xl bg-accent px-3 text-accent-ink active:opacity-90"
      >
        <Dumbbell size={20} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-tight font-semibold tracking-wide uppercase opacity-80">
            Séance en cours
          </span>
          <span className="block truncate text-[15px] leading-tight font-semibold">{workout.title}</span>
        </span>
        <Clock workout={workout} />
        <ChevronRight size={18} className="shrink-0" aria-hidden />
      </Link>
    </div>
  )
}
