import { expect, type Page, type Route } from '@playwright/test'

export const OURA_RELAY = 'https://calitrack-oura.e2e.workers.dev'
export const OURA_TOKEN = 'jeton-e2e'

/** Les en-têtes qu'ajoute le relais : l'appli lit la réponse et peut envoyer son jeton. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'Authorization',
  'access-control-allow-methods': 'GET, OPTIONS',
}

/** Les journées renvoyées par Oura (extraits) : la nuit du mercredi 21 octobre 2026. */
const COLLECTIONS: Record<string, unknown[]> = {
  daily_readiness: [{ day: '2026-10-21', score: 82, temperature_deviation: 0.1 }],
  daily_sleep: [{ day: '2026-10-21', score: 79 }],
  daily_activity: [{ day: '2026-10-21', score: 70, active_calories: 210, total_calories: 2310, steps: 3400 }],
  sleep: [
    {
      day: '2026-10-21',
      type: 'long_sleep',
      total_sleep_duration: 26_400,
      efficiency: 90,
      average_hrv: 55,
      lowest_heart_rate: 50,
    },
  ],
}

/** Le relais et Oura simulés : le relais transmet, Oura refuse tout autre jeton que le bon. */
export async function fakeOura(page: Page) {
  const sent: string[] = []
  await page.route(`${OURA_RELAY}/**`, async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (new URL(request.url()).pathname === '/ping') {
      return route.fulfill({ body: 'calitrack-relais-oura', headers: CORS })
    }
    const authorization = request.headers().authorization ?? ''
    sent.push(authorization)
    if (authorization !== `Bearer ${OURA_TOKEN}`) {
      return route.fulfill({ status: 401, json: { detail: 'Unauthorized' }, headers: CORS })
    }
    const collection = new URL(request.url()).pathname.split('/').pop() ?? ''
    return route.fulfill({ json: { data: COLLECTIONS[collection] ?? [], next_token: null }, headers: CORS })
  })
  // La page d'autorisation d'Oura : l'utilisateur accepte, Oura renvoie vers l'appli avec le jeton.
  await page.route('https://cloud.ouraring.com/oauth/authorize?**', async (route: Route) => {
    const url = new URL(route.request().url())
    const back = `${url.searchParams.get('redirect_uri') ?? ''}#access_token=${OURA_TOKEN}&token_type=bearer&expires_in=2592000&scope=daily&state=${url.searchParams.get('state') ?? ''}`
    return route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><title>Oura</title><script>location.replace(${JSON.stringify(back)})</script>`,
    })
  })
  return sent
}

/** Les deux étapes des réglages : le relais (vérifié) et le Client ID. */
export async function configureOura(page: Page) {
  await page.goto('more/oura')
  await expect(page.getByRole('heading', { name: 'Bague Oura', level: 1 })).toBeVisible()
  await page.getByLabel('Adresse du relais').fill(`${OURA_RELAY}/`)
  await page.getByRole('button', { name: 'Enregistrer et tester' }).click()
  await expect(page.getByText('Le relais fonctionne')).toBeVisible()
  await page.getByLabel('Client ID').fill('client-e2e')
  await page.getByRole('button', { name: 'Enregistrer le Client ID' }).click()
  await expect(page.getByText(/^Tout est prêt/)).toBeVisible()
}
