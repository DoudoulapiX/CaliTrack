import { compareSessions } from '@/content/climbing/session'
import type {
  AppSettings,
  CalendarEvent,
  ClimbingSession,
  EventKind,
  EventSeries,
  Profile,
  Program,
  ProgramSession,
  Workout,
} from '@/db/types'
import {
  addDaysISO,
  diffDays,
  localDateOf,
  rangeISO,
  startOfWeekISO,
  weekdayOf,
  type ISODate,
} from '@/lib/dates'

/*
 * L'agenda d'une période : ce que prévoient le programme, les jours d'escalade du profil et les
 * séances perso (ponctuelles ou répétées), avec ce qui a été fait. Rien n'est recopié en base :
 * les séances prévues se calculent à la volée, seuls les écarts (faite, annulée) sont enregistrés.
 * Une séance d'escalade notée remplit l'escalade prévue le même jour.
 */

/** Écart maximal entre une séance faite et la séance du programme qu'elle remplit (en jours). */
export const MATCH_DAYS = 3

/** Série « jours d'escalade » du profil (elle n'existe pas en base : elle suit le profil). */
export const CLIMBING_DAYS_SERIES_ID = 'jours-escalade'

export type AgendaStatus = 'planned' | 'active' | 'done' | 'missed' | 'skipped'

interface ItemBase {
  /** Clé stable de l'élément dans la journée. */
  key: string
  date: ISODate
  status: AgendaStatus
}

/** Une séance du programme prévue ce jour-là. */
export interface ProgramItem extends ItemBase {
  type: 'program'
  program: Program
  session: ProgramSession
  /** La séance faite (ou en cours) qui la remplit : ce jour-là, ou quelques jours avant ou après. */
  workout: Workout | null
}

/** Une séance perso enregistrée : ponctuelle, ou un jour d'une série modifié (faite, annulée…). */
export interface EventItem extends ItemBase {
  type: 'event'
  event: CalendarEvent
  /** La série dont ce jour fait partie, s'il y en a une. */
  series: EventSeries | null
  /** Escalade : la séance notée ce jour-là qui la remplit. */
  climb: ClimbingSession | null
}

/** Un jour d'une série répétée, tel que prévu (rien d'enregistré pour ce jour-là). */
export interface OccurrenceItem extends ItemBase {
  type: 'occurrence'
  series: EventSeries
  /** Escalade : la séance notée ce jour-là qui la remplit. */
  climb: ClimbingSession | null
}

/** Une séance d'escalade notée un jour où rien de tel n'était prévu. */
export interface ClimbItem extends ItemBase {
  type: 'climb'
  climb: ClimbingSession
}

/** Une séance faite ou en cours qui ne remplit aucune séance du programme de ce jour-là. */
export interface WorkoutItem extends ItemBase {
  type: 'workout'
  workout: Workout
  /** Elle compte pour la séance du programme d'un autre jour (faite en avance ou rattrapée). */
  countsFor: ISODate | null
}

export type AgendaItem = ProgramItem | EventItem | OccurrenceItem | WorkoutItem | ClimbItem

export type Agenda = Map<ISODate, AgendaItem[]>

export interface AgendaSources {
  today: ISODate
  program: Program | null
  /** Séries enregistrées (et celle des jours d'escalade, voir climbingDaysSeries). */
  series: readonly EventSeries[]
  events: readonly CalendarEvent[]
  /** Séances faites ou en cours, MATCH_DAYS * 2 jours avant et après la période comprise. */
  workouts: readonly Workout[]
  /** Séances d'escalade de la période. */
  climbs: readonly ClimbingSession[]
}

/** Marge à charger autour d'une période pour relier les séances faites au programme. */
export const AGENDA_MARGIN_DAYS = MATCH_DAYS * 2

/** La série répétée tombe-t-elle ce jour-là ? */
export function seriesOccursOn(
  series: Pick<EventSeries, 'weekdays' | 'intervalWeeks' | 'startDate' | 'endDate'>,
  date: ISODate,
): boolean {
  if (date < series.startDate) return false
  if (series.endDate !== null && date > series.endDate) return false
  if (!series.weekdays.includes(weekdayOf(date))) return false
  const weeks = Math.round(diffDays(startOfWeekISO(date), startOfWeekISO(series.startDate)) / 7)
  return weeks % Math.max(1, series.intervalWeeks) === 0
}

