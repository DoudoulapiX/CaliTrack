import {
  fakeOuraRelay,
  OURA_ACTIVITY,
  OURA_READINESS,
  OURA_SLEEP_PERIODS,
  OURA_SLEEP_SCORES,
} from '@/test/oura'
import {
  checkOuraRelay,
  fetchOuraDays,
  mergeOuraDays,
  normalizeRelayUrl,
  ouraAuthorizeUrl,
  ouraRedirectUri,
  parseOuraRedirect,
} from './oura'
import { RELAY_ID } from './relay'

const SYNCED = '2026-10-21T08:00:00.000Z'
const RELAY = 'https://calitrack-oura.charles.workers.dev'

describe('connexion à Oura', () => {
  it('prépare l’adresse d’autorisation et l’adresse de retour', () => {
    const redirect = ouraRedirectUri('https://doudoulapix.github.io', '/CaliTrack/')
    expect(redirect).toBe('https://doudoulapix.github.io/CaliTrack/oura/callback')
    expect(ouraRedirectUri('http://localhost:4173', '/CaliTrack')).toBe(
      'http://localhost:4173/CaliTrack/oura/callback',
    )
    const url = new URL(ouraAuthorizeUrl(' client-123 ', redirect, 'etat-xyz'))
    expect(url.origin + url.pathname).toBe('https://cloud.ouraring.com/oauth/authorize')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: 'token',
      client_id: 'client-123',
      redirect_uri: redirect,
      scope: 'daily heartrate personal',
      state: 'etat-xyz',
    })
  })

  it('lit le jeton au retour, dans l’adresse entière ou le seul fragment', () => {
    const now = new Date('2026-10-21T08:00:00.000Z')
    const fragment = 'access_token=jeton-abc&token_type=bearer&expires_in=2592000&scope=daily&state=etat-xyz'
    const expected = {
      status: 'ok',
      token: 'jeton-abc',
      expiresAt: '2026-11-20T08:00:00.000Z',
      state: 'etat-xyz',
    }
    expect(
      parseOuraRedirect(`https://doudoulapix.github.io/CaliTrack/oura/callback#${fragment}`, now),
    ).toEqual(expected)
    expect(parseOuraRedirect(`#${fragment}`, now)).toEqual(expected)
    expect(parseOuraRedirect(` ${fragment}\n`, now)).toEqual(expected)
    // Sans durée : 30 jours.
    expect(parseOuraRedirect('access_token=t', now)).toMatchObject({
      expiresAt: '2026-11-20T08:00:00.000Z',
      state: '',
    })
  })

  it('reconnaît un refus et un lien incomplet', () => {
    expect(parseOuraRedirect('https://x.example/cb#error=access_denied&state=s')).toEqual({
      status: 'denied',
    })
    expect(parseOuraRedirect('https://x.example/cb#token_type=bearer')).toEqual({ status: 'invalid' })
    expect(parseOuraRedirect('access_token=t&expires_in=-5')).toEqual({ status: 'invalid' })
    expect(parseOuraRedirect('')).toEqual({ status: 'invalid' })
  })

  it('nettoie l’adresse du relais', () => {
    expect(normalizeRelayUrl(' https://calitrack-oura.charles.workers.dev/ ')).toBe(RELAY)
    expect(normalizeRelayUrl('calitrack-oura.charles.workers.dev')).toBe(RELAY)
    expect(normalizeRelayUrl('https://relais.example/oura//')).toBe('https://relais.example/oura')
    expect(normalizeRelayUrl('http://calitrack-oura.charles.workers.dev')).toBeNull()
    expect(normalizeRelayUrl('pas une adresse')).toBeNull()
    expect(normalizeRelayUrl('localhost')).toBeNull()
    expect(normalizeRelayUrl('')).toBeNull()
  })
})

