import { normalizeRelayUrl, type OuraProblem, type OuraRedirect, type RelayCheck } from '@/content/oura/oura'
import { validSecret } from '@/db/secrets'
import type { AppSettings, OuraDay, Secret } from '@/db/types'
import {
  diffDays,
  formatDay,
  formatTimeOf,
  localDateOf,
  relativeDayLabel,
  toISODate,
  type ISODate,
} from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { frenchSpacing, NBSP } from '@/lib/typography'

/** Où régler la connexion à Oura. */
export const OURA_SETTINGS_PATH = '/more/oura'

export const OURA_PROBLEM_TEXT: Record<OuraProblem, string> = {
  offline: frenchSpacing('Pas de connexion : la synchronisation reprendra plus tard.'),
  expired: frenchSpacing('L’accès à Oura a expiré (il dure 30 jours) : reconnecte ta bague.'),
  relay: frenchSpacing('Le relais ne répond pas comme prévu : vérifie son adresse et son code.'),
  failed: frenchSpacing('Oura ne répond pas pour l’instant : réessaie plus tard.'),
}

/** Où en est la connexion : réglages à faire, prête, connectée ou à refaire. */
export type OuraConnection = 'setup' | 'ready' | 'connected' | 'expired'

export function ouraConnection(
  settings: Pick<AppSettings, 'ouraClientId' | 'ouraRelayUrl'>,
  secret: Secret | undefined,
  now: Date,
): OuraConnection {
  if (normalizeRelayUrl(settings.ouraRelayUrl) === null) return 'setup'
  if (validSecret(secret, now) !== null) return 'connected'
  if (secret) return 'expired'
  return settings.ouraClientId.trim() === '' ? 'setup' : 'ready'
}

export const RELAY_CHECK_TEXT: Record<RelayCheck, string> = {
  ok: 'Le relais fonctionne',
  unreachable: frenchSpacing(
    'Relais injoignable : vérifie son adresse, et que tu as remplacé son code par celui de CaliTrack.',
  ),
  wrong: frenchSpacing('Ce n’est pas le relais de CaliTrack : remplace son code, puis « Deploy ».'),
}

/**
 * Que faire d'un lien de retour d'Oura. Le `state` doit être celui de la dernière demande ; s'il n'a pas
 * pu être gardé (stockage indisponible), le lien collé à la main est accepté.
 */
export function acceptOuraLink(
  redirect: OuraRedirect,
  storedState: string | null,
): { ok: true; token: string; expiresAt: string } | { ok: false; error: string } {
  if (redirect.status === 'denied') {
    return { ok: false, error: 'Tu as refusé l’accès dans Oura. Recommence la connexion pour l’accepter.' }
  }
  if (redirect.status === 'invalid') {
    return {
      ok: false,
      error: frenchSpacing('Ce lien ne contient pas d’accès Oura : copie le lien en entier.'),
    }
  }
  if (storedState !== null && redirect.state !== storedState) {
    return {
      ok: false,
      error: frenchSpacing('Ce lien vient d’une ancienne demande : recommence la connexion.'),
    }
  }
  return { ok: true, token: redirect.token, expiresAt: redirect.expiresAt }
}

/** Le niveau de récupération d'après le score Oura (0 à 100). */
export function readinessLabel(score: number): string {
  if (score >= 85) return 'Optimale'
  if (score >= 70) return 'Bonne'
  if (score >= 60) return 'Correcte'
  return 'Faible'
}

/** La couleur du niveau de récupération. */
export function readinessTone(score: number): 'success' | 'accent' | 'warning' | 'danger' {
  if (score >= 85) return 'success'
  if (score >= 70) return 'accent'
  if (score >= 60) return 'warning'
  return 'danger'
}

/** Le conseil du jour d'après la récupération (mêmes paliers que le niveau). */
export function readinessAdvice(score: number): string {
  if (score >= 85) return 'Récupération optimale : bonne journée pour une séance intense.'
  if (score >= 70) return 'Bonne récupération : séance normale.'
  if (score >= 60) return 'Récupération correcte : allège un peu la séance.'
  return 'Récupération faible : préfère une séance légère, ou du repos.'
}

/** Une durée de sommeil : « 7 h 32 ». */
export function formatSleep(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return `${String(h)}${NBSP}h${NBSP}${String(m).padStart(2, '0')}`
}

/** Les mesures de la nuit, celles qu'Oura a fournies. */
export function recoveryTiles(day: OuraDay): { label: string; value: string }[] {
  const tiles: { label: string; value: string }[] = []
  if (day.sleepMin !== null) tiles.push({ label: 'Sommeil', value: formatSleep(day.sleepMin) })
  if (day.sleepScore !== null) tiles.push({ label: 'Score sommeil', value: String(day.sleepScore) })
  if (day.hrvMs !== null)
    tiles.push({ label: 'VFC', value: `${formatNumber(Math.round(day.hrvMs))}${NBSP}ms` })
  if (day.lowestHr !== null) {
    tiles.push({ label: 'FC la plus basse', value: `${formatNumber(Math.round(day.lowestHr))}${NBSP}bpm` })
  }
  return tiles
}

/** De quand datent les données affichées : « Cette nuit » ou « Nuit d'hier ». */
export function ouraDayLabel(date: ISODate, today: ISODate): string {
  if (date === today) return 'Cette nuit'
  return frenchSpacing(`Dernières données : ${relativeDayLabel(date, today)}`)
}

/** Jusqu'à quand l'accès à Oura est valable, avec un rappel les trois derniers jours. */
export function accessLine(expiresAt: string, now: Date): string {
  const end = localDateOf(expiresAt)
  const left = diffDays(end, toISODate(now))
  if (left > 3) return `Accès valable jusqu’au ${formatDay(end, 'd MMMM')}`
  const when = left <= 0 ? 'aujourd’hui' : left === 1 ? 'demain' : `dans ${String(left)} jours`
  return frenchSpacing(`L’accès expire ${when} : pense à reconnecter ta bague.`)
}

/** « Synchronisée aujourd'hui à 10:00 », ou « Jamais synchronisée ». */
export function syncLine(lastSync: string | null, today: ISODate): string {
  if (lastSync === null) return 'Jamais synchronisée'
  return `Synchronisée ${relativeDayLabel(localDateOf(lastSync), today)} à ${formatTimeOf(lastSync)}`
}