/** Premier jour où tombe la série répétée (null : aucun, elle se termine avant). */
export function firstOccurrence(
  series: Pick<EventSeries, 'weekdays' | 'intervalWeeks' | 'startDate' | 'endDate'>,
): ISODate | null {
  // Au plus loin : le dernier jour de la semaine qui suit l'intervalle.
  const span = 7 * Math.max(1, series.intervalWeeks) + 7
  for (let i = 0; i < span; i++) {
    const date = addDaysISO(series.startDate, i)
    if (series.endDate !== null && date > series.endDate) return null
    if (seriesOccursOn(series, date)) return date
  }
  return null
}

/** Les jours d'escalade du profil, vus comme une série (null : pas d'escalade prévue). */
export function climbingDaysSeries(
  profile: Pick<Profile, 'climbingDays' | 'createdAt' | 'updatedAt'>,
  settings: Pick<AppSettings, 'hiddenModules'>,
): EventSeries | null {
  if (profile.climbingDays.length === 0 || settings.hiddenModules.includes('climbing')) return null
  return {
    id: CLIMBING_DAYS_SERIES_ID,
    kind: 'climbing',
    title: 'Escalade',
    weekdays: [...profile.climbingDays],
    intervalWeeks: 1,
    startDate: localDateOf(profile.createdAt),
    endDate: null,
    time: null,
    durationMin: null,
    notes: '',
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

/** Repère « séance du programme passée » enregistré pour ce jour-là. */
export function isProgramSkipMarker(event: CalendarEvent): boolean {
  return event.kind === 'program' && event.status === 'skipped' && event.programSessionId !== null
}

interface Occurrence {
  date: ISODate
  session: ProgramSession
}

function programOccurrences(program: Program, from: ISODate, to: ISODate): Occurrence[] {
  const list: Occurrence[] = []
  for (const date of rangeISO(from < program.startDate ? program.startDate : from, to)) {
    const weekday = weekdayOf(date)
    for (const session of program.sessions) {
      if (session.weekdays.includes(weekday)) list.push({ date, session })
    }
  }
  return list
}

function occurrenceKey(date: ISODate, sessionId: string): string {
  return `${date}|${sessionId}`
}

/**
 * Relie chaque séance faite à la séance du programme qu'elle remplit : celle choisie en la
 * commençant (plannedFor), sinon la plus proche (même séance, MATCH_DAYS jours au plus). Pour la
 * plus proche : d'abord celle du jour même, puis les plus proches parmi celles qui n'ont pas été
 * passées, et à écart égal une séance rattrapée plutôt qu'avancée. Une séance passée n'est remplie
 * que si elle est faite le jour même, ou s'il n'y en a pas d'autre à remplir.
 */
function matchWorkouts(
  program: Program,
  occurrences: Occurrence[],
  loaded: { from: ISODate; to: ISODate },
  workouts: readonly Workout[],
  skipped: ReadonlySet<string>,
) {
  const byOccurrence = new Map<Occurrence, Workout>()
  const byWorkout = new Map<string, Occurrence>()
  const link = (occurrence: Occurrence, workout: Workout) => {
    byOccurrence.set(occurrence, workout)
    byWorkout.set(workout.id, occurrence)
  }
  const ours = workouts
    .filter((w) => w.programId === program.id && w.programSessionId !== null)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))

  // Séances choisies en les commençant : elles remplissent ce jour-là (la première commencée gagne).
  const unmatched: Workout[] = []
  for (const workout of ours) {
    const planned = workout.plannedFor
    if (planned === null) {
      unmatched.push(workout)
      continue
    }
    // Jour choisi hors de la période regardée : elle remplit une séance qu'on ne voit pas ici.
    if (planned < loaded.from || planned > loaded.to) continue
    const occurrence = occurrences.find(
      (o) => o.date === planned && o.session.id === workout.programSessionId,
    )
    if (occurrence && !byOccurrence.has(occurrence)) link(occurrence, workout)
    else unmatched.push(workout)
  }

  const pairs: { occurrence: Occurrence; workout: Workout; gap: number; late: boolean; skipped: boolean }[] =
    []
  for (const workout of unmatched) {
    for (const occurrence of occurrences) {
      if (occurrence.session.id !== workout.programSessionId || byOccurrence.has(occurrence)) continue
      const delta = diffDays(workout.date, occurrence.date)
      if (Math.abs(delta) > MATCH_DAYS) continue
      pairs.push({
        occurrence,
        workout,
        gap: Math.abs(delta),
        late: delta >= 0,
        skipped: skipped.has(occurrenceKey(occurrence.date, occurrence.session.id)),
      })
    }
  }
  pairs.sort(
    (a, b) =>
      Number(a.gap > 0) - Number(b.gap > 0) ||
      Number(a.skipped) - Number(b.skipped) ||
      a.gap - b.gap ||
      Number(b.late) - Number(a.late) ||
      a.workout.startedAt.localeCompare(b.workout.startedAt) ||
      a.occurrence.date.localeCompare(b.occurrence.date),
  )
  for (const { occurrence, workout } of pairs) {
    if (byOccurrence.has(occurrence) || byWorkout.has(workout.id)) continue
    link(occurrence, workout)
  }
  return { byOccurrence, byWorkout }
}

