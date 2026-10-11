import type { OuraDay } from '@/db/types'
import type { ISODate } from '@/lib/dates'
import { RELAY_ID } from './relay'

/** Page d'Oura où l'on autorise CaliTrack à lire les données de la bague. */
export const OURA_AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize'

/** Données demandées : résumés du jour (sommeil, récupération, activité) et fréquence cardiaque. */
export const OURA_SCOPES = ['daily', 'heartrate', 'personal'] as const

/** Durée d'un accès accordé par Oura (sans renouvellement possible depuis le téléphone). */
export const OURA_TOKEN_DAYS = 30

/** L'écran de l'appli où Oura renvoie après l'autorisation. */
export const OURA_CALLBACK_PATH = '/oura/callback'

/** L'adresse complète de cet écran, à déclarer chez Oura. */
export function ouraRedirectUri(origin: string, base: string): string {
  return `${origin}${base.replace(/\/+$/, '')}${OURA_CALLBACK_PATH}`
}

/** L'adresse d'autorisation, avec un `state` aléatoire vérifié au retour. */
export function ouraAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'token',
    client_id: clientId.trim(),
    redirect_uri: redirectUri,
    scope: OURA_SCOPES.join(' '),
    state,
  })
  return `${OURA_AUTHORIZE_URL}?${params.toString()}`
}

export type OuraRedirect =
  | { status: 'ok'; token: string; expiresAt: string; state: string }
  | { status: 'denied' }
  | { status: 'invalid' }

/**
 * Lit le retour d'Oura : le jeton est dans le fragment de l'adresse (« #access_token=… »). Accepte
 * l'adresse entière (collée à la main) ou le fragment seul.
 */
export function parseOuraRedirect(input: string, now: Date = new Date()): OuraRedirect {
  const hash = input.includes('#') ? input.slice(input.indexOf('#') + 1) : input
  const params = new URLSearchParams(hash.trim())
  if (params.get('error') === 'access_denied') return { status: 'denied' }
  const token = params.get('access_token')?.trim() ?? ''
  const expiresIn = Number(params.get('expires_in') ?? OURA_TOKEN_DAYS * 86_400)
  if (token === '' || !Number.isFinite(expiresIn) || expiresIn <= 0) return { status: 'invalid' }
  return {
    status: 'ok',
    token,
    expiresAt: new Date(now.getTime() + expiresIn * 1000).toISOString(),
    state: params.get('state') ?? '',
  }
}

/** L'adresse du relais, propre (https, sans barre finale), ou null si elle n'en est pas une. */
export function normalizeRelayUrl(input: string): string | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'https:' || url.hostname === '' || !url.hostname.includes('.')) return null
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Lecture des données                                                 */
/* ------------------------------------------------------------------ */

interface ReadinessDoc {
  day: string
  score: number | null
  temperature_deviation: number | null
}
interface SleepScoreDoc {
  day: string
  score: number | null
}
interface ActivityDoc {
  day: string
  score: number | null
  active_calories: number | null
  total_calories: number | null
  steps: number | null
}
interface SleepPeriodDoc {
  day: string
  type: string
  total_sleep_duration: number | null
  efficiency: number | null
  average_hrv: number | null
  lowest_heart_rate: number | null
}

export interface OuraCollections {
  readiness: ReadinessDoc[]
  sleepScores: SleepScoreDoc[]
  activity: ActivityDoc[]
  sleepPeriods: SleepPeriodDoc[]
}

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null
const positive = (value: unknown): number | null => {
  const n = num(value)
  return n === null || n < 0 ? null : n
}

/** La nuit principale d'un jour : le plus long sommeil « long_sleep », sinon le plus long tout court. */
function mainSleep(periods: SleepPeriodDoc[]): SleepPeriodDoc | undefined {
  const usable = periods.filter((period) => period.type !== 'deleted' && period.type !== 'rest')
  const longest = (list: SleepPeriodDoc[]) =>
    list.reduce<SleepPeriodDoc | undefined>(
      (best, period) =>
        best === undefined || (period.total_sleep_duration ?? 0) > (best.total_sleep_duration ?? 0)
          ? period
          : best,
      undefined,
    )
  return longest(usable.filter((period) => period.type === 'long_sleep')) ?? longest(usable)
}

