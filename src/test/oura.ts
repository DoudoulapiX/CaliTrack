import type { OuraDay } from '@/db/types'

/** Réponses d'Oura enregistrées (extraits), pour tester sans bague ni réseau. */

export const OURA_READINESS = [
  { id: 'r1', day: '2026-10-20', score: 74, temperature_deviation: 0.12, contributors: { hrv_balance: 70 } },
  { id: 'r2', day: '2026-10-21', score: 86, temperature_deviation: -0.08, contributors: { hrv_balance: 88 } },
]

export const OURA_SLEEP_SCORES = [
  { id: 's1', day: '2026-10-20', score: 70, contributors: { total_sleep: 65 } },
  { id: 's2', day: '2026-10-21', score: 84, contributors: { total_sleep: 80 } },
]

export const OURA_ACTIVITY = [
  { id: 'a1', day: '2026-10-20', score: 80, active_calories: 520, total_calories: 2840, steps: 9876 },
  { id: 'a2', day: '2026-10-21', score: 65, active_calories: 140, total_calories: 2230, steps: 2310 },
]

export const OURA_SLEEP_PERIODS = [
  // Une sieste et la nuit du 21 : c'est la nuit qui compte.
  {
    id: 'p1',
    day: '2026-10-21',
    type: 'late_nap',
    total_sleep_duration: 1800,
    efficiency: 90,
    average_hrv: 30,
    lowest_heart_rate: 60,
  },
  {
    id: 'p2',
    day: '2026-10-21',
    type: 'long_sleep',
    total_sleep_duration: 27_120,
    efficiency: 91,
    average_hrv: 62,
    lowest_heart_rate: 48,
  },
  {
    id: 'p3',
    day: '2026-10-20',
    type: 'long_sleep',
    total_sleep_duration: 22_500,
    efficiency: 84,
    average_hrv: 44,
    lowest_heart_rate: 53,
  },
]

const COLLECTION_DATA: Record<string, unknown[]> = {
  daily_readiness: OURA_READINESS,
  daily_sleep: OURA_SLEEP_SCORES,
  daily_activity: OURA_ACTIVITY,
  sleep: OURA_SLEEP_PERIODS,
}

/** Un faux relais : répond pour chaque collection, et note les adresses demandées. */
export function fakeOuraRelay(override?: (url: URL) => Response | Error | undefined) {
  const urls: URL[] = []
  const headers: Headers[] = []
  const fetchImpl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    urls.push(url)
    headers.push(new Headers(init?.headers))
    const special = override?.(url)
    if (special instanceof Error) return Promise.reject(special)
    if (special) return Promise.resolve(special)
    const collection = url.pathname.split('/').pop() ?? ''
    const data = COLLECTION_DATA[collection]
    if (!data) return Promise.resolve(new Response('Demande refusée', { status: 404 }))
    return Promise.resolve(
      new Response(JSON.stringify({ data, next_token: null }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }
  return { fetchImpl, urls, headers }
}

/** Une journée Oura déjà enregistrée. */
export function ouraDay(date: string, patch: Partial<OuraDay> = {}): OuraDay {
  return {
    date,
    sleepScore: 84,
    readinessScore: 86,
    activityScore: 65,
    sleepMin: 452,
    sleepEfficiency: 91,
    hrvMs: 62,
    lowestHr: 48,
    temperatureDeviation: -0.08,
    activeKcal: 140,
    totalKcal: 2230,
    steps: 2310,
    syncedAt: `${date}T08:00:00.000Z`,
    ...patch,
  }
}

/** Le relais renvoie le refus d'Oura (jeton absent, faux ou expiré). */
export const unauthorized = () => new Response('{"detail":"Unauthorized"}', { status: 401 })
