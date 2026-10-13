import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import type { CoachDay } from '@/db/types'
import type { ISODate } from '@/lib/dates'

/** Le conseil du coach pour ce jour ; null s'il n'y en a pas, undefined pendant la lecture. */
export function useCoachDay(date: ISODate): CoachDay | null | undefined {
  return useLiveQuery(async () => (await db.coachDays.get(date)) ?? null, [date])
}
