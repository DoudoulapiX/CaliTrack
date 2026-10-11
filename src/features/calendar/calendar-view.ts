import { itemTitle, type AgendaItem } from '@/content/calendar/agenda'
import { KIND_LABEL } from '@/content/calendar/event-form'
import type { EventKind, EventSeries, ProgramSession } from '@/db/types'
import { capitalize, formatDay, WEEKDAY_LONG, type ISODate } from '@/lib/dates'
import { joinFrench } from '@/lib/typography'
import { formatNumber } from '@/lib/units'
import { climbSubtitle } from '@/features/climbing/climb-view'
import { workoutSubtitle } from '@/features/workout/workout-view'

/** Couleurs de chaque genre (classes écrites en entier pour que Tailwind les garde). */
export const KIND_STYLE: Record<EventKind, { dot: string; ring: string; icon: string; soft: string }> = {
  program: { dot: 'bg-accent', ring: 'ring-accent', icon: 'text-accent-text', soft: 'bg-accent-soft' },
  climbing: { dot: 'bg-info', ring: 'ring-info', icon: 'text-info', soft: 'bg-info/15' },
  cardio: { dot: 'bg-success', ring: 'ring-success', icon: 'text-success', soft: 'bg-success/15' },
  custom: { dot: 'bg-warning', ring: 'ring-warning', icon: 'text-warning', soft: 'bg-warning/15' },
  rest: { dot: 'bg-ink-3', ring: 'ring-ink-3', icon: 'text-ink-3', soft: 'bg-surface-2' },
}

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning'

/** Étiquette de statut d'un élément (rien pour une séance simplement prévue). */
export function statusBadge(item: AgendaItem): { label: string; tone: BadgeTone } | null {
  switch (item.status) {
    case 'done':
      return { label: 'Faite', tone: 'success' }
    case 'active':
      return { label: 'En cours', tone: 'accent' }
    case 'missed':
      return item.type === 'program'
        ? { label: 'Manquée', tone: 'warning' }
        : { label: 'Pas notée', tone: 'neutral' }
    case 'skipped':
      return { label: item.type === 'program' ? 'Passée' : 'Annulée', tone: 'neutral' }
    case 'planned':
      return null
  }
}

/** Espace insécable entre un nombre et son unité : « 480 kcal » ne se coupe pas en fin de ligne. */
const NBSP = '\u00a0'

/** Durée, distance et calories d'une séance perso : « 18:30 · 45 min · 7,5 km · 480 kcal ». */
export function measuresLine(values: {
  time: string | null
  durationMin: number | null
  distanceKm?: number | null
  energyKcal?: number | null
}): string {
  return [
    values.time,
    values.durationMin ? `${formatNumber(values.durationMin, 0)}${NBSP}min` : null,
    values.distanceKm ? `${formatNumber(values.distanceKm, 2)}${NBSP}km` : null,
    values.energyKcal ? `${formatNumber(values.energyKcal, 0)}${NBSP}kcal` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Jour court pour une phrase : « dimanche 18 ». */
function shortDay(date: ISODate): string {
  return formatDay(date, 'EEEE d')
}

/** Sous-titre d'un élément de l'agenda (summary : description d'une séance du programme). */
export function itemSubtitle(item: AgendaItem, summary: (session: ProgramSession) => string): string {
  switch (item.type) {
    case 'program': {
      const workout = item.workout
      if (!workout) return summary(item.session)
      if (workout.status === 'active') return 'Commencée, à terminer'
      if (workout.date < item.date) return `Faite en avance, ${shortDay(workout.date)}`
      if (workout.date > item.date) return `Rattrapée ${shortDay(workout.date)}`
      return workoutSubtitle(workout)
    }
    case 'workout': {
      if (item.workout.status === 'active') return 'En cours'
      const line = workoutSubtitle(item.workout)
      return item.countsFor ? `Pour la séance du ${shortDay(item.countsFor)} · ${line}` : line
    }
    case 'climb':
      return climbSubtitle(item.climb)
    case 'event': {
      if (item.climb) return climbSubtitle(item.climb)
      const e = item.event
      const line = measuresLine(e)
      return line === '' ? KIND_LABEL[e.kind] : line
    }
    case 'occurrence': {
      if (item.climb) return climbSubtitle(item.climb)
      const line = measuresLine(item.series)
      return line === '' ? KIND_LABEL[item.series.kind] : line
    }
  }
}

/** « Chaque mardi et jeudi », « Toutes les 2 semaines, le samedi », avec la fin s'il y en a une. */
export function describeSeries(series: Pick<EventSeries, 'weekdays' | 'intervalWeeks' | 'endDate'>): string {
  const days = series.weekdays.map((d) => WEEKDAY_LONG[d])
  const every =
    series.intervalWeeks <= 1
      ? `Chaque ${joinFrench(days)}`
      : `Toutes les ${String(series.intervalWeeks)} semaines, ${joinFrench(days.map((d) => `le ${d}`))}`
  return series.endDate ? `${every}, jusqu’au ${formatDay(series.endDate, 'd MMMM yyyy')}` : every
}

/** Éléments qui méritent une pastille sur la grille du mois (pas ce qui a été annulé). */
export function dotItems(items: readonly AgendaItem[]): AgendaItem[] {
  return items.filter((item) => item.status !== 'skipped')
}

/** Ce que lit un lecteur d'écran sur un jour de la grille. */
export function dayLabel(date: ISODate, items: readonly AgendaItem[], today: ISODate): string {
  const parts = [capitalize(formatDay(date, 'EEEE d MMMM'))]
  if (date === today) parts.push('aujourd’hui')
  const shown = dotItems(items)
  if (shown.length > 0) {
    parts.push(
      shown
        .map((item) => {
          const badge = statusBadge(item)
          return badge ? `${itemTitle(item)} (${badge.label.toLowerCase()})` : itemTitle(item)
        })
        .join(', '),
    )
  }
  return parts.join(', ')
}