describe('données Oura', () => {
  it('réunissent sommeil, récupération et activité par jour, avec la nuit principale', () => {
    const days = mergeOuraDays(
      {
        readiness: OURA_READINESS,
        sleepScores: OURA_SLEEP_SCORES,
        activity: OURA_ACTIVITY,
        sleepPeriods: OURA_SLEEP_PERIODS,
      },
      SYNCED,
    )
    expect(days).toEqual([
      {
        date: '2026-10-20',
        sleepScore: 70,
        readinessScore: 74,
        activityScore: 80,
        sleepMin: 375,
        sleepEfficiency: 84,
        hrvMs: 44,
        lowestHr: 53,
        temperatureDeviation: 0.12,
        activeKcal: 520,
        totalKcal: 2840,
        steps: 9876,
        syncedAt: SYNCED,
      },
      {
        date: '2026-10-21',
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
        syncedAt: SYNCED,
      },
    ])
  })

  it('gardent les données absentes à null et ignorent les jours mal formés', () => {
    const days = mergeOuraDays(
      {
        readiness: [{ day: '2026-10-22', score: null, temperature_deviation: null }],
        sleepScores: [{ day: 'hier', score: 80 }],
        activity: [],
        sleepPeriods: [
          {
            day: '2026-10-22',
            type: 'deleted',
            total_sleep_duration: 30_000,
            efficiency: 90,
            average_hrv: 50,
            lowest_heart_rate: 50,
          },
          {
            day: '2026-10-22',
            type: 'sleep',
            total_sleep_duration: 3600,
            efficiency: null,
            average_hrv: -1,
            lowest_heart_rate: 55,
          },
        ],
      },
      SYNCED,
    )
    expect(days).toEqual([
      expect.objectContaining({
        date: '2026-10-22',
        readinessScore: null,
        sleepMin: 60,
        hrvMs: null,
        lowestHr: 55,
      }),
    ])
  })

  it('se lisent par le relais, page après page, avec le jeton', async () => {
    const pages = fakeOuraRelay((url) =>
      url.pathname.endsWith('/daily_readiness') && !url.searchParams.has('next_token')
        ? new Response(JSON.stringify({ data: [OURA_READINESS[0]], next_token: 'page-2' }))
        : url.pathname.endsWith('/daily_readiness')
          ? new Response(JSON.stringify({ data: [OURA_READINESS[1]], next_token: null }))
          : undefined,
    )
    const result = await fetchOuraDays({
      relayUrl: RELAY,
      token: 'jeton',
      start: '2026-10-20',
      end: '2026-10-21',
      now: new Date(SYNCED),
      fetchImpl: pages.fetchImpl,
    })
    expect(result.status === 'ok' && result.days.map((day) => [day.date, day.readinessScore])).toEqual([
      ['2026-10-20', 74],
      ['2026-10-21', 86],
    ])
    expect(pages.urls.map((url) => url.pathname)).toEqual(
      expect.arrayContaining([
        '/v2/usercollection/daily_readiness',
        '/v2/usercollection/daily_sleep',
        '/v2/usercollection/daily_activity',
        '/v2/usercollection/sleep',
      ]),
    )
    expect(pages.urls).toHaveLength(5)
    expect(pages.urls[0]?.origin).toBe(RELAY)
    // Un jour de plus à la fin : certaines collections l'excluent.
    expect(Object.fromEntries(pages.urls[0]?.searchParams ?? [])).toMatchObject({
      start_date: '2026-10-20',
      end_date: '2026-10-22',
    })
    expect(pages.headers.every((h) => h.get('Authorization') === 'Bearer jeton')).toBe(true)
  })

  it('disent pourquoi la lecture échoue', async () => {
    const run = (answer: Response | Error) =>
      fetchOuraDays({
        relayUrl: RELAY,
        token: 'jeton',
        start: '2026-10-20',
        end: '2026-10-21',
        fetchImpl: fakeOuraRelay(() => answer).fetchImpl,
      })
    expect(await run(new Response('', { status: 401 }))).toEqual({ status: 'error', problem: 'expired' })
    expect(await run(new TypeError('Load failed'))).toEqual({ status: 'error', problem: 'offline' })
    expect(await run(new Response('Origine refusée', { status: 403 }))).toEqual({
      status: 'error',
      problem: 'relay',
    })
    expect(await run(new Response('<html>', { status: 200 }))).toEqual({ status: 'error', problem: 'relay' })
    expect(await run(new Response('{}', { status: 200 }))).toEqual({ status: 'error', problem: 'relay' })
    expect(await run(new Response('', { status: 500 }))).toEqual({ status: 'error', problem: 'failed' })
  })
})

describe('vérification du relais', () => {
  it('reconnaît le relais de CaliTrack', async () => {
    const relay = fakeOuraRelay(() => new Response(`${RELAY_ID}\n`))
    expect(await checkOuraRelay(RELAY, relay.fetchImpl)).toBe('ok')
    expect(relay.urls[0]?.href).toBe(`${RELAY}/ping`)
    expect(relay.headers[0]?.get('Authorization')).toBeNull()
  })

  it('distingue un relais injoignable d’un autre programme', async () => {
    const blocked = fakeOuraRelay(() => new TypeError('Load failed'))
    expect(await checkOuraRelay(RELAY, blocked.fetchImpl)).toBe('unreachable')
    const notFound = fakeOuraRelay()
    expect(await checkOuraRelay(RELAY, notFound.fetchImpl)).toBe('wrong')
    const hello = fakeOuraRelay(() => new Response('Hello World!'))
    expect(await checkOuraRelay(RELAY, hello.fetchImpl)).toBe('wrong')
  })
})
