import { expect, test, type Route } from '@playwright/test'
import { collectErrors, jpegSize, onboard, solidPng } from './nutrition-helpers'

const KEY = 'sk-ant-api03-e2e-0123456789abcdefghij'

/** L'estimation enregistrée de Claude pour une assiette (poulet, riz). */
const ESTIMATE = {
  isMeal: true,
  problem: '',
  items: [
    { name: 'Blanc de poulet grillé', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4 },
    { name: 'Riz blanc cuit', grams: 180, kcal: 234, protein: 4.9, carbs: 51.8, fat: 0.5 },
  ],
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}

test('photo du repas : clé enregistrée, photo réduite et envoyée, aliments ajoutés', async ({ page }) => {
  const errors = collectErrors(page)
  await page.clock.setFixedTime(new Date('2026-10-21T20:00:00+02:00'))
  const sent: { url: string; key: string | null; body: unknown }[] = []
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    sent.push({
      url: request.url(),
      key: request.headers()['x-api-key'] ?? null,
      body: request.postDataJSON(),
    })
    const body = request.url().includes('/v1/models')
      ? { data: [], has_more: false, first_id: null, last_id: null }
      : {
          id: 'msg_e2e',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [{ type: 'text', text: JSON.stringify(ESTIMATE) }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 1900, output_tokens: 400 },
        }
    return route.fulfill({ json: body, headers: CORS })
  })
  await onboard(page)

  // La clé, collée dans les réglages de l'IA.
  await page.goto('more/ai')
  await page.getByLabel('Clé API Claude').fill(KEY)
  await page.getByRole('button', { name: 'Enregistrer la clé' }).click()
  await expect(page.getByText('sk-ant-…ghij')).toBeVisible()

  // Une grande photo (4032 × 3024, comme un iPhone), réduite avant l'envoi.
  await page.goto('nutrition/photo?meal=dinner')
  await page.getByLabel('Prendre ou choisir une photo').setInputFiles({
    name: 'IMG_0001.png',
    mimeType: 'image/png',
    buffer: solidPng(4032, 3024, [200, 140, 60]),
  })
  await expect(page.getByRole('img', { name: 'Ta photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Analyser la photo' }).click()
  const list = page.getByRole('list', { name: 'Aliments reconnus' })
  await expect(list.getByRole('button')).toHaveCount(2)

  const message = sent.find((request) => request.url.endsWith('/v1/messages'))
  expect(message?.key).toBe(KEY)
  const content = (
    message?.body as { messages: { content: { source?: { data: string; media_type: string } }[] }[] }
  ).messages[0]?.content[0]?.source
  expect(content?.media_type).toBe('image/jpeg')
  expect(jpegSize(Buffer.from(content?.data ?? '', 'base64'))).toEqual({ width: 1280, height: 960 })

  await page.getByRole('button', { name: 'Ajouter 2 aliments au dîner' }).click()
  await expect(page.getByText('2 aliments ajoutés au dîner')).toBeVisible()
  const dinner = page.getByRole('list', { name: 'Dîner' })
  await expect(dinner.getByRole('button')).toHaveCount(2)
  await expect(dinner.getByRole('button', { name: /^Riz blanc cuit\s*180\sg · 234\skcal$/ })).toBeVisible()
  expect(errors).toEqual([])
})