/** Statut d'un jour prévu sans séance faite : à venir, ou passé sans rien de noté. */
function plannedStatus(date: ISODate, today: ISODate): AgendaStatus {
  return date < today ? 'missed' : 'planned'
}

function eventStatus(event: CalendarEvent, today: ISODate): AgendaStatus {
  return event.status === 'planned' ? plannedStatus(event.date, today) : event.status
}

const TYPE_ORDER: Record<AgendaItem['type'], number> = {
  program: 0,
  workout: 1,
  climb: 1,
  occurrence: 2,
  event: 2,
}

/** Heure prévue d'un élément (les séances sans heure passent avant, comme « toute la journée »). */
export function itemTime(item: AgendaItem): string | null {
  if (item.type === 'event') return item.event.time
  if (item.type === 'occurrence') return item.series.time
  return null
}

function compareItems(a: AgendaItem, b: AgendaItem): number {
  const ta = itemTime(a)
  const tb = itemTime(b)
  if (ta !== tb) {
    if (ta === null) return -1
    if (tb === null) return 1
    return ta.localeCompare(tb)
  }
  return TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.key.localeCompare(b.key)
}

/** L'agenda jour par jour, du premier au dernier jour compris. */
export function buildAgenda(from: ISODate, to: ISODate, sources: AgendaSources): Agenda {
  const { today, program } = sources
  const agenda: Agenda = new Map(rangeISO(from, to).map((date) => [date, []]))
  const add = (item: AgendaItem) => agenda.get(item.date)?.push(item)

  // Séances du programme, et séances faites (ou en cours) reliées à elles.
  const { workouts } = sources
  // Les séances du programme un peu avant et après la période, pour y relier les séances faites.
  const loaded = { from: addDaysISO(from, -AGENDA_MARGIN_DAYS), to: addDaysISO(to, AGENDA_MARGIN_DAYS) }
  const occurrences = program ? programOccurrences(program, loaded.from, loaded.to) : []
  const skipped = new Set(
    sources.events.filter(isProgramSkipMarker).map((e) => occurrenceKey(e.date, e.programSessionId ?? '')),
  )
  const { byOccurrence, byWorkout } = program
    ? matchWorkouts(program, occurrences, loaded, workouts, skipped)
    : { byOccurrence: new Map<Occurrence, Workout>(), byWorkout: new Map<string, Occurrence>() }
  if (program) {
    for (const occurrence of occurrences) {
      if (occurrence.date < from || occurrence.date > to) continue
      const workout = byOccurrence.get(occurrence) ?? null
      const status: AgendaStatus = workout
        ? workout.status === 'active'
          ? 'active'
          : 'done'
        : skipped.has(occurrenceKey(occurrence.date, occurrence.session.id))
          ? 'skipped'
          : plannedStatus(occurrence.date, today)
      add({
        type: 'program',
        key: `programme-${occurrence.session.id}`,
        date: occurrence.date,
        status,
        program,
        session: occurrence.session,
        workout,
      })
    }
  }
  for (const workout of workouts) {
    if (workout.date < from || workout.date > to) continue
    const occurrence = byWorkout.get(workout.id)
    if (occurrence?.date === workout.date) continue
    add({
      type: 'workout',
      key: `seance-${workout.id}`,
      date: workout.date,
      status: workout.status === 'active' ? 'active' : 'done',
      workout,
      countsFor: occurrence?.date ?? null,
    })
  }

  // Séries répétées : chaque jour prévu, ou ce qui a été noté pour ce jour-là.
  const seriesById = new Map(sources.series.map((s) => [s.id, s]))
  const noted = new Map<string, CalendarEvent>()
  for (const event of sources.events) {
    if (event.seriesId !== null) noted.set(`${event.seriesId}|${event.date}`, event)
  }
  for (const series of sources.series) {
    for (const date of rangeISO(from, to)) {
      if (!seriesOccursOn(series, date)) continue
      const event = noted.get(`${series.id}|${date}`)
      if (event) {
        add({
          type: 'event',
          key: `perso-${event.id}`,
          date,
          status: eventStatus(event, today),
          event,
          series,
          climb: null,
        })
      } else {
        add({
          type: 'occurrence',
          key: `serie-${series.id}`,
          date,
          status: plannedStatus(date, today),
          series,
          climb: null,
        })
      }
    }
  }

  // Séances perso ponctuelles (et jours d'une série qui ne tombent plus dans la série).
  for (const event of sources.events) {
    if (event.date < from || event.date > to || isProgramSkipMarker(event)) continue
    const series = event.seriesId === null ? null : (seriesById.get(event.seriesId) ?? null)
    if (series && seriesOccursOn(series, event.date)) continue
    // Un jour annulé d'une série qui ne le prévoit plus : il n'y a plus rien à annuler.
    if (event.seriesId !== null && event.status === 'skipped') continue
    add({
      type: 'event',
      key: `perso-${event.id}`,
      date: event.date,
      status: eventStatus(event, today),
      event,
      series: null,
      climb: null,
    })
  }

  for (const items of agenda.values()) items.sort(compareItems)
  addClimbs(agenda, sources.climbs)
  return agenda
}

