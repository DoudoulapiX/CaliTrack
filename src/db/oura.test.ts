import { fakeOuraRelay } from '@/test/oura'
import { resetDb } from '@/test/db'
import { db } from './db'
import { lastOuraSync, saveOuraDays, syncOura } from './oura'
import { saveSecret } from './secrets'
import { ensureSeeded } from './seed'
import { updateSettings } from './settings'

const NOW = new Date('2026-10-21T08:00:00.000Z')
const RELAY = 'https://calitrack-oura.charles.workers.dev'

async function connect() {
  await updateSettings({ ouraRelayUrl: `${RELAY}/`, ouraClientId: 'client-123' })
  await saveSecret('oura', 'jeton', '2026-11-20T08:00:00.000Z')
}

describe('synchronisation Oura', () => {
  beforeEach(async () => {
    await resetDb()
    await ensureSeeded()
  })

  it('attend le relais, puis un accès valable', async () => {
    expect(await syncOura({ now: NOW })).toEqual({ status: 'notSetUp' })
    await updateSettings({ ouraRelayUrl: RELAY })
    expect(await syncOura({ now: NOW })).toEqual({ status: 'error', problem: 'expired' })
    await saveSecret('oura', 'jeton', '2026-10-21T07:00:00.000Z')
    expect(await syncOura({ now: NOW })).toEqual({ status: 'error', problem: 'expired' })
  })

  it('lit 30 jours la première fois, puis reprend deux jours avant la dernière journée', async () => {
    await connect()
    const relay = fakeOuraRelay()
    expect(await syncOura({ now: NOW, fetchImpl: relay.fetchImpl })).toEqual({ status: 'ok', days: 2 })
    expect(relay.urls[0]?.origin).toBe(RELAY)
    expect(relay.urls[0]?.searchParams.get('start_date')).toBe('2026-09-22')
    expect(await db.ouraDays.get('2026-10-21')).toMatchObject({ readinessScore: 86, sleepMin: 452 })
    expect(await lastOuraSync()).toBe(NOW.toISOString())

    const again = fakeOuraRelay()
    await syncOura({ now: new Date('2026-10-22T08:00:00.000Z'), fetchImpl: again.fetchImpl })
    expect(again.urls[0]?.searchParams.get('start_date')).toBe('2026-10-19')
    expect(await db.ouraDays.count()).toBe(2)
  })

  it('ne touche à rien quand la lecture échoue', async () => {
    await connect()
    const offline = fakeOuraRelay(() => new TypeError('Load failed'))
    expect(await syncOura({ now: NOW, fetchImpl: offline.fetchImpl })).toEqual({
      status: 'error',
      problem: 'offline',
    })
    expect(await db.ouraDays.count()).toBe(0)
    expect(await lastOuraSync()).toBeNull()
  })

  it('marque l’accès expiré quand Oura refuse le jeton', async () => {
    await connect()
    const refused = fakeOuraRelay(() => new Response('{"detail":"Unauthorized"}', { status: 401 }))
    expect(await syncOura({ now: NOW, fetchImpl: refused.fetchImpl })).toEqual({
      status: 'error',
      problem: 'expired',
    })
    expect(await db.secrets.get('oura')).toMatchObject({ value: 'jeton', expiresAt: NOW.toISOString() })
    expect(await syncOura({ now: NOW })).toEqual({ status: 'error', problem: 'expired' })
  })

  it('refuse une journée mal formée', async () => {
    await expect(
      saveOuraDays([
        {
          date: '2026-10-21',
          sleepScore: null,
          readinessScore: null,
          activityScore: null,
          sleepMin: -5,
          sleepEfficiency: null,
          hrvMs: null,
          lowestHr: null,
          temperatureDeviation: null,
          activeKcal: null,
          totalKcal: null,
          steps: null,
          syncedAt: NOW.toISOString(),
        },
      ]),
    ).rejects.toThrow()
  })
})
