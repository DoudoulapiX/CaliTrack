import { expect, test } from '@playwright/test'
import { CLAUDE_KEY, collectErrors, fakeClaude, jpegSize, onboard, solidPng } from './nutrition-helpers'

// Sous WebKit, page.route ne voit pas les requêtes d'une page que le service worker contrôle : les
// services simulés (Open Food Facts, Claude, Oura) exigent de le bloquer.
test.use({ serviceWorkers: 'block' })

test('photo du repas : clé enregistrée, photo réduite et envoyée, aliments ajoutés', async ({ page }) => {
  const errors = collectErrors(page)
  await page.clock.setFixedTime(new Date('2026-10-21T20:00:00+02:00'))
  const sent = await fakeClaude(page)
  await onboard(page)

  // La clé, collée dans les réglages de l'IA.
  await page.goto('more/ai')
  await page.getByLabel('Clé API Claude').fill(CLAUDE_KEY)
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
  expect(message?.key).toBe(CLAUDE_KEY)
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
