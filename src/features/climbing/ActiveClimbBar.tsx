import { Link } from 'react-router'
import { ChevronRight, Mountain } from 'lucide-react'
import type { ClimbingSession } from '@/db/types'
import { frenchSpacing } from '@/lib/typography'
import { useNow } from '@/features/workout/useNow'
import { formatElapsed } from '@/features/workout/workout-view'
import { climbLivePath } from './climb-view'

function Clock({ session }: { session: ClimbingSession }) {
  const now = useNow(1000)
  return (
    <span className="text-[15px] font-semibold tabular">
      {formatElapsed((now - Date.parse(session.startedAt)) / 1000)}
    </span>
  )
}

/**
 * Barre « escalade en cours », posée au-dessus des onglets comme celle d'une séance de muscu : on
 * peut naviguer, puis revenir à la séance.
 */
export function ActiveClimbBar({ session }: { session: ClimbingSession }) {
  const title = session.gym === '' ? 'Escalade' : session.gym
  return (
    <div className="mx-auto h-[var(--workout-bar-height)] max-w-xl px-2 pt-2">
      <Link
        to={climbLivePath(session.id)}
        aria-label={frenchSpacing(`Reprendre la séance d’escalade en cours : ${title}`)}
        className="flex h-full items-center gap-3 rounded-2xl bg-accent px-3 text-accent-ink active:opacity-90"
      >
        <Mountain size={20} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] leading-tight font-semibold tracking-wide uppercase opacity-80">
            Escalade en cours
          </span>
          <span className="block truncate text-[15px] leading-tight font-semibold">{title}</span>
        </span>
        <Clock session={session} />
        <ChevronRight size={18} className="shrink-0" aria-hidden />
      </Link>
    </div>
  )
}
