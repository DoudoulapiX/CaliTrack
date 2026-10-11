import { fetchOuraDays, normalizeRelayUrl, type OuraProblem } from '@/content/oura/oura'
import { addDaysISO, today as todayISO } from '@/lib/dates'
import { db as defaultDb, type CaliTrackDB } from './db'
import { ouraDaySchema } from './schema'
import { validSecret } from './secrets'
import type { OuraDay } from './types'

/** Jours relus à chaque synchronisation (Oura complète parfois la veille), et lus la première fois. */
const OVERLAP_DAYS = 2
const FIRST_SYNC_DAYS = 30

/** Enregistre des journées Oura (vérifiées), en remplaçant celles du même jour. */
export async function saveOuraDays(
  days: readonly OuraDay[],
  database: CaliTrackDB = defaultDb,
): Promise<void> {
  await database.ouraDays.bulkPut(days.map((day) => ouraDaySchema.parse(day)))
}

export type OuraSyncResult =
  { status: 'ok'; days: number } | { status: 'notSetUp' } | { status: 'error'; problem: OuraProblem }

/** Va chercher les dernières journées Oura par le relais et les enregistre. */
export async function syncOura(
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
  database: CaliTrackDB = defaultDb,
): Promise<OuraSyncResult> {
  const now = options.now ?? new Date()
  const settings = await database.settings.get('app')
  const relayUrl = normalizeRelayUrl(settings?.ouraRelayUrl ?? '')
  if (!relayUrl) return { status: 'notSetUp' }
  const token = validSecret(await database.secrets.get('oura'), now)
  if (!token) return { status: 'error', problem: 'expired' }
  const end = todayISO(now)
  const latest = await database.ouraDays.orderBy('date').last()
  const first = addDaysISO(end, -(FIRST_SYNC_DAYS - 1))
  const start = latest && latest.date > first ? addDaysISO(latest.date, -OVERLAP_DAYS) : first
  const result = await fetchOuraDays({ relayUrl, token, start, end, now, fetchImpl: options.fetchImpl })
  if (result.status === 'error') {
    // Oura refuse le jeton (révoqué ou expiré plus tôt que prévu) : l'appli propose de reconnecter.
    if (result.problem === 'expired') await database.secrets.update('oura', { expiresAt: now.toISOString() })
    return result
  }
  await saveOuraDays(result.days, database)
  return { status: 'ok', days: result.days.length }
}

/** Dernière synchronisation réussie (null : jamais). */
export async function lastOuraSync(database: CaliTrackDB = defaultDb): Promise<string | null> {
  const days = await database.ouraDays.toArray()
  return days.reduce<string | null>(
    (latest, day) => (latest === null || day.syncedAt > latest ? day.syncedAt : latest),
    null,
  )
}