/** L'escalade prévue un jour (pas celle annulée), qu'une séance notée ce jour-là peut remplir. */
function isClimbingPlan(item: AgendaItem): item is EventItem | OccurrenceItem {
  return (
    (item.type === 'event' || item.type === 'occurrence') &&
    itemKind(item) === 'climbing' &&
    item.status !== 'skipped'
  )
}

/**
 * Chaque séance d'escalade remplit l'escalade prévue le même jour, dans l'ordre de la journée ; une
 * séance de plus (ou un jour sans escalade prévue) s'ajoute à la journée.
 */
function addClimbs(agenda: Agenda, climbs: readonly ClimbingSession[]) {
  for (const climb of [...climbs].sort(compareSessions)) {
    const items = agenda.get(climb.date)
    if (!items) continue
    const status: AgendaStatus = climb.status === 'active' ? 'active' : 'done'
    const plan = items.filter(isClimbingPlan).find((item) => item.climb === null)
    if (plan) {
      plan.climb = climb
      plan.status = status
    } else {
      items.push({ type: 'climb', key: `escalade-${climb.id}`, date: climb.date, status, climb })
      items.sort(compareItems)
    }
  }
}

/** Genre d'un élément, pour sa couleur et son icône. */
export function itemKind(item: AgendaItem): EventKind {
  switch (item.type) {
    case 'program':
    case 'workout':
      return 'program'
    case 'climb':
      return 'climbing'
    case 'event':
      return item.event.kind
    case 'occurrence':
      return item.series.kind
  }
}

/** Titre d'un élément. */
export function itemTitle(item: AgendaItem): string {
  switch (item.type) {
    case 'program':
      return item.session.name
    case 'workout':
      return item.workout.title
    case 'climb':
      return 'Escalade'
    case 'event':
      return item.event.title
    case 'occurrence':
      return item.series.title
  }
}

/** Prochaine séance du programme encore à faire, après un jour donné (non compris). */
export function nextPlannedSession(agenda: Agenda, after: ISODate): ProgramItem | null {
  for (const [date, items] of agenda) {
    if (date <= after) continue
    const item = items.find((i): i is ProgramItem => i.type === 'program' && i.status === 'planned')
    if (item) return item
  }
  return null
}
