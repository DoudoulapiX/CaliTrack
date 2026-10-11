import type { CalendarEvent, EventKind, EventSeries, EventStatus } from '@/db/types'
import { isISODate, isValidTime, weekdayOf, type ISODate, type Weekday } from '@/lib/dates'

/*
 * Formulaire d'une séance perso (escalade, course Garmin, autre, repos) : ponctuelle, ou répétée
 * chaque semaine sur certains jours. Fonctions sans effet de bord, testées à part.
 */

/** Genres qu'on ajoute soi-même (les séances du programme viennent du programme). */
export type PersonalKind = Exclude<EventKind, 'program'>

export interface KindOption {
  value: PersonalKind
  label: string
  /** Nom proposé pour une nouvelle séance de ce genre. */
  title: string
}

export const PERSONAL_KINDS: readonly KindOption[] = [
  { value: 'cardio', label: 'Cardio', title: 'Course à pied' },
  { value: 'climbing', label: 'Escalade', title: 'Escalade' },
  { value: 'custom', label: 'Autre', title: 'Séance' },
  { value: 'rest', label: 'Repos', title: 'Repos' },
]

/** Activités cardio proposées (une séance Garmin en deux touches). */
export const CARDIO_ACTIVITIES = [
  'Course à pied',
  'Vélo',
  'Natation',
  'Marche',
  'Randonnée',
  'Rameur',
] as const

export const KIND_LABEL: Record<EventKind, string> = {
  program: 'Programme',
  climbing: 'Escalade',
  cardio: 'Cardio',
  custom: 'Autre',
  rest: 'Repos',
}

export const MAX_INTERVAL_WEEKS = 4

export interface EventDraft {
  kind: PersonalKind
  title: string
  /** Le jour de la séance ; pour une série, le premier jour possible. */
  date: ISODate
  /** « HH:MM », ou vide : pas d'heure. */
  time: string
  durationMin: number | null
  distanceKm: number | null
  energyKcal: number | null
  notes: string
  status: EventStatus
  repeat: boolean
  weekdays: Weekday[]
  intervalWeeks: number
  /** Dernier jour de la série, ou vide : sans fin. */
  endDate: string
}

function kindOption(kind: PersonalKind): KindOption {
  return (
    PERSONAL_KINDS.find((k) => k.value === kind) ?? {
      value: kind,
      label: KIND_LABEL[kind],
      title: KIND_LABEL[kind],
    }
  )
}

/** Nom proposé automatiquement (on peut alors le remplacer en changeant de genre ou d'activité). */
export function isSuggestedTitle(title: string): boolean {
  const t = title.trim()
  return t === '' || PERSONAL_KINDS.some((k) => k.title === t) || CARDIO_ACTIVITIES.some((a) => a === t)
}

/** Une séance passée ou du jour est notée comme faite ; une séance à venir est prévue. */
function defaultStatus(date: ISODate, today: ISODate): EventStatus {
  return date <= today ? 'done' : 'planned'
}

export function newEventDraft(date: ISODate, today: ISODate, kind: PersonalKind = 'cardio'): EventDraft {
  return {
    kind,
    title: kindOption(kind).title,
    date,
    time: '',
    durationMin: null,
    distanceKm: null,
    energyKcal: null,
    notes: '',
    status: defaultStatus(date, today),
    repeat: false,
    weekdays: [weekdayOf(date)],
    intervalWeeks: 1,
    endDate: '',
  }
}

function asPersonal(kind: EventKind): PersonalKind {
  return kind === 'program' ? 'custom' : kind
}

export function draftFromEvent(event: CalendarEvent): EventDraft {
  return {
    kind: asPersonal(event.kind),
    title: event.title,
    date: event.date,
    time: event.time ?? '',
    durationMin: event.durationMin,
    distanceKm: event.distanceKm,
    energyKcal: event.energyKcal,
    notes: event.notes,
    status: event.status,
    repeat: false,
    weekdays: [weekdayOf(event.date)],
    intervalWeeks: 1,
    endDate: '',
  }
}

export function draftFromSeries(series: EventSeries): EventDraft {
  return {
    kind: asPersonal(series.kind),
    title: series.title,
    date: series.startDate,
    time: series.time ?? '',
    durationMin: series.durationMin,
    distanceKm: null,
    energyKcal: null,
    notes: series.notes,
    status: 'planned',
    repeat: true,
    weekdays: [...series.weekdays],
    intervalWeeks: series.intervalWeeks,
    endDate: series.endDate ?? '',
  }
}

