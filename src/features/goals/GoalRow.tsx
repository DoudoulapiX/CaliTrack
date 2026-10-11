import { Link } from 'react-router'
import { ChevronRight, Pin } from 'lucide-react'
import type { GoalProgress } from '@/content/goals/progress'
import type { Goal, GoalKind } from '@/db/types'
import { cn } from '@/lib/cn'
import { ProgressBar } from '@/ui/Controls'
import { GOAL_ICON, GOAL_STYLE } from './goal-icons'
import { goalPath, percentLabel, percentOf } from './goal-view'

/** L'icône d'un genre d'objectif, dans une pastille colorée. */
export function GoalIcon({ kind, size = 'md' }: { kind: GoalKind; size?: 'md' | 'lg' }) {
  const Icon = GOAL_ICON[kind]
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        size === 'md' ? 'size-10 rounded-xl' : 'size-12 rounded-2xl',
        GOAL_STYLE[kind].soft,
      )}
    >
      <Icon size={size === 'md' ? 20 : 24} className={GOAL_STYLE[kind].icon} aria-hidden />
    </span>
  )
}

/** Barre d'avancement : couleur d'accent, verte une fois l'objectif atteint. */
export function GoalBar({
  progress,
  label,
  size = 'sm',
}: {
  progress: Pick<GoalProgress, 'ratio' | 'achieved'>
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <ProgressBar
      value={percentOf(progress)}
      label={label}
      size={size}
      color={progress.achieved ? 'var(--color-success)' : undefined}
    />
  )
}

/**
 * Un objectif dans une liste : titre, où il en est et sa barre. Une épingle signale ceux affichés sur
 * l'accueil, sauf sur l'accueil lui-même (`pinMark` à false).
 */
export function GoalRow({
  goal,
  progress,
  line,
  pinMark = true,
}: {
  goal: Goal
  progress: GoalProgress
  line: string
  pinMark?: boolean
}) {
  const percent = percentLabel(progress)
  // Un objectif archivé ne s'affiche plus sur l'accueil, même épinglé.
  const onHome = pinMark && goal.pinned && !goal.archived
  return (
    <li>
      <Link
        to={goalPath(goal.id)}
        aria-label={`${goal.title}${onHome ? ' (sur l’accueil)' : ''} : ${line}, ${percent}`}
        className="flex items-center gap-3 px-4 py-3 active:bg-surface-2"
      >
        <GoalIcon kind={goal.kind} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[16px] font-medium text-ink">{goal.title}</span>
            {onHome && <Pin size={13} className="shrink-0 text-ink-3" aria-hidden />}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-ink-3">{line}</span>
          <span className="mt-2 flex items-center gap-2">
            <GoalBar progress={progress} label={`Avancement de « ${goal.title} »`} />
            <span className="w-10 shrink-0 text-right text-[13px] font-semibold text-ink-2 tabular">
              {percent}
            </span>
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  )
}
