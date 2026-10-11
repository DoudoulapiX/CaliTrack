import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useProfile, useSettings } from '@/app/data-context'
import { AGENDA_MARGIN_DAYS, buildAgenda, climbingDaysSeries, type Agenda } from '@/content/calendar/agenda'
import { db } from '@/db/db'
import type { Program } from '@/db/types'
import { addDaysISO, today, type ISODate } from '@/lib/dates'

/**
 * L'agenda d'une période (premier et dernier jour compris) : programme, jours d'escalade, séances
 * perso, séances faites et séances d'escalade. undefined pendant le chargement.
 */
export function useAgenda(
  program: Program | null | undefined,
  from: ISODate,
  to: ISODate,
): Agenda | undefined {
  const profile = useProfile()
  const settings = useSettings()
  const day = today()
  const data = useLiveQuery(async () => {
    const events = await db.events.where('date').between(from, to, true, true).toArray()
    const series = await db.eventSeries.toArray()
    const workouts = await db.workouts
      .where('date')
      .between(addDaysISO(from, -AGENDA_MARGIN_DAYS), addDaysISO(to, AGENDA_MARGIN_DAYS), true, true)
      .toArray()
    const climbs = await db.climbingSessions.where('date').between(from, to, true, true).toArray()
    return { events, series, workouts, climbs }
  }, [from, to])

  return useMemo(() => {
    if (program === undefined || data === undefined) return undefined
    const climbing = climbingDaysSeries(profile, settings)
    return buildAgenda(from, to, {
      today: day,
      program,
      series: climbing ? [...data.series, climbing] : data.series,
      events: data.events,
      workouts: data.workouts,
      climbs: data.climbs,
    })
  }, [program, data, profile, settings, from, to, day])
}