/** Change de genre ; le nom suit tant qu'il n'a pas été personnalisé. */
export function withKind(draft: EventDraft, kind: PersonalKind): EventDraft {
  return { ...draft, kind, title: isSuggestedTitle(draft.title) ? kindOption(kind).title : draft.title }
}

/**
 * Change de jour. Une séance à venir ne peut pas être déjà faite ; une série qui ne tombait que ce
 * jour de la semaine suit le nouveau jour.
 */
export function withDate(draft: EventDraft, date: ISODate, today: ISODate): EventDraft {
  const next = { ...draft, date }
  if (isISODate(date)) {
    if (date > today && draft.status === 'done') next.status = 'planned'
    if (isISODate(draft.date) && draft.weekdays.length === 1 && draft.weekdays[0] === weekdayOf(draft.date)) {
      next.weekdays = [weekdayOf(date)]
    }
  }
  return next
}

/** Ce qui empêche d'enregistrer, ou null. */
export function draftError(draft: EventDraft, today: ISODate): string | null {
  if (draft.title.trim() === '') return 'Donne un nom à cette séance.'
  if (!isISODate(draft.date)) return 'Choisis un jour.'
  if (draft.time !== '' && !isValidTime(draft.time)) return 'L’heure n’est pas valide.'
  if (draft.repeat) {
    if (draft.weekdays.length === 0) return 'Choisis au moins un jour de la semaine.'
    if (draft.endDate !== '' && (!isISODate(draft.endDate) || draft.endDate < draft.date)) {
      return 'La date de fin doit venir après le premier jour.'
    }
  } else if (draft.status === 'done' && draft.date > today) {
    return 'Une séance à venir ne peut pas être déjà faite.'
  }
  return null
}

/** Valeurs gardées selon le genre (pas de distance hors cardio, rien à mesurer pour un repos). */
function measures(draft: EventDraft) {
  if (draft.kind === 'rest') return { durationMin: null, distanceKm: null, energyKcal: null }
  return {
    durationMin: draft.durationMin,
    distanceKm: draft.kind === 'cardio' ? draft.distanceKm : null,
    energyKcal: draft.energyKcal,
  }
}

/** La séance ponctuelle à enregistrer (base : celle qu'on modifie, ou null pour une nouvelle). */
export function eventFromDraft(
  draft: EventDraft,
  base: CalendarEvent | null,
  now: string,
  newId: () => string,
): CalendarEvent {
  return {
    id: base?.id ?? newId(),
    date: draft.date,
    time: draft.time === '' ? null : draft.time,
    kind: draft.kind,
    title: draft.title.trim(),
    ...measures(draft),
    programId: base?.programId ?? null,
    programSessionId: base?.programSessionId ?? null,
    seriesId: base?.seriesId ?? null,
    status: draft.status,
    workoutId: base?.workoutId ?? null,
    climbingSessionId: base?.climbingSessionId ?? null,
    notes: draft.notes.trim(),
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  }
}

/** La série à enregistrer (base : celle qu'on modifie, ou null pour une nouvelle). */
export function seriesFromDraft(
  draft: EventDraft,
  base: EventSeries | null,
  now: string,
  newId: () => string,
): EventSeries {
  return {
    id: base?.id ?? newId(),
    kind: draft.kind,
    title: draft.title.trim(),
    weekdays: [...new Set(draft.weekdays)].sort((a, b) => a - b),
    intervalWeeks: Math.min(MAX_INTERVAL_WEEKS, Math.max(1, Math.round(draft.intervalWeeks))),
    startDate: draft.date,
    endDate: draft.endDate === '' ? null : draft.endDate,
    time: draft.time === '' ? null : draft.time,
    durationMin: measures(draft).durationMin,
    notes: draft.notes.trim(),
    createdAt: base?.createdAt ?? now,
    updatedAt: now,
  }
}

/** Le jour d'une série, noté à part (faite, annulée…) avec les valeurs de la série. */
export function occurrenceEvent(
  series: EventSeries,
  date: ISODate,
  status: EventStatus,
  now: string,
  newId: () => string,
): CalendarEvent {
  return {
    id: newId(),
    date,
    time: series.time,
    kind: series.kind,
    title: series.title,
    durationMin: series.durationMin,
    programId: null,
    programSessionId: null,
    seriesId: series.id,
    status,
    workoutId: null,
    climbingSessionId: null,
    energyKcal: null,
    distanceKm: null,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
}
