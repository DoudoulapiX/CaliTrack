import type { OuraDay, Secret } from '@/db/types'
import {
  acceptOuraLink,
  accessLine,
  formatSleep,
  ouraConnection,
  ouraDayLabel,
  readinessAdvice,
  readinessLabel,
  readinessTone,
  recoveryTiles,
  syncLine,
} from './oura-view'

const NOW = new Date('2026-10-21T08:00:00.000Z')
const RELAY = 'https://calitrack-oura.charles.workers.dev'
const plain = (text: string) => text.replace(/\u00a0/g, ' ')

const secret = (expiresAt: string | null): Secret => ({
  id: 'oura',
  value: 'jeton',
  expiresAt,
  updatedAt: NOW.toISOString(),
})

const DAY: OuraDay = {
  date: '2026-10-21',
  sleepScore: 81,
  readinessScore: 86,
  activityScore: 74,
  sleepMin: 452,
  sleepEfficiency: 91,
  hrvMs: 48.6,
  lowestHr: 47,
  temperatureDeviation: -0.1,
  activeKcal: 420,
  totalKcal: 2650,
  steps: 9120,
  syncedAt: NOW.toISOString(),
}

describe('état de la connexion à Oura', () => {
  it('suit les étapes : relais, Client ID, puis accès', () => {
    expect(ouraConnection({ ouraRelayUrl: '', ouraClientId: 'client' }, undefined, NOW)).toBe('setup')
    expect(ouraConnection({ ouraRelayUrl: RELAY, ouraClientId: ' ' }, undefined, NOW)).toBe('setup')
    expect(ouraConnection({ ouraRelayUrl: RELAY, ouraClientId: 'client' }, undefined, NOW)).toBe('ready')
    const settings = { ouraRelayUrl: RELAY, ouraClientId: 'client' }
    expect(ouraConnection(settings, secret('2026-11-20T08:00:00.000Z'), NOW)).toBe('connected')
    expect(ouraConnection(settings, secret('2026-10-21T07:00:00.000Z'), NOW)).toBe('expired')
    // Un accès encore valable, même sans Client ID : il suffit pour lire les données.
    expect(ouraConnection({ ouraRelayUrl: RELAY, ouraClientId: '' }, secret(null), NOW)).toBe('connected')
  })
})

describe('lien de retour d’Oura', () => {
  const ok = { status: 'ok', token: 'jeton', expiresAt: '2026-11-20T08:00:00.000Z', state: 'abc' } as const

  it('garde l’accès quand le lien vient de la dernière demande', () => {
    expect(acceptOuraLink(ok, 'abc')).toEqual({ ok: true, token: 'jeton', expiresAt: ok.expiresAt })
    // Rien n'a pu être gardé avant le départ vers Oura : le lien collé à la main suffit.
    expect(acceptOuraLink(ok, null)).toMatchObject({ ok: true })
  })

  it('refuse un lien d’une autre demande, un refus ou un lien coupé', () => {
    expect(acceptOuraLink(ok, 'autre')).toEqual({
      ok: false,
      error: 'Ce lien vient d’une ancienne demande\u00a0: recommence la connexion.',
    })
    expect(acceptOuraLink({ status: 'denied' }, 'abc')).toMatchObject({ ok: false, error: /refusé l’accès/ })
    expect(acceptOuraLink({ status: 'invalid' }, 'abc')).toMatchObject({ ok: false, error: /en entier/ })
  })
})

describe('textes de la récupération', () => {
  it('nomme et colore le niveau de récupération', () => {
    expect([85, 84, 70, 69, 60, 59].map(readinessLabel)).toEqual([
      'Optimale',
      'Bonne',
      'Bonne',
      'Correcte',
      'Correcte',
      'Faible',
    ])
    expect([90, 75, 65, 40].map(readinessTone)).toEqual(['success', 'accent', 'warning', 'danger'])
    expect(readinessAdvice(88)).toMatch(/^Récupération optimale : .*séance intense/)
    expect(readinessAdvice(72)).toMatch(/^Bonne récupération : séance normale/)
    expect(readinessAdvice(65)).toMatch(/^Récupération correcte : allège/)
    expect(readinessAdvice(55)).toMatch(/^Récupération faible : .*séance légère/)
  })

  it('écrit la durée du sommeil et les mesures connues', () => {
    expect(formatSleep(452)).toBe('7\u00a0h\u00a032')
    expect(formatSleep(485)).toBe('8\u00a0h\u00a005')
    expect(recoveryTiles(DAY).map((tile) => [tile.label, plain(tile.value)])).toEqual([
      ['Sommeil', '7 h 32'],
      ['Score sommeil', '81'],
      ['VFC', '49 ms'],
      ['FC la plus basse', '47 bpm'],
    ])
    expect(recoveryTiles({ ...DAY, sleepScore: null, hrvMs: null, lowestHr: null })).toHaveLength(1)
  })

  it('date les données et la synchronisation', () => {
    expect(ouraDayLabel('2026-10-21', '2026-10-21')).toBe('Cette nuit')
    expect(plain(ouraDayLabel('2026-10-20', '2026-10-21'))).toBe('Dernières données : hier')
    expect(syncLine(null, '2026-10-21')).toBe('Jamais synchronisée')
    expect(syncLine('2026-10-21T08:00:00.000Z', '2026-10-21')).toBe('Synchronisée aujourd’hui à 10:00')
    expect(syncLine('2026-10-20T19:30:00.000Z', '2026-10-21')).toBe('Synchronisée hier à 21:30')
  })

  it('prévient quand l’accès touche à sa fin', () => {
    expect(accessLine('2026-11-20T08:00:00.000Z', NOW)).toBe('Accès valable jusqu’au 20 novembre')
    expect(plain(accessLine('2026-10-23T08:00:00.000Z', NOW))).toBe(
      'L’accès expire dans 2 jours : pense à reconnecter ta bague.',
    )
    expect(plain(accessLine('2026-10-22T08:00:00.000Z', NOW))).toMatch(/^L’accès expire demain :/)
    expect(plain(accessLine('2026-10-21T20:00:00.000Z', NOW))).toMatch(/^L’accès expire aujourd’hui :/)
  })
})
