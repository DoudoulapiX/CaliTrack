import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { RELAY_ID, relayWorkerCode } from './relay'

const APP = 'https://doudoulapix.github.io'

const folders: string[] = []
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

interface Worker {
  fetch(request: Request): Promise<Response>
}

/** Le relais tel qu'il tournera chez Cloudflare : le code produit, chargé comme un module. */
async function loadWorker(): Promise<Worker> {
  // Dans le projet (dossier ignoré par git) : l'outil de test ne charge pas de module hors du projet.
  const root = join(process.cwd(), 'node_modules', '.tmp')
  mkdirSync(root, { recursive: true })
  const folder = mkdtempSync(join(root, 'relais-'))
  folders.push(folder)
  const file = join(folder, 'worker.mjs')
  writeFileSync(file, relayWorkerCode(APP))
  const module = (await import(/* @vite-ignore */ file)) as { default: Worker }
  return module.default
}

describe('relais Oura', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('transmet une lecture à Oura avec le jeton, et l’autorise pour l’appli', async () => {
    const upstream = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('{"data":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    vi.stubGlobal('fetch', upstream)
    const worker = await loadWorker()
    const answer = await worker.fetch(
      new Request('https://relais.example.workers.dev/v2/usercollection/daily_sleep?start_date=2026-10-01', {
        headers: { Origin: APP, Authorization: 'Bearer jeton' },
      }),
    )
    expect(answer.status).toBe(200)
    expect(answer.headers.get('Access-Control-Allow-Origin')).toBe(APP)
    expect(await answer.text()).toBe('{"data":[]}')
    expect(upstream).toHaveBeenCalledWith(
      'https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=2026-10-01',
      { headers: { Authorization: 'Bearer jeton' } },
    )
  })

  it('se présente à l’appli qui le vérifie', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const worker = await loadWorker()
    const answer = await worker.fetch(
      new Request('https://relais.example.workers.dev/ping', { headers: { Origin: APP } }),
    )
    expect(answer.status).toBe(200)
    expect(answer.headers.get('Access-Control-Allow-Origin')).toBe(APP)
    expect(await answer.text()).toBe(RELAY_ID)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('répond aux vérifications préalables du navigateur', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const worker = await loadWorker()
    const answer = await worker.fetch(
      new Request('https://relais.example.workers.dev/v2/usercollection/sleep', {
        method: 'OPTIONS',
        headers: { Origin: APP },
      }),
    )
    expect(answer.status).toBe(204)
    expect(answer.headers.get('Access-Control-Allow-Headers')).toBe('Authorization')
  })

  it('refuse les autres sites, les écritures et les autres adresses', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const worker = await loadWorker()
    const url = 'https://relais.example.workers.dev'
    const other = await worker.fetch(
      new Request(`${url}/v2/usercollection/sleep`, { headers: { Origin: 'https://ailleurs.example' } }),
    )
    expect(other.status).toBe(403)
    const post = await worker.fetch(
      new Request(`${url}/v2/usercollection/sleep`, { method: 'POST', headers: { Origin: APP } }),
    )
    expect(post.status).toBe(404)
    const outside = await worker.fetch(
      new Request(`${url}/v2/webhook/subscription`, { headers: { Origin: APP } }),
    )
    expect(outside.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })
})
