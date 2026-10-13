import { crc32, deflateSync } from 'node:zlib'
import { expect, type Page, type Route } from '@playwright/test'

/** Réponse d'Open Food Facts pour une pâte à tartiner (extrait). */
export const NUTELLA_PRODUCT = {
  code: '3017620422003',
  status: 1,
  product: {
    product_name_fr: 'Pâte à tartiner aux noisettes',
    brands: 'Nutella, Ferrero',
    serving_quantity: '15',
    nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
  },
}

/** Une clé Claude d'essai (l'API est simulée). */
export const CLAUDE_KEY = 'sk-ant-api03-e2e-0123456789abcdefghij'

/** L'estimation enregistrée de Claude pour une assiette (poulet, riz). */
export const PLATE_ESTIMATE = {
  isMeal: true,
  problem: '',
  items: [
    { name: 'Blanc de poulet grillé', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 },
    { name: 'Riz blanc cuit', grams: 180, kcal: 234, protein: 4.9, carbs: 51.8, fat: 0.5 },
  ],
}

const CLAUDE_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

/** Les demandes faites à Claude par l'appli, reconnues à la forme de réponse demandée. */
export type ClaudeTask = 'meal' | 'daily' | 'body' | 'fridge' | 'ideas' | 'chat'

/** Une demande envoyée à l'API simulée. */
export interface SentToClaude {
  url: string
  key: string | null
  body: unknown
  /** La demande reconnue ; null pour la liste des modèles ou une demande inconnue. */
  task: ClaudeTask | null
}

/** Une erreur de l'API à renvoyer à la place d'une réponse (voir claudeError). */
interface ClaudeError {
  claudeError: { status: number; type: string }
}

/**
 * La réponse de l'API simulée pour une demande : un objet (sortie structurée, envoyé en JSON), un texte
 * (discussion), une erreur (claudeError), ou une fonction qui la calcule d'après la demande reçue.
 */
export type ClaudeAnswer = unknown

/** Une erreur de l'API (`overloaded_error`, `authentication_error`…), sans nouvel essai. */
export function claudeError(status: number, type: string): ClaudeError {
  return { claudeError: { status, type } }
}

const isClaudeError = (answer: unknown): answer is ClaudeError =>
  typeof answer === 'object' && answer !== null && 'claudeError' in answer

/** La demande faite, d'après les champs de la réponse structurée demandée (sans format : la discussion). */
export function claudeTaskOf(body: unknown): ClaudeTask | null {
  const request = body as { output_config?: { format?: { schema?: { properties?: object } } } } | null
  const format = request?.output_config?.format
  if (!format) return 'chat'
  const keys = Object.keys(format.schema?.properties ?? {})
  if (keys.includes('isMeal')) return 'meal'
  if (keys.includes('decision')) return 'daily'
  if (keys.includes('bodyFatLow')) return 'body'
  if (keys.includes('ideas')) return 'ideas'
  if (keys.includes('readable') && keys.includes('items')) return 'fridge'
  return null
}

const USAGE = {
  input_tokens: 1900,
  output_tokens: 400,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

/** Le message complet de l'API dont le texte est `text`. */
function claudeMessage(text: string) {
  return {
    id: 'msg_e2e',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: USAGE,
  }
}

/** Le même message en flux (server-sent events), envoyé d'un bloc : le texte arrive en trois morceaux. */
export function sseBody(text: string): string {
  const size = Math.max(1, Math.ceil(text.length / 3))
  const pieces = [0, 1, 2].map((i) => text.slice(i * size, (i + 1) * size)).filter((piece) => piece !== '')
  const events: { type: string; [key: string]: unknown }[] = [
    {
      type: 'message_start',
      message: {
        ...claudeMessage(''),
        content: [],
        stop_reason: null,
        usage: { ...USAGE, output_tokens: 1 },
      },
    },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...pieces.map((piece) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: piece },
    })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: USAGE },
    { type: 'message_stop' },
  ]
  return events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('')
}

/**
 * L'API Claude simulée : la clé est acceptée, chaque demande reçoit la réponse prévue pour elle (l'assiette
 * de PLATE_ESTIMATE pour une photo de repas, sauf autre réponse donnée), en flux quand l'appli le demande.
 * Une demande sans réponse prévue reçoit une erreur 400. Note chaque demande.
 */
export async function fakeClaude(page: Page, answers: Partial<Record<ClaudeTask, ClaudeAnswer>> = {}) {
  const planned: Partial<Record<ClaudeTask, ClaudeAnswer>> = { meal: PLATE_ESTIMATE, ...answers }
  const sent: SentToClaude[] = []
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CLAUDE_CORS })
    const body: unknown = request.postDataJSON()
    const isModels = request.url().includes('/v1/models')
    const task = isModels ? null : claudeTaskOf(body)
    sent.push({ url: request.url(), key: request.headers()['x-api-key'] ?? null, body, task })
    if (isModels) {
      return route.fulfill({
        json: { data: [], has_more: false, first_id: null, last_id: null },
        headers: CLAUDE_CORS,
      })
    }
    const plan = task === null ? undefined : planned[task]
    const answer: unknown = typeof plan === 'function' ? (plan as (body: unknown) => unknown)(body) : plan
    if (answer === undefined || isClaudeError(answer)) {
      const error = isClaudeError(answer)
        ? answer.claudeError
        : { status: 400, type: 'invalid_request_error' }
      return route.fulfill({
        status: error.status,
        json: { type: 'error', error: { type: error.type, message: 'Erreur simulée' } },
        headers: { ...CLAUDE_CORS, 'x-should-retry': 'false' },
      })
    }
    const text = typeof answer === 'string' ? answer : JSON.stringify(answer)
    if ((body as { stream?: unknown } | null)?.stream === true) {
      return route.fulfill({
        status: 200,
        headers: { ...CLAUDE_CORS, 'content-type': 'text/event-stream' },
        body: sseBody(text),
      })
    }
    return route.fulfill({ json: claudeMessage(text), headers: CLAUDE_CORS })
  })
  return sent
}

/** Les erreurs de la page (exceptions et console), qui doivent rester vides. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

/** Premier lancement rapide : 30 ans, 1,80 m, 80 kg, le reste par défaut. */
export async function onboard(page: Page): Promise<void> {
  await page.goto('./')
  await page.getByRole('button', { name: 'Commencer' }).click()
  await page.getByLabel('Année de naissance').fill('1996')
  await page.getByLabel('Taille').fill('180')
  await page.getByLabel('Poids').fill('80')
  for (let step = 0; step < 4; step++) await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Terminer' }).click()
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible()
}

/** Une image PNG unie de la taille voulue, fabriquée sans bibliothèque (pour simuler une photo). */
export function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // 8 bits par couleur
  header[9] = 2 // RVB
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Largeur et hauteur d'un JPEG, lues dans son en-tête (marqueur SOF). */
export function jpegSize(jpeg: Buffer): { width: number; height: number } | null {
  let offset = 2
  while (offset + 9 < jpeg.length) {
    if (jpeg[offset] !== 0xff) return null
    const marker = jpeg[offset + 1] ?? 0
    const length = jpeg.readUInt16BE(offset + 2)
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: jpeg.readUInt16BE(offset + 5), width: jpeg.readUInt16BE(offset + 7) }
    }
    offset += 2 + length
  }
  return null
}
