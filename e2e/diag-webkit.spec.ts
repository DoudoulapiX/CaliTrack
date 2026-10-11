import { createServer, type Server } from 'node:http'
import { test, type Page } from '@playwright/test'

// Diagnostic temporaire (branche jetable) : comment WebKit traite les requêtes cross-origin
// avec en-têtes personnalisés quand Playwright les intercepte.

let server: Server
let origin = ''
const hits: string[] = []

test.beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url} acrh=${req.headers['access-control-request-headers'] ?? ''} auth=${req.headers.authorization ?? ''}`)
    res.setHeader('access-control-allow-origin', req.headers.origin ?? '*')
    res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] ?? '*')
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
    res.setHeader('vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ real: true }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})

test.afterAll(() => {
  server.close()
})

async function probe(page: Page, label: string, url: string, init: RequestInit) {
  const consoleLines: string[] = []
  const onConsole = (m: { type(): string; text(): string }) => consoleLines.push(`${m.type()}: ${m.text()}`)
  page.on('console', onConsole)
  const failed: string[] = []
  const onFailed = (r: { method(): string; url(): string; failure(): { errorText: string } | null }) =>
    failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`)
  page.on('requestfailed', onFailed)
  const result = await page.evaluate(
    async ([u, i]) => {
      const controlled = navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined
      try {
        const r = await fetch(u, i)
        return { controlled, status: r.status, body: await r.text() }
      } catch (e) {
        return { controlled, error: String(e) }
      }
    },
    [url, init] as const,
  )
  await page.waitForTimeout(300)
  page.off('console', onConsole)
  page.off('requestfailed', onFailed)
  console.log(`DIAG ${label}: ${JSON.stringify({ result, consoleLines, failed })}`)
}

const AUTH = { headers: { Authorization: 'Bearer x' } }

for (const sw of ['allow', 'block'] as const) {
  test.describe(`service workers ${sw}`, () => {
    test.use({ serviceWorkers: sw })

    test('cas', async ({ page }) => {
      await page.goto('./')
      if (sw === 'allow') {
        await Promise.race([
          page.evaluate(() => navigator.serviceWorker.ready.then(() => true)),
          page.waitForTimeout(8000),
        ])
        await page.reload()
        await page.waitForTimeout(1000)
      }

      const seen: string[] = []
      // A : réponse simulée complète (origine exacte, en-têtes reflétés).
      await page.route('https://diag-a.e2e.test/**', async (route) => {
        const r = route.request()
        const h = r.headers()
        seen.push(`A ${r.method()} acrh=${h['access-control-request-headers'] ?? ''} auth=${h.authorization ?? ''} origin=${h.origin ?? ''}`)
        await route.fulfill({
          status: r.method() === 'OPTIONS' ? 204 : 200,
          headers: {
            'access-control-allow-origin': h.origin ?? '*',
            'access-control-allow-headers': h['access-control-request-headers'] ?? 'Authorization',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
            vary: 'Origin',
          },
          body: r.method() === 'OPTIONS' ? '' : '{"a":1}',
        })
      })
      await probe(page, `${sw} A route complète`, 'https://diag-a.e2e.test/v2/x', AUTH)

      // B : comme les aides actuelles (origine *, en-têtes nommés).
      await page.route('https://diag-b.e2e.test/**', async (route) => {
        const r = route.request()
        seen.push(`B ${r.method()} auth=${r.headers().authorization ?? ''}`)
        const cors = {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'Authorization',
          'access-control-allow-methods': 'GET, OPTIONS',
        }
        if (r.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
        return route.fulfill({ json: { b: 1 }, headers: cors })
      })
      await probe(page, `${sw} B route actuelle`, 'https://diag-b.e2e.test/v2/x', AUTH)
      await probe(page, `${sw} B simple GET`, 'https://diag-b.e2e.test/ping', {})

      // C : vrai serveur local, sans interception.
      await probe(page, `${sw} C vrai serveur`, `${origin}/v2/x`, AUTH)

      // D : vrai serveur local, avec une route qui le simule.
      await page.route(`${origin}/**`, async (route) => {
        const r = route.request()
        seen.push(`D ${r.method()} auth=${r.headers().authorization ?? ''}`)
        await route.fulfill({
          status: r.method() === 'OPTIONS' ? 204 : 200,
          headers: {
            'access-control-allow-origin': r.headers().origin ?? '*',
            'access-control-allow-headers': r.headers()['access-control-request-headers'] ?? 'Authorization',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
          },
          body: r.method() === 'OPTIONS' ? '' : '{"routed":true}',
        })
      })
      await probe(page, `${sw} D serveur + route`, `${origin}/v2/y`, AUTH)

      // E : POST JSON vers Anthropic simulé, comme le SDK.
      await page.route('https://api.anthropic.com/**', async (route) => {
        const r = route.request()
        seen.push(`E ${r.method()} key=${r.headers()['x-api-key'] ?? ''}`)
        await route.fulfill({
          status: r.method() === 'OPTIONS' ? 204 : 200,
          headers: {
            'access-control-allow-origin': r.headers().origin ?? '*',
            'access-control-allow-headers': r.headers()['access-control-request-headers'] ?? '*',
            'access-control-allow-methods': 'GET, POST, OPTIONS',
          },
          body: r.method() === 'OPTIONS' ? '' : '{"data":[]}',
        })
      })
      await probe(page, `${sw} E anthropic`, 'https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': 'sk-ant-x', 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      })

      console.log(`DIAG ${sw} seen: ${JSON.stringify(seen)}`)
      console.log(`DIAG ${sw} real server hits: ${JSON.stringify(hits.splice(0))}`)
    })
  })
}
