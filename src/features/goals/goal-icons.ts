import { Dumbbell, Flag, Mountain, Sparkles, Weight, type LucideIcon } from 'lucide-react'
import type { GoalKind } from '@/db/types'

/** Icône de chaque genre d'objectif. */
export const GOAL_ICON: Record<GoalKind, LucideIcon> = {
  skill: Sparkles,
  exercise: Dumbbell,
  bodyweight: Weight,
  climbing: Mountain,
  custom: Flag,
}

/** Couleurs de l'icône (classes écrites en entier pour que Tailwind les garde). */
export const GOAL_STYLE: Record<GoalKind, { icon: string; soft: string }> = {
  skill: { icon: 'text-accent-text', soft: 'bg-accent-soft' },
  exercise: { icon: 'text-warning', soft: 'bg-warning/15' },
  bodyweight: { icon: 'text-success', soft: 'bg-success/15' },
  climbing: { icon: 'text-info', soft: 'bg-info/15' },
  custom: { icon: 'text-ink-2', soft: 'bg-surface-2' },
}
