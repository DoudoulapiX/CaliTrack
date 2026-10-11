import { isProgramSkipMarker } from '@/content/calendar/agenda'
import { occurrenceEvent } from '@/content/calendar/event-form'
import { newId } from '@/lib/ids'
import { nowISO, type ISODate } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import { eventSchema, eventSeriesSchema } from './schema'
import type { CalendarEvent, EventSeries, EventStatus, Program, ProgramSession } from './types'

/*
 * Calendrier : séances perso (ponctuelles ou répétées) et écarts au programme. Les jours prévus
 * par le programme ou par une série ne sont pas recopiés : seul ce qui en diffère est enregistré.
 */

/** Enregistre une séance perso (vérifiée). */
export async function saveEvent(
  event: CalendarEvent,
  database: CaliTrackDB = defaultDb,
): Promise<CalendarEvent> {
  const valid = eventSchema.parse({ ...event, updatedAt: nowISO() })
  await database.events.put(valid)
  return valid
}

export async function deleteEvent(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.events.delete(id)
}

/** Enregistre une série répétée (vérifiée). */
export async function saveSeries(
  series: EventSeries,
  database: CaliTrackDB = defaultDb,
): Promise<EventSeries> {
  const valid = eventSeriesSchema.parse({ ...series, updatedAt: nowISO() })
  await database.eventSeries.put(valid)
  return valid
}

/** Supprime une série : les jours déjà faits restent dans le calendrier, le reste disparaît. */
export async function deleteSeries(id: string, database: CaliTrackDB = defaultDb): Promise<void> {
  await database.transaction('rw', database.events, database.eventSeries, async () => {
    const days = await database.events.where('seriesId').equals(id).toArray()
    const now = nowISO()
    await database.events.bulkPut(
      days.filter((e) => e.status === 'done').map((e) => ({ ...e, seriesId: null, updatedAt: now })),
    )
    await database.events.bulkDelete(days.filter((e) => e.status !== 'done').map((e) => e.id))
    await database.eventSeries.delete(id)
  })
}

/** Note un jour d'une série (faite, annulée, de nouveau prévue). */
export async function setOccurrenceStatus(
  series: EventSeries,
  date: ISODate,
  status: EventStatus,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.events, async () => {
    const existing = await database.events
      .where('seriesId')
      .equals(series.id)
      .filter((e) => e.date === date)
      .first()
    const now = nowISO()
    const next = existing
      ? { ...existing, status, updatedAt: now }
      : occurrenceEvent(series, date, status, now, newId)
    await database.events.put(eventSchema.parse(next))
  })
}

/** Passe une séance du programme ce jour-là, ou la remet. */
export async function setProgramSessionSkipped(
  program: Pick<Program, 'id'>,
  session: Pick<ProgramSession, 'id' | 'name'>,
  date: ISODate,
  skipped: boolean,
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.transaction('rw', database.events, async () => {
    const markers = await database.events
      .where('date')
      .equals(date)
      .filter((e) => isProgramSkipMarker(e) && e.programSessionId === session.id)
      .toArray()
    if (!skipped) {
      await database.events.bulkDelete(markers.map((e) => e.id))
      return
    }
    if (markers.length > 0) return
    const now = nowISO()
    await database.events.put(
      eventSchema.parse({
        id: newId(),
        date,
        time: null,
        kind: 'program',
        title: session.name,
        durationMin: null,
        programId: program.id,
        programSessionId: session.id,
        seriesId: null,
        status: 'skipped',
        workoutId: null,
        climbingSessionId: null,
        energyKcal: null,
        distanceKm: null,
        notes: '',
        createdAt: now,
        updatedAt: now,
      } satisfies CalendarEvent),
    )
  })
}