/** Réunit les quatre collections d'Oura en un résumé par jour. */
export function mergeOuraDays(collections: OuraCollections, syncedAt: string): OuraDay[] {
  const days = new Map<string, OuraDay>()
  const day = (date: string): OuraDay => {
    let found = days.get(date)
    if (!found) {
      found = {
        date,
        sleepScore: null,
        readinessScore: null,
        activityScore: null,
        sleepMin: null,
        sleepEfficiency: null,
        hrvMs: null,
        lowestHr: null,
        temperatureDeviation: null,
        activeKcal: null,
        totalKcal: null,
        steps: null,
        syncedAt,
      }
      days.set(date, found)
    }
    return found
  }
  const isDay = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

  for (const doc of collections.readiness) {
    if (!isDay(doc.day)) continue
    const d = day(doc.day)
    d.readinessScore = num(doc.score)
    d.temperatureDeviation = num(doc.temperature_deviation)
  }
  for (const doc of collections.sleepScores) {
    if (isDay(doc.day)) day(doc.day).sleepScore = num(doc.score)
  }
  for (const doc of collections.activity) {
    if (!isDay(doc.day)) continue
    const d = day(doc.day)
    d.activityScore = num(doc.score)
    d.activeKcal = positive(doc.active_calories)
    d.totalKcal = positive(doc.total_calories)
    d.steps = positive(doc.steps)
  }
  const periodsByDay = new Map<string, SleepPeriodDoc[]>()
  for (const doc of collections.sleepPeriods) {
    if (isDay(doc.day)) periodsByDay.set(doc.day, [...(periodsByDay.get(doc.day) ?? []), doc])
  }
  for (const [date, periods] of periodsByDay) {
    const sleep = mainSleep(periods)
    if (!sleep) continue
    const d = day(date)
    const seconds = positive(sleep.total_sleep_duration)
    d.sleepMin = seconds === null ? null : Math.round(seconds / 60)
    d.sleepEfficiency = num(sleep.efficiency)
    d.hrvMs = positive(sleep.average_hrv)
    d.lowestHr = positive(sleep.lowest_heart_rate)
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export type OuraProblem = 'offline' | 'expired' | 'relay' | 'failed'

export type OuraFetchResult = { status: 'ok'; days: OuraDay[] } | { status: 'error'; problem: OuraProblem }

class OuraError extends Error {
  readonly problem: OuraProblem
  constructor(problem: OuraProblem) {
    super(problem)
    this.problem = problem
  }
}

const COLLECTIONS = {
  readiness: 'daily_readiness',
  sleepScores: 'daily_sleep',
  activity: 'daily_activity',
  sleepPeriods: 'sleep',
} as const

/** Lit toutes les pages d'une collection d'Oura, par le relais. */
async function readCollection(
  relayUrl: string,
  token: string,
  collection: string,
  start: ISODate,
  end: ISODate,
  fetchImpl: typeof fetch,
): Promise<unknown[]> {
  const documents: unknown[] = []
  let nextToken: string | null = null
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({ start_date: start, end_date: end })
    if (nextToken) params.set('next_token', nextToken)
    let response: Response
    try {
      response = await fetchImpl(`${relayUrl}/v2/usercollection/${collection}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      throw new OuraError('offline')
    }
    if (response.status === 401) throw new OuraError('expired')
    if (!response.ok)
      throw new OuraError(response.status === 404 || response.status === 403 ? 'relay' : 'failed')
    let body: { data?: unknown; next_token?: unknown }
    try {
      body = (await response.json()) as { data?: unknown; next_token?: unknown }
    } catch {
      throw new OuraError('relay')
    }
    if (!Array.isArray(body.data)) throw new OuraError('relay')
    documents.push(...(body.data as unknown[]))
    nextToken = typeof body.next_token === 'string' && body.next_token !== '' ? body.next_token : null
    if (!nextToken) break
  }
  return documents
}

/** Les journées Oura de `start` à `end` (inclus), lues par le relais. */
export async function fetchOuraDays(options: {
  relayUrl: string
  token: string
  start: ISODate
  end: ISODate
  now?: Date
  fetchImpl?: typeof fetch
}): Promise<OuraFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  // La fin est exclue pour certaines collections : on demande un jour de plus.
  const endPlusOne = new Date(`${options.end}T12:00:00Z`)
  endPlusOne.setUTCDate(endPlusOne.getUTCDate() + 1)
  const end: ISODate = endPlusOne.toISOString().slice(0, 10)
  try {
    const entries = await Promise.all(
      Object.entries(COLLECTIONS).map(
        async ([key, collection]) =>
          [
            key,
            await readCollection(options.relayUrl, options.token, collection, options.start, end, fetchImpl),
          ] as const,
      ),
    )
    const collections = Object.fromEntries(entries) as unknown as OuraCollections
    const days = mergeOuraDays(collections, (options.now ?? new Date()).toISOString()).filter(
      (day) => day.date >= options.start && day.date <= options.end,
    )
    return { status: 'ok', days }
  } catch (error) {
    return { status: 'error', problem: error instanceof OuraError ? error.problem : 'failed' }
  }
}

export type RelayCheck = 'ok' | 'unreachable' | 'wrong'

/**
 * Vérifie le relais : il doit répondre à `/ping`, pour l'adresse de l'appli. Un relais absent, ou qui
 * n'accepte pas cette adresse, fait échouer la demande elle-même ; un autre programme répond autre chose.
 */
export async function checkOuraRelay(relayUrl: string, fetchImpl: typeof fetch = fetch): Promise<RelayCheck> {
  let response: Response
  try {
    response = await fetchImpl(`${relayUrl}/ping`)
  } catch {
    return 'unreachable'
  }
  if (!response.ok) return 'wrong'
  try {
    return (await response.text()).trim() === RELAY_ID ? 'ok' : 'wrong'
  } catch {
    return 'wrong'
  }
}
